// Change 2 — the agent's decide step (pickAgentAction), deterministic checks:
// acts on the highest-confidence genuine contradiction, never re-fires on an
// already-experimented edge (once-per-run), defers to human on low-confidence,
// reports review when nothing is falsifiable.  npx tsx eval/agent-act-check.ts
import { pickAgentAction } from "../src/lib/actions";
import type { CandidateEdge, ExperimentPlan } from "../src/lib/types";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const edge = (
  id: string,
  verdict: string | null,
  confidence = 0.8,
  needs_human_review = false
): CandidateEdge =>
  ({
    edge_id: id,
    source_claim_id: "a",
    target_claim_id: "b",
    task: "t",
    dataset: "ImageNet",
    metric: "top-5 error",
    status: "done",
    reconciliation: verdict
      ? { verdict, confidence, reasoning: "…", differing_conditions: [], shared_conditions: [], needs_human_review }
      : undefined,
  } as CandidateEdge);

const plan = { edge_id: "x" } as ExperimentPlan;

// 1. picks the HIGHEST-confidence genuine contradiction
let act = pickAgentAction(
  [edge("e1", "GENUINE_CONTRADICTION", 0.7), edge("e2", "GENUINE_CONTRADICTION", 0.9), edge("e3", "AGREEMENT")],
  {}
);
ok(act?.kind === "experiment" && (act as any).edge.edge_id === "e2",
  "acts on the highest-confidence genuine contradiction");

// 2. once-per-run: an already-experimented edge is never re-fired
act = pickAgentAction([edge("e2", "GENUINE_CONTRADICTION", 0.9)], { e2: plan });
ok(act?.kind !== "experiment", "never re-fires on an already-experimented edge");

// 3. …but a SECOND un-experimented contradiction is next in the queue
act = pickAgentAction(
  [edge("e2", "GENUINE_CONTRADICTION", 0.9), edge("e4", "GENUINE_CONTRADICTION", 0.6)],
  { e2: plan }
);
ok(act?.kind === "experiment" && (act as any).edge.edge_id === "e4",
  "moves to the next un-experimented contradiction");

// 4. no contradictions + a low-confidence pair → defers to the human
act = pickAgentAction(
  [edge("e5", "CONTEXT_CONDITIONED_DIVERGENCE", 0.5, true), edge("e6", "AGREEMENT")],
  {}
);
ok(act?.kind === "handoff" && (act as any).edge.edge_id === "e5",
  "defers to human on a needs_human_review pair (the handoff boundary)");

// 5. only clean divergences/agreements → reports the review (not silent)
act = pickAgentAction([edge("e7", "CONTEXT_CONDITIONED_DIVERGENCE"), edge("e8", "AGREEMENT")], {});
ok(act?.kind === "review", "reports review when nothing is falsifiable");

// 6. nothing reconciled yet → no action
ok(pickAgentAction([edge("e9", null)], {}) === null, "no reconciled edges → no action");
ok(pickAgentAction([], {}) === null, "empty graph → no action");

console.log(fail === 0 ? "\nAgent-act checks PASSED." : `\n${fail} failed`);
process.exit(fail ? 1 : 0);
