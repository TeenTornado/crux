import type { Claim } from "./types";

// ── Extraction (Gemma 4) ─────────────────────────────────────────────────────
// Gemma runs the privacy-sensitive extraction tier. We ask for a strict JSON
// array and treat the numeric result as a low-confidence, human-verifiable
// field (per the SciLead/AxCell result-value bottleneck).

export function extractionPrompt(paperTitle: string, sectionText: string): string {
  return `You are a scientific information-extraction engine running LOCALLY for privacy.
From the paper text below, extract every quantitative empirical CLAIM as a JSON array.

A claim is a specific reported result: a (task, dataset, metric, result) tuple with its experimental conditions.

For EACH claim emit an object with EXACTLY these keys:
- "claim_text": one-sentence paraphrase of the result, faithful to the text
- "task": the task name (e.g. "Image classification"); "" if none
- "dataset": the dataset/benchmark (e.g. "ImageNet-1k"); "" if none
- "metric": the metric name (e.g. "Top-1 accuracy"); "" if none
- "result_value": the numeric value VERBATIM as written (e.g. "84.2%"). Do NOT round, infer, or compute. "" if none.
- "result_confidence": "high" if the number is copied verbatim and unambiguous, "medium" if you had to associate it across a sentence/table, "low" if uncertain. Numbers are hard — prefer "medium"/"low".
- "conditions": object with keys "train_test_split","sample_size","hyperparameters","preprocessing","other" — each a short string or null. Capture epochs, augmentation, resolution, seeds, splits, evaluation protocol.
- "source_span": object {"page": <int>, "text": "<short verbatim quote you extracted from>"}

Rules:
- Only extract claims actually supported by the text. Do not invent numbers.
- Prefer results from Abstract, Results, and Tables.
- Return ONLY the JSON array, no prose, no markdown fences.

PAPER: "${paperTitle}"
--- TEXT START ---
${sectionText.slice(0, 24000)}
--- TEXT END ---`;
}

// ── Reconciliation (Gemini, thinking) ────────────────────────────────────────
// The hero step: diff the CONDITIONS behind two claims and classify.

export function reconciliationPrompt(a: Claim, b: Claim): string {
  const fmt = (c: Claim, label: string) =>
    `[${label}]
  claim: ${c.claim_text}
  task/dataset/metric: ${c.task} / ${c.dataset} / ${c.metric}
  result: ${c.result_value} (extractor confidence: ${c.result_confidence})
  conditions:
    train_test_split: ${c.conditions.train_test_split ?? "—"}
    sample_size: ${c.conditions.sample_size ?? "—"}
    hyperparameters: ${c.conditions.hyperparameters ?? "—"}
    preprocessing: ${c.conditions.preprocessing ?? "—"}
    other: ${c.conditions.other ?? "—"}`;

  return `You are a reconciliation engine for scientific results. Two claims share the same
(task, dataset, metric) but may report different numbers. Your job is to decide WHY.

${fmt(a, "CLAIM A")}

${fmt(b, "CLAIM B")}

Diff the conditions field by field. Then classify the pair as exactly one of:
- "GENUINE_CONTRADICTION": conditions materially match, yet results differ beyond plausible noise. A real conflict.
- "CONTEXT_CONDITIONED_DIVERGENCE": results differ, but differing conditions (epochs, augmentation, split, preprocessing, protocol) plausibly explain the gap. Both can be true. (This is the BioDivergence case.)
- "AGREEMENT": results are the same or within run-to-run variance.

Be calibrated, not overconfident (published detectors over-assert — target ~human agreement). If key conditions are undisclosed, lower confidence and set needs_human_review=true.

Return ONLY this JSON object:
{
  "verdict": "GENUINE_CONTRADICTION|CONTEXT_CONDITIONED_DIVERGENCE|AGREEMENT",
  "confidence": <0.0-1.0>,
  "reasoning": "<numbered, step-by-step diagnosis: 1. ... 2. ... referencing specific conditions and the size of the gap vs noise>",
  "differing_conditions": ["short bullet", ...],
  "shared_conditions": ["short bullet", ...],
  "needs_human_review": <true|false>
}`;
}

// ── Experiment generation (Gemini, POPPER-style) ─────────────────────────────

export function experimentPrompt(a: Claim, b: Claim, reasoning: string): string {
  return `You design MINIMAL falsification experiments (POPPER-style) to resolve a genuine
contradiction between two reported results. Produce a rigorous, runnable protocol —
explicit hypotheses, variables held fixed, one discriminating manipulation, and the
metric + decision rule that would settle it. No vague suggestions.

CONTRADICTION CONTEXT (why they conflict):
${reasoning}

CLAIM A: ${a.claim_text} [${a.result_value}] — conditions: ${JSON.stringify(a.conditions)}
CLAIM B: ${b.claim_text} [${b.result_value}] — conditions: ${JSON.stringify(b.conditions)}

Return ONLY this JSON object:
{
  "title": "<short experiment title>",
  "hypothesis_null": "H0: <null hypothesis, stated precisely with a threshold>",
  "hypothesis_alternative": "H1: <alternative hypothesis>",
  "variables_held_fixed": ["<held-fixed variable>", ...],
  "manipulation": "<the single specific ablation/comparison to run, with arms>",
  "discriminating_metric": "<metric + explicit decision rule / CI threshold that discriminates>",
  "expected_outcome_if_paper_a_correct": "<what you'd observe>",
  "expected_outcome_if_paper_b_correct": "<what you'd observe>",
  "estimated_conclusiveness": "high|medium|low",
  "estimated_compute_cost": "<runs + rough GPU-hours + wall-clock>"
}`;
}

// ── Chat over the evidence graph (Gemini Flash) ──────────────────────────────

export function chatSystemPrompt(): string {
  return `You are the assistant for an "Evidence-to-Experiment" research tool. You answer
questions about an evidence graph of extracted claims and their reconciliations.
Ground every answer ONLY in the provided context. Be concise and specific: cite
papers by handle (A/B/C) and quote result values. When asked about a disagreement,
say whether it is a genuine contradiction or a context-conditioned divergence and
name the deciding condition. Treat numeric values as reported (human-verifiable),
not ground truth. If the answer is not in the context, say so.`;
}

export function chatPrompt(context: string, question: string): string {
  return `EVIDENCE GRAPH CONTEXT:
${context}

QUESTION: ${question}

Answer in 2-5 sentences, grounded in the context above.`;
}
