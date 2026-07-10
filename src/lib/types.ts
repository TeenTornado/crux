// ── Core domain types ───────────────────────────────────────────────────────

export type Confidence = "low" | "medium" | "high";

export type Verdict =
  | "GENUINE_CONTRADICTION"
  | "CONTEXT_CONDITIONED_DIVERGENCE"
  | "AGREEMENT";

export interface SourceSpan {
  page: number;
  text: string;
}

export interface Conditions {
  train_test_split: string | null;
  sample_size: string | null;
  hyperparameters: string | null;
  preprocessing: string | null;
  other: string | null;
}

export interface Claim {
  claim_id: string;
  paper_id: string;
  claim_text: string;
  task: string;
  dataset: string;
  metric: string;
  /** Verbatim, no interpretation. Low-confidence numeric field per SciLead/AxCell. */
  result_value: string;
  result_confidence: Confidence;
  conditions: Conditions;
  source_span: SourceSpan;
  /** Which inference tier produced this claim. */
  extractor?: "gemma-on-device" | "gemma-hosted" | "gemini-escalated" | "demo";
  /** Phase 2: true once the provenance span is verified verbatim in the source. */
  grounded?: boolean;
  /** Extracted by the deterministic pattern result-miner (metric+value stated
   *  adjacently), not the LLM tier — span/value grounded by construction. */
  mined?: boolean;
  /** Fix 4: the system this result is about (may be a third-party baseline). */
  about_system?: string;
  /** Fix 4: is `about_system` this paper's own contribution? Third-party (false)
   *  claims stay in the source list but never form contradiction edges. */
  is_own_contribution?: boolean;
}

export interface Paper {
  paper_id: string;
  title: string;
  authors: string;
  year: number;
  venue?: string;
  /** Short handle used as a node label, e.g. "A", "B", "C". */
  handle: string;
  pages?: number;
}

export interface Reconciliation {
  verdict: Verdict;
  confidence: number; // 0..1
  reasoning: string; // step-by-step diagnosis
  differing_conditions: string[];
  shared_conditions: string[];
  /** True when a human should confirm before trusting (per ContraCrow overconfidence). */
  needs_human_review?: boolean;
}

export interface CandidateEdge {
  edge_id: string;
  source_claim_id: string;
  target_claim_id: string;
  task: string;
  dataset: string;
  metric: string;
  /** Populated after /reconcile runs. */
  reconciliation?: Reconciliation;
  status: "pending" | "reconciling" | "done";
}

export interface ExperimentPlan {
  edge_id: string;
  title: string;
  hypothesis_null: string;
  hypothesis_alternative: string;
  variables_held_fixed: string[];
  manipulation: string;
  discriminating_metric: string;
  expected_outcome_if_paper_a_correct: string;
  expected_outcome_if_paper_b_correct: string;
  estimated_conclusiveness: Confidence;
  estimated_compute_cost: string;
}

// ── Streaming protocol (server → client, NDJSON) ────────────────────────────

export type ExtractEvent =
  | { type: "paper"; paper: Paper }
  | { type: "status"; message: string }
  | { type: "progress"; done: number; total: number; heading: string; paper_id: string; ms?: number }
  | { type: "claim"; claim: Claim }
  | { type: "done"; papers: Paper[]; claims: Claim[]; source: ExtractSource }
  | { type: "error"; message: string };

export type ExtractSource = "demo" | "gemma-on-device" | "gemma-hosted";

export interface GraphState {
  papers: Paper[];
  claims: Claim[];
  edges: CandidateEdge[];
  experiments: Record<string, ExperimentPlan>;
}
