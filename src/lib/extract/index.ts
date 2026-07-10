import { createHash } from "node:crypto";
import { generate, extractJson, MODELS, hasKey } from "../gemini";
import { chunkExtractionPrompt } from "../prompts";
import { isGrounded, valueInSource, numericCore } from "./ground";
import { mineResults, mineScalingExponents } from "./mine";
import {
  canonDataset,
  canonMetric,
  splitCompoundCoefficients,
  claimScalingRole,
} from "../graph";
import {
  OLLAMA_HOST,
  OLLAMA_MODEL,
  OLLAMA_KEEP_ALIVE,
  OLLAMA_CHUNK_TIMEOUT_MS,
  ollamaReachable,
} from "../ollama";
import type { Claim, Conditions } from "../types";

// Re-exported so existing importers (the /api/extract route) keep working.
export { warmOllama } from "../ollama";

export interface ExtractSection {
  heading: string;
  text: string;
}
export interface ExtractInput {
  title: string;
  paperId: string;
  sections: ExtractSection[];
}
export interface ExtractOptions {
  escalate?: boolean; // low-yield chunk → Gemini Flash (default true when key present)
  backend?: "auto" | "ollama" | "hosted";
  maxChunks?: number;
  chunkChars?: number;
  // "priority" (default): extract only from Abstract/Results/Discussion-class
  // sections — where headline numbers live — for a large latency win. "all":
  // include Methods/Intro too (higher recall of body-buried numbers, slower).
  sections?: "priority" | "all";
  // Per-chunk progress (Phase 5.2) — the route relays these as NDJSON so the UI
  // can show "chunk 3/8 · Results · 42s". `ms` is that chunk's wall-clock.
  onProgress?: (p: { done: number; total: number; heading: string; ms?: number }) => void;
  // Free-form status lines (Build 3: "retrying chunk 2 with expanded boundary").
  onStatus?: (message: string) => void;
  // Skip the content-hash idempotency cache (Phase 5.4) for this call.
  noCache?: boolean;
}
export interface ExtractResult {
  claims: Claim[];
  tier: NonNullable<Claim["extractor"]>;
  stats: {
    chunks: number;
    raw: number; // claims the model emitted
    grounded: number; // survived the span gate
    escalated: number; // chunks sent to Gemini
    backend: string;
    ms: number; // wall-clock for the extraction stage
    degraded: boolean; // on-device was requested/expected but we fell back
    cached: boolean; // served from the content-hash cache
    mined: number; // claims added by the deterministic pattern miner
    retried: number; // chunks retried locally on an expanded boundary (Build 3)
  };
}

async function ollamaExtract(prompt: string): Promise<unknown> {
  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      format: "json",
      stream: false,
      keep_alive: OLLAMA_KEEP_ALIVE,
      options: { temperature: 0.2, num_ctx: 8192, num_predict: 1600 },
    }),
    signal: AbortSignal.timeout(OLLAMA_CHUNK_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  const d = await res.json();
  return extractJson(d.response || "{}");
}

async function geminiExtract(prompt: string): Promise<unknown> {
  const { text } = await generate(MODELS.gemma(), prompt, {
    json: true,
    temperature: 0.2,
    maxOutputTokens: 3000,
  });
  return extractJson(text);
}

interface RawChunkClaim {
  claim_text?: string;
  task?: string;
  dataset?: string;
  metric?: string;
  result_value?: string;
  conditions?: string;
  about_system?: string;
  is_own_contribution?: boolean;
  provenance_span?: string;
}

/** Accept {reasoning,claims:[]}, a bare array, or a single object. */
function parseRaw(raw: unknown): RawChunkClaim[] {
  if (Array.isArray(raw)) return raw as RawChunkClaim[];
  if (raw && typeof raw === "object") {
    const o = raw as any;
    if (Array.isArray(o.claims)) return o.claims;
    const arr = Object.values(o).find((v) => Array.isArray(v));
    if (arr) return arr as RawChunkClaim[];
    if (o.claim_text || o.result_value || o.provenance_span) return [o];
  }
  return [];
}

const emptyConditions = (other: string | null): Conditions => ({
  train_test_split: null,
  sample_size: null,
  hyperparameters: null,
  preprocessing: null,
  other,
});

const PRIORITY_SECTION =
  /result|experiment|evaluation|benchmark|comparison|ablation|table|main|abstract|discussion|conclusion|summary|scaling|power law|optimal|approach|frontier/i;

/** A chunk plus its position in the source section (for boundary expansion). */
interface Chunk extends ExtractSection {
  src?: string;
  start?: number;
  end?: number;
}

/** Section-aware chunks, results/experiments first, long sections split. In
 * "priority" mode the non-priority (Methods/Intro/Related) sections are dropped
 * entirely — the headline numbers are almost never buried there, so this is the
 * main latency lever on a local model. */
function buildChunks(
  sections: ExtractSection[],
  maxChunks: number,
  chunkChars: number,
  mode: "priority" | "all"
): Chunk[] {
  const priority = PRIORITY_SECTION;
  const ordered =
    mode === "priority"
      ? sections.filter((s) => priority.test(s.heading))
      : [
          ...sections.filter((s) => priority.test(s.heading)),
          ...sections.filter((s) => !priority.test(s.heading)),
        ];
  const chunks: Chunk[] = [];
  for (const s of ordered) {
    if (chunks.length >= maxChunks) break;
    const t = s.text.trim();
    if (t.length <= chunkChars) {
      if (t.length > 40)
        chunks.push({ heading: s.heading, text: t, src: t, start: 0, end: t.length });
    } else {
      for (let i = 0; i < t.length && chunks.length < maxChunks; i += chunkChars) {
        chunks.push({
          heading: s.heading,
          text: t.slice(i, i + chunkChars),
          // Source offsets so a failed chunk can retry on an EXPANDED boundary
          // (Build 3): the section text and this slice's position within it.
          src: t,
          start: i,
          end: Math.min(t.length, i + chunkChars),
        });
      }
    }
  }
  return chunks.slice(0, maxChunks);
}

/** ~30% more surrounding context from the section for the local retry. */
function expandChunk(ch: Chunk): string {
  if (!ch.src || ch.start == null || ch.end == null) return ch.text;
  const pad = Math.round((ch.end - ch.start) * 0.15);
  return ch.src.slice(Math.max(0, ch.start - pad), Math.min(ch.src.length, ch.end + pad));
}

/** Ground raw claims against the chunk; drop ungrounded, sanitize values. */
// Small models sometimes emit numbers/objects where strings are expected.
const str = (v: unknown): string =>
  v == null ? "" : typeof v === "string" ? v : typeof v === "number" ? String(v) : "";

/** Derive the metric name from the claim/span when the model left it empty. */
export function inferMetric(text: string, dataset: string): string {
  const t = text.toLowerCase();
  if (/top-?5[^.]{0,20}(error|err)/.test(t)) return "top-5 error";
  if (/top-?1[^.]{0,20}(error|err)/.test(t)) return "top-1 error";
  if (/top-?5[^.]{0,20}acc/.test(t)) return "top-5 accuracy";
  if (/top-?1[^.]{0,20}acc/.test(t)) return "top-1 accuracy";
  if (/\bmiou\b|mean iou/.test(t)) return "mIoU";
  if (/\bmap\b|mean average precision|average precision/.test(t)) return "mAP";
  if (/\bbleu\b/.test(t)) return "BLEU";
  if (/\bf1\b/.test(t)) return "F1";
  if (/\bppl\b|perplexity/.test(t)) return "perplexity";
  const imagenet = /imagenet|ilsvrc/i.test(dataset) || /imagenet|ilsvrc/.test(t);
  if (/error rate|test error|classification error|\berror\b/.test(t))
    return imagenet ? "top-5 error" : "error rate";
  if (/\baccuracy\b/.test(t)) return imagenet ? "top-1 accuracy" : "accuracy";
  return "";
}

/** Derive the dataset/benchmark from context — only names literally in the text
 * (the span is grounded, so any filled name is source-grounded, not invented). */
export function inferDataset(text: string): string {
  const t = text.toLowerCase();
  if (/\bilsvrc\b|\bimagenet\b/.test(t)) return "ImageNet";
  if (/\bcifar-?100\b/.test(t)) return "CIFAR-100";
  if (/\bcifar-?10\b/.test(t)) return "CIFAR-10";
  if (/\bsvhn\b/.test(t)) return "SVHN";
  if (/\bcoco\b/.test(t)) return "COCO";
  if (/\bade20k\b/.test(t)) return "ADE20K";
  if (/\bcityscapes\b/.test(t)) return "Cityscapes";
  if (/\bpascal voc\b|\bvoc\s?200[0-9]\b/.test(t)) return "PASCAL VOC";
  if (/\bwmt\s?1[0-9]\b/.test(t)) return "WMT";
  return "";
}

/** Derive the task from dataset/metric/context when the model left it empty. */
export function inferTask(dataset: string, metric: string, text: string): string {
  const hay = `${dataset} ${metric} ${text}`.toLowerCase();
  if (/localis|localiz/.test(hay)) return "localization";
  if (/coco|\bmap\b|detection/.test(hay)) return "object detection";
  if (/ade20k|cityscapes|\bmiou\b|segmentation/.test(hay)) return "semantic segmentation";
  if (/wmt|\bbleu\b|translation/.test(hay)) return "machine translation";
  if (/squad|question/.test(hay)) return "question answering";
  if (/imagenet|ilsvrc|cifar|classification|top-?[15]/.test(hay)) return "image classification";
  return "";
}

function groundChunk(
  raw: RawChunkClaim[],
  chunkText: string,
  paperId: string,
  tier: NonNullable<Claim["extractor"]>
): Claim[] {
  const out: Claim[] = [];
  for (const r of raw) {
    const span = (str(r.provenance_span) || str(r.claim_text)).trim();
    if (!isGrounded(span, chunkText)) continue; // hallucination gate
    const valueRaw = str(r.result_value).trim();
    const valueGrounded = valueRaw ? valueInSource(valueRaw, chunkText) : false;
    // Never propagate a number that isn't in the source.
    const result_value = valueGrounded ? valueRaw : "";
    const claimTextRaw = (str(r.claim_text) || span).trim().slice(0, 300) || "(claim)";
    // Fill dataset/metric/task from context when the model left them empty
    // (Fix 1/3). Inference reads the grounded span, so any filled name is
    // source-grounded — a bare "7.3% top-5 error" claim whose dataset the model
    // dropped now resolves to ImageNet and can pair/dedup with its twin.
    const inferText = `${str(r.claim_text)} ${span} ${str(r.metric)}`;
    let dataset = str(r.dataset).trim() || inferDataset(inferText);
    const metric = str(r.metric).trim() || inferMetric(inferText, dataset);
    // "top-5 error" is an ImageNet/ILSVRC-scale convention (CIFAR-class tasks
    // report plain error). If the sentence gives that metric but names no
    // dataset ("…on the test set, configuration E achieves 7.3% top-5 error"),
    // attribute it to ImageNet — the same convention canonMetric uses for a
    // bare "error". The value/span stay grounded; only the dataset label is
    // inferred from the metric convention.
    if (!dataset && /top-?5\b/i.test(metric) && /err/i.test(metric)) dataset = "ImageNet";
    const task = str(r.task).trim() || inferTask(dataset, metric, inferText);
    if (!result_value && !dataset && !metric) continue; // nothing useful
    out.push({
      claim_id: `claim-${crypto.randomUUID().slice(0, 8)}`,
      paper_id: paperId,
      claim_text: claimTextRaw,
      task,
      dataset,
      metric,
      result_value,
      // Numeric results stay low-confidence by design (SciLead/AxCell); a
      // grounded number is at most "medium", an ungrounded/absent one "low".
      result_confidence: valueGrounded ? "medium" : "low",
      conditions: emptyConditions(str(r.conditions).trim() || null),
      source_span: { page: 0, text: span.slice(0, 400) },
      extractor: tier,
      grounded: true,
      about_system: str(r.about_system).trim() || undefined,
      // Default to own contribution unless the model explicitly flags a
      // third-party result (competitor/baseline) — those never form edges (Fix 4).
      is_own_contribution: r.is_own_contribution === false ? false : true,
    });
  }
  return out;
}

// Fix 3 — author self-reference. The same result is stated once as "we …" and
// once by the method name across two chunks; folding both to the paper's system
// name lets the value-less duplicates collapse.
const SELF_REF =
  /\b(we|our team|the authors['’]? team|the authors|our (?:approach|method|model|network|system|architecture|configurations?)|the proposed (?:method|model|network|architecture|approach)|this (?:work|paper|method|approach))\b/gi;

/** Most frequent own-contribution system name; falls back to the title token. */
export function paperSystemName(claims: Claim[], title = ""): string {
  const counts = new Map<string, number>();
  for (const c of claims) {
    if (c.is_own_contribution === false) continue;
    const k = (c.about_system || "").trim().toLowerCase();
    if (k) counts.set(k, (counts.get(k) || 0) + 1);
  }
  let best = "";
  let n = 0;
  for (const [k, v] of counts) if (v > n) [best, n] = [k, v];
  if (best) return best;
  const m = title.match(/[A-Za-z][A-Za-z0-9-]{2,}/);
  return (m ? m[0] : "this method").toLowerCase();
}

// Generic self-descriptors a paper uses for its OWN variants — not competitor
// names. A result "about" one of these is the paper's own, even when the
// sentence lacks "we"/"our" (which trips the model into flagging own=false).
const GENERIC_SELF =
  /\b(config|configuration|model|models|network|net|nets|architecture|setup|variant|version|single|multi|ensemble|our|ours|this|proposed|method|system)\b/i;

/**
 * Correct is_own_contribution after extraction (Fix 4 refinement). The model
 * over-triggers "third-party" on own results phrased without "we" (e.g. "…the
 * configuration E achieves 7.3% top-5 error"). Re-assert ownership when the
 * result is about the paper's own system or a generic self-descriptor; keep the
 * model's judgement only for genuinely NAMED external systems (GoogLeNet,
 * Clarifai), which is what should stay excluded from edges.
 */
export function reconcileOwnership(claims: Claim[], system: string): void {
  const sysTokens = system
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter((t) => t.length > 2);
  for (const c of claims) {
    const a = (c.about_system || "").toLowerCase().trim();
    if (!a) {
      c.is_own_contribution = true;
      continue;
    }
    const matchesSys = sysTokens.some((t) => a.includes(t));
    const generic = GENERIC_SELF.test(a) || /^[a-e]$/i.test(a);
    if (matchesSys || generic) c.is_own_contribution = true;
    // otherwise leave the model's value — a named competitor stays third-party.
  }
}

/** Order-preserving, self-reference-folded, lightly-stemmed dedup signature. */
export function dedupSignature(text: string, system: string): string {
  return (text || "")
    .toLowerCase()
    .replace(SELF_REF, system)
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t))
    .join(" ")
    .slice(0, 80);
}

function dedup(claims: Claim[], system: string): Claim[] {
  const seen = new Set<string>();
  const out: Claim[] = [];
  for (const c of claims) {
    // Scaling-law claims: same coefficient role + same value = same finding,
    // regardless of how the corpus slot was filled (a mined headline a=0.73
    // collapses with the LLM's phrasing of it) — one node per coefficient.
    const role = claimScalingRole(c);
    // A grounded value is the strongest identity (folds "error rate 3.57%" and
    // "top-5 error 3.57%"); value-less claims fall back to the self-reference-
    // normalized text so "we …" and "<method> …" phrasings collapse (Fix 3).
    const tail =
      numericCore(c.result_value) || dedupSignature(c.claim_text, system);
    const key = role
      ? `scaling|${role}|${tail}`.toLowerCase()
      : `${canonDataset(c.dataset)}|${canonMetric(c.metric)}|${tail}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

// Content-hash idempotency cache (Phase 5.4): the same paper text + options
// re-extracted (a retry, a re-upload, "Verify live" pressed twice) returns the
// prior result instantly instead of re-hitting the model.
const extractCache = new Map<string, ExtractResult>();
function contentKey(input: ExtractInput, opts: ExtractOptions): string {
  const body = input.sections.map((s) => `${s.heading}\n${s.text}`).join("\n\n");
  const cfg = `${opts.backend ?? "auto"}|${opts.sections ?? "priority"}|${opts.maxChunks ?? 6}|${opts.chunkChars ?? 3000}`;
  return createHash("sha256").update(`${input.title} ${cfg} ${body}`).digest("hex");
}

/**
 * Phase 2 extractor: Gemma-local-first, decomposed per section-aware chunk,
 * every claim span-grounded, low-yield chunks escalated to Gemini Flash.
 */
// Demo-day chunk budget: extraction cost is ~40-90s per chunk on local e4b and
// chunks run sequentially, so total latency ≈ papers × chunks × chunk-time.
// EXTRACT_MAX_CHUNKS=3 roughly halves a live upload; recall of headline numbers
// is protected by the results-first chunk ordering + the pattern miner.
const DEFAULT_MAX_CHUNKS = Number(process.env.EXTRACT_MAX_CHUNKS) || 6;

export async function extractClaims(
  input: ExtractInput,
  opts: ExtractOptions = {}
): Promise<ExtractResult> {
  const t0 = Date.now();
  const maxChunks = opts.maxChunks ?? DEFAULT_MAX_CHUNKS;
  const chunkChars = opts.chunkChars ?? 3000;
  const escalate = opts.escalate ?? true;
  const sectionMode = opts.sections ?? "priority";

  const cacheKey = opts.noCache ? "" : contentKey(input, opts);
  if (cacheKey) {
    const hit = extractCache.get(cacheKey);
    if (hit) {
      opts.onProgress?.({ done: hit.stats.chunks, total: hit.stats.chunks, heading: "cached" });
      return { ...hit, stats: { ...hit.stats, cached: true, ms: Date.now() - t0 } };
    }
  }

  const useOllama =
    opts.backend === "hosted"
      ? false
      : opts.backend === "ollama"
      ? true
      : await ollamaReachable();
  const primaryTier: NonNullable<Claim["extractor"]> = useOllama
    ? "gemma-on-device"
    : "gemma-hosted";

  // Priority-only sections for latency; if a paper exposes none (odd headings),
  // fall back to all sections so we never extract from nothing.
  let chunks = buildChunks(input.sections, maxChunks, chunkChars, sectionMode);
  if (chunks.length === 0 && sectionMode === "priority") {
    chunks = buildChunks(input.sections, maxChunks, chunkChars, "all");
  }
  const all: Claim[] = [];
  const stats = {
    chunks: chunks.length,
    raw: 0,
    grounded: 0,
    escalated: 0,
    backend: useOllama ? "ollama:" + OLLAMA_MODEL : "hosted",
    ms: 0,
    degraded: false,
    cached: false,
    mined: 0,
    retried: 0,
  };

  let done = 0;
  for (const ch of chunks) {
    const tChunk = Date.now();
    const prompt = chunkExtractionPrompt(input.title, ch.heading, ch.text);
    let raw: RawChunkClaim[] = [];
    let chunkFailed = false;
    try {
      raw = parseRaw(useOllama ? await ollamaExtract(prompt) : await geminiExtract(prompt));
    } catch {
      raw = [];
      chunkFailed = true; // timeout / model down — degrade for this chunk
    }
    stats.raw += raw.length;
    let grounded = groundChunk(raw, ch.text, input.paperId, primaryTier);

    // Build 3 — LOCAL recovery first: a starved/failed chunk retries ONCE
    // on-device with ~30% more surrounding context before any cloud escalation
    // or skip. e4b is nondeterministic chunk-to-chunk, so a boundary-expanded
    // retry legitimately recovers claims the first pass missed.
    if (grounded.length === 0 && useOllama) {
      const wider = expandChunk(ch);
      const expanded = wider.length > ch.text.length;
      opts.onStatus?.(
        `Retrying chunk ${done + 1}/${chunks.length} (${ch.heading || "body"})${
          expanded ? " with expanded boundary" : ""
        }…`
      );
      stats.retried++;
      try {
        const r2 = parseRaw(
          await ollamaExtract(chunkExtractionPrompt(input.title, ch.heading, wider))
        );
        stats.raw += r2.length;
        // Ground against the SAME expanded text the model saw (span gate).
        grounded = groundChunk(r2, wider, input.paperId, primaryTier);
      } catch {
        /* retry failed — fall through to escalation/skip */
      }
      if (grounded.length === 0) {
        opts.onStatus?.(
          `Chunk ${done + 1}/${chunks.length} deferred — no grounded claims in expanded boundary`
        );
      }
    }

    // Escalate a starved OR failed chunk to Gemini Flash (only that chunk). This
    // is the graceful-degradation path (Phase 5.3): if on-device stalls, the
    // hosted tier covers the chunk instead of dropping it.
    if (grounded.length === 0 && escalate && hasKey() && useOllama) {
      try {
        const g2 = parseRaw(await geminiExtract(prompt));
        stats.raw += g2.length;
        grounded = groundChunk(g2, ch.text, input.paperId, "gemini-escalated");
        if (grounded.length) stats.escalated++;
        if (chunkFailed) stats.degraded = true;
      } catch {
        /* leave empty */
      }
    }
    if (chunkFailed && grounded.length === 0) stats.degraded = true;
    all.push(...grounded);
    // Increment OUTSIDE the optional call — `?.()` short-circuits argument
    // evaluation, so a caller without onProgress must not stall the counter.
    done += 1;
    opts.onProgress?.({
      done,
      total: chunks.length,
      heading: ch.heading || "body",
      ms: Date.now() - tChunk,
    });
  }

  // Deterministic pattern safety net — regex only, no model call, so it runs
  // over EVERY section regardless of the LLM chunk budget (a headline buried
  // past MAX_CHUNKS is still caught). Covers benchmark errors AND scaling-law
  // exponents (one claim per coefficient); own-results only.
  for (const s of input.sections) {
    const mined = [
      ...mineResults(s.text, input.paperId, primaryTier),
      ...mineScalingExponents(s.text, input.paperId, primaryTier),
    ];
    stats.mined += mined.length;
    all.push(...mined);
  }

  const system = paperSystemName(all, input.title);
  reconcileOwnership(all, system); // fix over-flagged own results before edges
  // One node per coefficient: split compound scaling claims BEFORE dedup so a
  // split child and a mined twin (same role+value) collapse to one claim.
  const claims = dedup(splitCompoundCoefficients(all), system);
  stats.grounded = claims.length;
  stats.ms = Date.now() - t0;
  const result = { claims, tier: primaryTier, stats };
  if (cacheKey) extractCache.set(cacheKey, result);
  return result;
}

/** Convenience wrapper for plain text (eval / single-section callers). */
export async function extractClaimsFromText(
  title: string,
  text: string,
  paperId: string,
  opts: ExtractOptions = {}
): Promise<ExtractResult> {
  return extractClaims({ title, paperId, sections: [{ heading: "", text }] }, opts);
}
