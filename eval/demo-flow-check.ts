// Demo-flow output check: simulates exactly what the client does after the
// demo stream lands — edges, curated verdicts, the agent's auto-act pick, and
// the curated experiment it resolves to.  npx tsx eval/demo-flow-check.ts
import {
  DEMO_PAPERS,
  DEMO_CLAIMS,
  DEMO_RECONCILIATIONS,
  DEMO_EXPERIMENTS,
} from "../src/lib/demoData";
import { buildCandidateEdges, splitCompoundCoefficients } from "../src/lib/graph";
import { pickAgentAction } from "../src/lib/actions";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

// what finalizeExtraction does
const claims = splitCompoundCoefficients(DEMO_CLAIMS);
const edges = buildCandidateEdges(claims);
console.log(`papers=${DEMO_PAPERS.length} claims=${claims.length} edges=${edges.length}`);

ok(DEMO_PAPERS.length === 3, "3 demo papers");
ok(edges.length >= 3, `candidate edges form (${edges.length})`);

// every edge must resolve instantly from the curated verdict set
const covered = edges.filter((e) => DEMO_RECONCILIATIONS[e.edge_id]);
ok(covered.length === edges.length,
  `every edge has a curated verdict (${covered.length}/${edges.length})`);

// verdict mix per the demo design: 1 genuine contradiction + divergences
const withV = edges.map((e) => ({ e, r: DEMO_RECONCILIATIONS[e.edge_id] })).filter((x) => x.r);
const contra = withV.filter((x) => x.r.verdict === "GENUINE_CONTRADICTION");
const div = withV.filter((x) => x.r.verdict === "CONTEXT_CONDITIONED_DIVERGENCE");
console.log(`verdicts: ${contra.length} contradiction · ${div.length} divergence · ${withV.length - contra.length - div.length} agreement`);
ok(contra.length >= 1, "the demo carries a genuine contradiction (the agent's target)");

// the agent's auto-act: applies verdicts, then picks
const edgesReconciled = edges.map((e) => ({ ...e, reconciliation: DEMO_RECONCILIATIONS[e.edge_id], status: "done" as const }));
const act = pickAgentAction(edgesReconciled, {});
ok(act?.kind === "experiment", `agent auto-acts on the contradiction (picked: ${act?.kind})`);
if (act?.kind === "experiment") {
  const label = `${act.edge.dataset} · ${act.edge.metric}`;
  console.log(`agent target: ${label} (confidence ${DEMO_RECONCILIATIONS[act.edge.edge_id]?.confidence})`);
  ok(Boolean(DEMO_EXPERIMENTS[act.edge.edge_id]),
    "curated experiment exists for the agent's target → auto-act resolves instantly");
  const plan = DEMO_EXPERIMENTS[act.edge.edge_id];
  if (plan) {
    ok(Boolean(plan.hypothesis_null && plan.manipulation && plan.discriminating_metric),
      `plan is complete · "${plan.title.slice(0, 50)}"`);
  }
}

console.log(fail === 0 ? "\nDemo flow output: ALL GOOD." : `\n${fail} check(s) failed`);
process.exit(fail ? 1 : 0);
