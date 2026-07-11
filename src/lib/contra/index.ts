import { canonDataset, canonMetric, scalingRole } from "../graph";
import { generate, extractJson, MODELS, hasKey } from "../gemini";
import { adjudicationPrompt } from "../prompts";
import { numericCore } from "../extract/ground";
import { OLLAMA_HOST, OLLAMA_MODEL, OLLAMA_KEEP_ALIVE } from "../ollama";
import type { Reconciliation, Verdict } from "../types";

export type ContraReason =
  | "genuine_contradiction"
  | "different_conditions"
  | "different_population"
  | "different_metric"
  | "only_hedging_differs"
  | "not_comparable"
  | "agreement";

export interface AdjClaim {
  dataset?: string;
  metric?: string;
  result_value?: string;
  conditions?: string;
  result_confidence?: string;
  /** Full claim sentence — carries the equation for scaling-law claims. */
  claim_text?: string;
}

async function ollamaReachable(): Promise<boolean> {
  try {
    const r = await fetch(`${OLLAMA_HOST}/api/tags`, { signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}
async function ollamaAdj(prompt: string): Promise<any> {
  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      format: "json",
      stream: false,
      keep_alive: OLLAMA_KEEP_ALIVE,
      options: { temperature: 0.1, num_ctx: 4096, num_predict: 900 },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  const d = await res.json();
  return extractJson(d.response || "{}");
}
async function geminiAdj(prompt: string): Promise<any> {
  const { text } = await generate(MODELS.reconcile(), prompt, {
    json: true,
    temperature: 0.2,
    maxOutputTokens: 1200,
  });
  return extractJson(text);
}

/** Deterministic precision guard: never call different metric/dataset a contradiction. */
export function hardGuard(a: AdjClaim, b: AdjClaim): ContraReason | null {
  // Scaling-law pairs: two claims about the SAME coefficient role in a power
  // law over compute (Kaplan a=0.73 vs Chinchilla a≈0.50) are comparable by
  // construction — the differing training corpus (WebText2 vs MassiveText) is
  // a CONDITION for the adjudicator to weigh, not an identity mismatch. Both
  // sides must confidently detect the same role; anything else falls through
  // to the normal benchmark guards.
  const roleA =
    scalingRole(a.metric || "") || scalingRole(`${a.metric || ""} ${a.claim_text || ""}`);
  const roleB =
    scalingRole(b.metric || "") || scalingRole(`${b.metric || ""} ${b.claim_text || ""}`);
  if (roleA && roleA === roleB) return null;
  if (canonMetric(a.metric || "") !== canonMetric(b.metric || "")) return "different_metric";
  if (canonDataset(a.dataset || "") !== canonDataset(b.dataset || "")) return "not_comparable";
  return null;
}

const REASON_TO_VERDICT: Record<ContraReason, Verdict> = {
  genuine_contradiction: "GENUINE_CONTRADICTION",
  agreement: "AGREEMENT",
  different_conditions: "CONTEXT_CONDITIONED_DIVERGENCE",
  different_population: "CONTEXT_CONDITIONED_DIVERGENCE",
  different_metric: "CONTEXT_CONDITIONED_DIVERGENCE",
  only_hedging_differs: "CONTEXT_CONDITIONED_DIVERGENCE",
  not_comparable: "CONTEXT_CONDITIONED_DIVERGENCE",
};

export interface AdjResult {
  reconciliation: Reconciliation;
  reason: ContraReason;
  likert: number;
  comparable: boolean;
  engine: string;
}

/**
 * Precision-first adjudication:
 *  1. deterministic hard guard (metric/dataset) → never a contradiction;
 *  2. strict LLM adjudicator (Gemma-local first, Gemini escalation) with an
 *     11-point Likert; genuine only at likert >= 8 AND reason=genuine;
 *  3. low-confidence-number guard: two low-confidence values can't make a
 *     genuine contradiction on their own.
 */
export async function adjudicate(
  a: AdjClaim,
  b: AdjClaim,
  opts: { threshold?: number; backend?: "auto" | "local" | "cloud" } = {}
): Promise<AdjResult> {
  const threshold = opts.threshold ?? 8;

  const guard = hardGuard(a, b);
  if (guard) {
    return {
      reason: guard,
      likert: 1,
      comparable: false,
      engine: "guard",
      reconciliation: {
        verdict: REASON_TO_VERDICT[guard],
        confidence: 0.85,
        reasoning: `Deterministic guard: the two results are not directly comparable (${guard.replace(/_/g, " ")}); not a contradiction.`,
        differing_conditions: [guard.replace(/_/g, " ")],
        shared_conditions: [],
        needs_human_review: false,
      },
    };
  }

  const prompt = adjudicationPrompt(a, b);
  let raw: any = {};
  let engine = "";
  // Reconciliation is the orchestration tier → Gemini leads (it reliably spots
  // matched-condition contradictions); local Gemma is the offline fallback.
  // The deterministic guard + Likert threshold + low-confidence guard below keep
  // precision regardless of which model answers.
  // Backend selection: an explicit per-call mode (the UI's hard selector)
  // beats the env default. "local" = on-device only, no cloud attempt;
  // "cloud" = Gemini first even when the env says local; "auto"/unset = env.
  const localOnly =
    opts.backend === "local" ||
    (opts.backend !== "cloud" && process.env.RECONCILE_BACKEND === "local");
  try {
    if (!localOnly && hasKey()) {
      raw = await geminiAdj(prompt);
      engine = "gemini";
    } else if (await ollamaReachable()) {
      raw = await ollamaAdj(prompt);
      engine = "gemma:" + OLLAMA_MODEL;
    }
  } catch {
    try {
      if (await ollamaReachable()) {
        raw = await ollamaAdj(prompt);
        engine = "gemma-fallback:" + OLLAMA_MODEL;
      }
    } catch {
      /* empty */
    }
  }

  let reason: ContraReason = [
    "genuine_contradiction",
    "different_conditions",
    "different_population",
    "different_metric",
    "only_hedging_differs",
    "not_comparable",
    "agreement",
  ].includes(raw?.reason)
    ? raw.reason
    : "different_conditions";
  const likert = Math.max(0, Math.min(10, Number(raw?.likert) || 0));

  // Threshold + low-confidence-number guard.
  const bothLowConf =
    a.result_confidence === "low" && b.result_confidence === "low";
  let needsReview = Boolean(raw?.needs_human_review);
  if (reason === "genuine_contradiction") {
    if (likert < threshold) reason = "different_conditions";
    else if (bothLowConf) {
      // Never assert a contradiction on two low-confidence numbers alone.
      reason = "different_conditions";
      needsReview = true;
    } else if (a.result_confidence === "low" || b.result_confidence === "low") {
      needsReview = true;
    }
  }

  const verdict = REASON_TO_VERDICT[reason];
  return {
    reason,
    likert,
    comparable: true,
    engine: engine || "none",
    reconciliation: {
      verdict,
      confidence: likert / 10,
      reasoning:
        String(raw?.rationale || "").trim() ||
        `Adjudicated as ${reason.replace(/_/g, " ")}.`,
      differing_conditions: Array.isArray(raw?.differing_conditions)
        ? raw.differing_conditions.map(String).slice(0, 6)
        : [],
      shared_conditions: Array.isArray(raw?.shared_conditions)
        ? raw.shared_conditions.map(String).slice(0, 6)
        : [],
      needs_human_review: needsReview || verdict === "GENUINE_CONTRADICTION",
    },
  };
}
