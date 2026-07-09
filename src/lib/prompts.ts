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

// ── Chunk extraction (Phase 2: decompose + span-ground) ──────────────────────
// Small-model-friendly: free-form reasoning first, then a FLAT claim schema
// (Gemma-4B returns empty arrays on nested schemas), every claim carrying a
// verbatim provenance span so the grounding gate can reject hallucinations.

export function chunkExtractionPrompt(
  title: string,
  heading: string,
  chunkText: string
): string {
  return `You extract quantitative empirical RESULTS from ONE section of the paper "${title}".

Work in two steps.
STEP 1 — in "reasoning": name the sentences in the section that report a concrete measured result (a number on a task/dataset/metric). Ignore motivation, related work, and future work.
STEP 2 — emit one object per DISTINCT result.

Return ONLY this JSON:
{"reasoning":"<brief>","claims":[{...}]}

Each claim object (keep it FLAT — no nested objects):
- "claim_text": one standalone sentence for the result; replace "our model"/pronouns with the actual method name.
- "task": task name, or ""
- "dataset": dataset/benchmark name, or ""
- "metric": metric name, or ""
- "result_value": the number exactly as written (e.g. "3.57%", "28.4"), or "" if none
- "conditions": short phrase of the setup (epochs, augmentation, split, seeds, protocol), or ""
- "provenance_span": copy the EXACT substring from the SECTION TEXT below that states this result. It MUST appear verbatim in the section.

Rules:
- Every claim needs a provenance_span copied verbatim from the section.
- Do NOT invent numbers or spans. Copy result_value only if it literally appears in the section.
- If the section reports no measured results, return {"reasoning":"...","claims":[]}.

SECTION: ${heading || "(body)"}
--- TEXT START ---
${chunkText}
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

// ── Contradiction adjudication (Phase 3: precision-first) ────────────────────
// Base rate of real contradictions is tiny (scite: ~0.8% of citations contrast),
// so a false "contradiction" is far costlier than a miss. Be strict.

export function adjudicationPrompt(
  a: { dataset?: string; metric?: string; result_value?: string; conditions?: string; result_confidence?: string },
  b: { dataset?: string; metric?: string; result_value?: string; conditions?: string; result_confidence?: string }
): string {
  return `Two reported results share the same task/dataset/metric. Decide their RELATIONSHIP.
False contradictions destroy trust, so favour precision: only call something a genuine
contradiction when you are confident.

RESULT A: ${a.result_value} on ${a.dataset} / ${a.metric}
  conditions: ${a.conditions || "—"}  (value confidence: ${a.result_confidence || "?"})
RESULT B: ${b.result_value} on ${b.dataset} / ${b.metric}
  conditions: ${b.conditions || "—"}  (value confidence: ${b.result_confidence || "?"})

Return ONLY this JSON:
{
  "reason": "genuine_contradiction | different_conditions | different_population | different_metric | only_hedging_differs | not_comparable | agreement",
  "likert": <0-10, where 10 = certain genuine contradiction>,
  "shared_conditions": ["..."],
  "differing_conditions": ["..."],
  "rationale": "<one or two sentences>",
  "needs_human_review": <true|false>
}

Rules (strict):
- "genuine_contradiction" ONLY if the material conditions MATCH (same population, split, training budget/epochs, augmentation, evaluation protocol, decoding) AND the numbers differ beyond plausible run-to-run noise. Set likert >= 8 only in this case.
- If ANY material condition differs (epochs, augmentation, seeds/protocol, split, population, decoding) → "different_conditions" / "different_population" (both results can be true). likert <= 5.
- If the metric or measured quantity differs → "different_metric" / "not_comparable".
- If the values are within run-to-run noise → "agreement".
- If either value confidence is "low", do NOT assert a contradiction on the numbers alone — set needs_human_review=true and prefer a non-genuine reason unless the conditions clearly match.`;
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
