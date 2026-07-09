import { generate, extractJson, MODELS, hasKey } from "../gemini";
import { chunkExtractionPrompt } from "../prompts";
import { isGrounded, valueInSource, numericCore } from "./ground";
import { canonDataset, canonMetric } from "../graph";
import type { Claim, Conditions } from "../types";

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
  };
}

const OLLAMA = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";
const OLLAMA_MODEL = process.env.OLLAMA_GEMMA_MODEL || "gemma4:e4b";

async function ollamaReachable(): Promise<boolean> {
  try {
    const r = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}

async function ollamaExtract(prompt: string): Promise<unknown> {
  const res = await fetch(`${OLLAMA}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      format: "json",
      stream: false,
      options: { temperature: 0.2, num_ctx: 8192, num_predict: 1600 },
    }),
    signal: AbortSignal.timeout(120_000),
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

/** Section-aware chunks, results/experiments first, long sections split. */
function buildChunks(
  sections: ExtractSection[],
  maxChunks: number,
  chunkChars: number
): ExtractSection[] {
  const priority = /result|experiment|evaluation|benchmark|comparison|ablation|table|main|abstract/i;
  const ordered = [
    ...sections.filter((s) => priority.test(s.heading)),
    ...sections.filter((s) => !priority.test(s.heading)),
  ];
  const chunks: ExtractSection[] = [];
  for (const s of ordered) {
    if (chunks.length >= maxChunks) break;
    const t = s.text.trim();
    if (t.length <= chunkChars) {
      if (t.length > 40) chunks.push({ heading: s.heading, text: t });
    } else {
      for (let i = 0; i < t.length && chunks.length < maxChunks; i += chunkChars) {
        chunks.push({ heading: s.heading, text: t.slice(i, i + chunkChars) });
      }
    }
  }
  return chunks.slice(0, maxChunks);
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
    const dataset = str(r.dataset).trim() || inferDataset(inferText);
    const metric = str(r.metric).trim() || inferMetric(inferText, dataset);
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
    // A grounded value is the strongest identity (folds "error rate 3.57%" and
    // "top-5 error 3.57%"); value-less claims fall back to the self-reference-
    // normalized text so "we …" and "<method> …" phrasings collapse (Fix 3).
    const tail =
      numericCore(c.result_value) || dedupSignature(c.claim_text, system);
    const key = `${canonDataset(c.dataset)}|${canonMetric(c.metric)}|${tail}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * Phase 2 extractor: Gemma-local-first, decomposed per section-aware chunk,
 * every claim span-grounded, low-yield chunks escalated to Gemini Flash.
 */
export async function extractClaims(
  input: ExtractInput,
  opts: ExtractOptions = {}
): Promise<ExtractResult> {
  const maxChunks = opts.maxChunks ?? 6;
  const chunkChars = opts.chunkChars ?? 3000;
  const escalate = opts.escalate ?? true;

  const useOllama =
    opts.backend === "hosted"
      ? false
      : opts.backend === "ollama"
      ? true
      : await ollamaReachable();
  const primaryTier: NonNullable<Claim["extractor"]> = useOllama
    ? "gemma-on-device"
    : "gemma-hosted";

  const chunks = buildChunks(input.sections, maxChunks, chunkChars);
  const all: Claim[] = [];
  const stats = { chunks: chunks.length, raw: 0, grounded: 0, escalated: 0, backend: useOllama ? "ollama:" + OLLAMA_MODEL : "hosted" };

  for (const ch of chunks) {
    const prompt = chunkExtractionPrompt(input.title, ch.heading, ch.text);
    let raw: RawChunkClaim[] = [];
    try {
      raw = parseRaw(useOllama ? await ollamaExtract(prompt) : await geminiExtract(prompt));
    } catch {
      raw = [];
    }
    stats.raw += raw.length;
    let grounded = groundChunk(raw, ch.text, input.paperId, primaryTier);

    // Escalate a starved chunk to Gemini Flash (only that chunk).
    if (grounded.length === 0 && escalate && hasKey() && useOllama) {
      try {
        const g2 = parseRaw(await geminiExtract(prompt));
        stats.raw += g2.length;
        grounded = groundChunk(g2, ch.text, input.paperId, "gemini-escalated");
        if (grounded.length) stats.escalated++;
      } catch {
        /* leave empty */
      }
    }
    all.push(...grounded);
  }

  const claims = dedup(all, paperSystemName(all, input.title));
  stats.grounded = claims.length;
  return { claims, tier: primaryTier, stats };
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
