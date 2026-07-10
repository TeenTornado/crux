// Scaling-law claim shape: Kaplan vs Chinchilla coefficients must pair by
// coefficient ROLE (param-exponent / data-exponent), ignoring the corpus —
// while benchmark behavior is unchanged.  npx tsx eval/scaling-check.ts
import { scalingRole, buildCandidateEdges } from "../src/lib/graph";
import { hardGuard } from "../src/lib/contra";
import type { Claim } from "../src/lib/types";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

// ── 1. role detection (precision-first) ─────────────────────────────────────
// Exact shapes from the live Kaplan extraction (ar5iv-mangled "No_pt"/"Do_pt"):
const kapA = "Coefficient a (No_pt ∝ C^a) = 0.73, the power-law scaling of optimal parameters with compute";
const kapB = "Coefficient b (Do_pt ∝ C^b) = 0.27, the power-law scaling of data with compute";
const chinA = "Fitting a power law N_opt ∝ C^a to the compute-optimal frontier yields a = 0.49";
const chinB = "The optimal number of training tokens scales as D_opt ∝ C^b with b = 0.51";

ok(scalingRole(kapA) === "param-exponent", "Kaplan a (No_pt ∝ C^a) → param-exponent");
ok(scalingRole(kapB) === "data-exponent", "Kaplan b (Do_pt ∝ C^b) → data-exponent");
ok(scalingRole(chinA) === "param-exponent", "Chinchilla a (N_opt ∝ C^a) → param-exponent");
ok(scalingRole(chinB) === "data-exponent", "Chinchilla b (D_opt ∝ C^b) → data-exponent");

// precision guards: never trigger without power-law-over-compute context
ok(scalingRole("the model achieves accuracy a = 0.73") === "", "bare 'a' without power-law context → no role");
ok(scalingRole("loss scales as a power law L ∝ N^-0.076") === "", "loss-vs-N exponent (no compute) → no role");
ok(scalingRole("N_opt ∝ C^a and D_opt ∝ C^b describe the joint scaling with compute") === "",
  "ambiguous both-roles sentence → no role (no guessing)");
ok(scalingRole("top-5 error of 7.3% on ImageNet") === "", "benchmark claim → no role");

// ── 2. candidate edges: role-pairing across papers, no cross-pairing ────────
const mk = (id: string, paper: string, metric: string, text: string, value: string, dataset = "", own = true): Claim =>
  ({
    claim_id: id, paper_id: paper, claim_text: text, task: "language modeling",
    dataset, metric, result_value: value, result_confidence: "medium",
    conditions: { train_test_split: null, sample_size: null, hyperparameters: null, preprocessing: null, other: null },
    source_span: { page: 0, text }, is_own_contribution: own,
  } as Claim);

const claims = [
  mk("k-a", "kaplan", "coefficient a", kapA, "0.73", "WebText2"),
  mk("k-b", "kaplan", "coefficient b", kapB, "0.27", "WebText2"),
  mk("c-a", "chinchilla", "a", chinA, "0.49", "MassiveText"),
  mk("c-b", "chinchilla", "b", chinB, "0.51", "MassiveText"),
];
const edges = buildCandidateEdges(claims);
console.log(`\nedges: ${edges.length}`);
for (const e of edges) console.log(`   ↳ ${e.source_claim_id} ↔ ${e.target_claim_id}`);
ok(edges.length === 2, `exactly 2 edges (param↔param, data↔data), got ${edges.length}`);
const pair = (x: string, y: string) =>
  edges.some((e) => (e.source_claim_id === x && e.target_claim_id === y) || (e.source_claim_id === y && e.target_claim_id === x));
ok(pair("k-a", "c-a"), "Kaplan 0.73 ↔ Chinchilla 0.49 (param exponent) pairs");
ok(pair("k-b", "c-b"), "Kaplan 0.27 ↔ Chinchilla 0.51 (data exponent) pairs");
ok(!pair("k-a", "c-b") && !pair("k-b", "c-a"), "a never cross-pairs with b");

// third-party scaling claim never edges (Fix 4 invariant holds for the new shape)
const withThird = [...claims, mk("c-x", "chinchilla", "a", chinA, "0.53", "MassiveText", false)];
ok(buildCandidateEdges(withThird).length === 2, "third-party (own=false) scaling claim forms no edge");

// ── 3. hardGuard: corpus difference is a condition, not a blocker ───────────
ok(
  hardGuard(
    { metric: "coefficient a", claim_text: kapA, dataset: "WebText2", result_value: "0.73" },
    { metric: "a", claim_text: chinA, dataset: "MassiveText", result_value: "0.49" }
  ) === null,
  "hardGuard passes same-role scaling pair to the adjudicator (different corpora ok)"
);
ok(
  hardGuard(
    { metric: "coefficient a", claim_text: kapA, dataset: "WebText2" },
    { metric: "b", claim_text: chinB, dataset: "MassiveText" }
  ) !== null,
  "hardGuard still blocks a-vs-b (different quantity)"
);
ok(
  hardGuard(
    { metric: "top-5 error", dataset: "ImageNet", claim_text: "7.3% top-5 error on ImageNet" },
    { metric: "top-5 error", dataset: "CIFAR-10", claim_text: "8.1% top-5 error on CIFAR-10" }
  ) === "not_comparable",
  "benchmark different-dataset guard unchanged"
);

// ── 4. benchmark regression: VGG↔ResNet edge still forms ────────────────────
const bench = [
  mk("v", "vgg", "top-5 error", "VGG achieves 7.3% top-5 error", "7.3%", "ILSVRC-2014"),
  mk("r", "resnet", "top-5 error", "ResNet achieves 3.57% top-5 error", "3.57%", "ImageNet"),
];
ok(buildCandidateEdges(bench).length === 1, "VGG↔ResNet benchmark edge regression intact");

console.log(fail === 0 ? "\nAll scaling-law checks passed." : `\n${fail} check(s) failed.`);
process.exit(fail === 0 ? 0 : 1);
