import { generate, extractJson, MODELS } from "./gemini";
import { extractionPrompt } from "./prompts";
import type { Claim, Conditions } from "./types";

type RawClaim = {
  claim_text?: string;
  task?: string;
  dataset?: string;
  metric?: string;
  result_value?: string;
  result_confidence?: string;
  conditions?: Partial<Conditions>;
  source_span?: { page?: number; text?: string };
};

function coerceConfidence(v: unknown): Claim["result_confidence"] {
  const s = typeof v === "string" ? v.toLowerCase() : "";
  return s === "high" || s === "low" ? (s as Claim["result_confidence"]) : "medium";
}

function coerceConditions(c: Partial<Conditions> = {}): Conditions {
  const s = (x: unknown) =>
    typeof x === "string" && x.trim() && x.trim() !== "null" ? x.trim() : null;
  return {
    train_test_split: s(c.train_test_split),
    sample_size: s(c.sample_size),
    hyperparameters: s(c.hyperparameters),
    preprocessing: s(c.preprocessing),
    other: s(c.other),
  };
}

export function normalizeClaims(
  raw: unknown,
  paperId: string,
  extractor: Claim["extractor"]
): Claim[] {
  // Small models return inconsistent shapes: a bare array, a {claims:[...]}
  // wrapper, a single claim object, or {results:[...]} / {data:[...]}. Handle all.
  let arr: RawClaim[] = [];
  if (Array.isArray(raw)) {
    arr = raw;
  } else if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    const arrayVal = Object.values(obj).find((v) => Array.isArray(v)) as
      | RawClaim[]
      | undefined;
    if (arrayVal) {
      arr = arrayVal;
    } else if (
      "claim_text" in obj ||
      "result_value" in obj ||
      "metric" in obj ||
      "dataset" in obj
    ) {
      // A single claim object.
      arr = [obj as RawClaim];
    }
  }
  const out: Claim[] = [];
  for (const r of arr) {
    if (!r || (!r.result_value && !r.metric && !r.dataset)) continue;
    out.push({
      claim_id: `claim-${crypto.randomUUID().slice(0, 8)}`,
      paper_id: paperId,
      claim_text: (r.claim_text || "").trim() || "(no claim text)",
      task: (r.task || "").trim(),
      dataset: (r.dataset || "").trim(),
      metric: (r.metric || "").trim(),
      result_value: (r.result_value || "").trim(),
      result_confidence: coerceConfidence(r.result_confidence),
      conditions: coerceConditions(r.conditions),
      source_span: {
        page: Number(r.source_span?.page) || 1,
        text: (r.source_span?.text || "").trim(),
      },
      extractor,
    });
  }
  return out;
}

/** Call a local Gemma via Ollama (true on-device path). */
async function extractViaOllama(
  title: string,
  text: string
): Promise<unknown> {
  const host = process.env.OLLAMA_HOST!;
  const model = process.env.OLLAMA_GEMMA_MODEL || "gemma3:latest";
  // Small local models need an explicit context window (Ollama defaults to a
  // tiny one and silently truncates), and a shorter input to stay responsive.
  const res = await fetch(`${host}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt: extractionPrompt(title, text.slice(0, 9000)),
      format: "json",
      stream: false,
      options: { temperature: 0.2, num_ctx: 8192, num_predict: 2048 },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}`);
  const data = await res.json();
  return extractJson(data.response || "[]");
}

/** Call the hosted Gemma 4 endpoint. */
async function extractViaHostedGemma(
  title: string,
  text: string
): Promise<unknown> {
  // Cap the input to the high-yield region so the 31B model stays well under the
  // request timeout even on long papers (abstract + early results carry the
  // headline numeric claims).
  const { text: out } = await generate(
    MODELS.gemma(),
    extractionPrompt(title, text.slice(0, 12000)),
    { json: true, temperature: 0.2, maxOutputTokens: 5000 }
  );
  return extractJson(out);
}

export interface ExtractionOutcome {
  claims: Claim[];
  tier: NonNullable<Claim["extractor"]>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function extractClaimsForPaper(
  title: string,
  text: string,
  paperId: string
): Promise<ExtractionOutcome> {
  if (process.env.OLLAMA_HOST) {
    const raw = await extractViaOllama(title, text);
    return {
      claims: normalizeClaims(raw, paperId, "gemma-on-device"),
      tier: "gemma-on-device",
    };
  }

  // The free-tier key throttles bursts (returns empty). Retry with backoff so a
  // starved paper gets another shot once the window clears, instead of yielding
  // zero claims silently.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(3500 * attempt);
    try {
      const raw = await extractViaHostedGemma(title, text);
      const claims = normalizeClaims(raw, paperId, "gemma-hosted");
      if (claims.length > 0) return { claims, tier: "gemma-hosted" };
      lastErr = new Error("empty extraction");
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("extraction failed");
}
