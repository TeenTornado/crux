// End-to-end scaling-law acceptance, fully offline/deterministic:
//   1. mineScalingExponents over the REAL (frozen) Kaplan + Chinchilla texts
//   2. splitCompoundCoefficients over the exact compound claims the live UI
//      showed (C4 / GitHub / cited-Kaplan)
//   3. buildCandidateEdges → Kaplan a=0.73 must pair with Chinchilla a-claims
// Run: npx tsx eval/scaling-e2e.ts
import { readFileSync } from "node:fs";
import { mineScalingExponents } from "../src/lib/extract/mine";
import { splitCompoundCoefficients, buildCandidateEdges, claimScalingRole } from "../src/lib/graph";
import type { Claim } from "../src/lib/types";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};
const sections = (f: string) =>
  readFileSync(`eval/corpus/structured/${f}.txt`, "utf8")
    .split(/\n(?=## )/)
    .map((p) => p.replace(/^## .+\n/, ""));

// ── 1. mine Kaplan (paper A) ─────────────────────────────────────────────────
const kaplanMined: Claim[] = [];
for (const s of sections("kaplan")) kaplanMined.push(...mineScalingExponents(s, "kaplan", "gemma-on-device"));
const kVals = (role: string) =>
  [...new Set(kaplanMined.filter((c) => claimScalingRole(c) === role).map((c) => c.result_value))];
console.log(`kaplan mined: param=${kVals("param-exponent")} data=${kVals("data-exponent")}`);
ok(kVals("param-exponent").includes("0.73"), "Kaplan a=0.73 mined from its own text (N∝Cmin0.73 / pN=0.73)");
ok(kVals("data-exponent").includes("0.27"), "Kaplan b=0.27 mined from its own text (D∼C0.27 / pD=0.27)");
const all = [...kVals("param-exponent"), ...kVals("data-exponent")];
ok(!all.includes("0.24") && !all.includes("0.03"), "batch/steps exponents (B∝C^0.24, S∝C^0.03) NOT mined");

// ── 2. mine Chinchilla (paper B) — its own fits, never the cited Kaplan row ──
const chinMined: Claim[] = [];
for (const s of sections("chinchilla")) chinMined.push(...mineScalingExponents(s, "chinchilla", "gemma-on-device"));
const cVals = (role: string) =>
  [...new Set(chinMined.filter((c) => claimScalingRole(c) === role).map((c) => c.result_value))];
console.log(`chinchilla mined: param=${cVals("param-exponent")} data=${cVals("data-exponent")}`);
ok(cVals("param-exponent").some((v) => ["0.50", "0.49", "0.46"].includes(v)),
  "Chinchilla's own a (0.50/0.49/0.46) mined");
ok(!cVals("param-exponent").includes("0.73"), "Chinchilla's cited-Kaplan 0.73 NOT mined (cite guard)");

// ── 3. split the exact compound claims from the live session ────────────────
const compound = (id: string, ds: string, a: string, b: string, own = true): Claim =>
  ({
    claim_id: id, paper_id: "chinchilla",
    claim_text: `For ${ds || "Kaplan et al. (2020)"}, the coefficient a is ${a} and the coefficient b is ${b}.`,
    task: "language modeling", dataset: ds, metric: "scaling coefficients (a and b)",
    result_value: `${a}, ${b}`, result_confidence: "medium",
    conditions: { train_test_split: null, sample_size: null, hyperparameters: null, preprocessing: null, other: null },
    source_span: { page: 0, text: "…" }, is_own_contribution: own,
  } as Claim);

const uiClaims = [
  compound("c4", "C4", "0.50", "0.50"),
  compound("gh", "GitHub", "0.53", "0.47"),
  compound("cited-kaplan", "", "0.73", "0.27", false), // Chinchilla citing Kaplan
];
const split = splitCompoundCoefficients(uiClaims);
ok(split.length === 6, `3 compound claims split into 6 per-coefficient claims (got ${split.length})`);
ok(split.every((c) => !c.result_value.includes(",")), "no bundled values remain");
ok(split.filter((c) => c.is_own_contribution === false).length === 2, "cited-Kaplan children stay own=false");
ok(splitCompoundCoefficients(split).length === 6, "splitter is idempotent (hydrate + finalize both run it)");

// ── 4. edges: Kaplan mined ↔ Chinchilla split/mined ──────────────────────────
// Mirror the pipeline's per-paper dedup rule for scaling claims:
// same role + same value = one node (extract/index.ts dedup()).
function pipelineDedup(claims: Claim[]): Claim[] {
  const seen = new Set<string>();
  return claims.filter((c) => {
    const key = `${c.paper_id}|${claimScalingRole(c)}|${c.result_value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
const graphClaims = pipelineDedup([...kaplanMined, ...split, ...chinMined]);
const edges = buildCandidateEdges(graphClaims);
const byId = new Map(graphClaims.map((c) => [c.claim_id, c]));
console.log(`\ncandidate edges: ${edges.length}`);
for (const e of edges) {
  const a = byId.get(e.source_claim_id)!, b = byId.get(e.target_claim_id)!;
  console.log(`   ↳ [${a.paper_id}] ${a.result_value} ↔ [${b.paper_id}] ${b.result_value} · ${claimScalingRole(a)}`);
}
const pairVals = (va: string, vb: string) =>
  edges.some((e) => {
    const a = byId.get(e.source_claim_id)!, b = byId.get(e.target_claim_id)!;
    return (a.result_value === va && b.result_value === vb) || (a.result_value === vb && b.result_value === va);
  });
ok(edges.length >= 3, `>=3 edges form (got ${edges.length})`);
ok(pairVals("0.73", "0.50"), "Kaplan a=0.73 ↔ Chinchilla a=0.50 (the headline contradiction)");
ok(pairVals("0.27", "0.50") || pairVals("0.27", "0.51") || pairVals("0.27", "0.47"),
  "Kaplan b=0.27 pairs with a Chinchilla b-claim");
ok(edges.every((e) => claimScalingRole(byId.get(e.source_claim_id)!) === claimScalingRole(byId.get(e.target_claim_id)!)),
  "every edge pairs SAME coefficient role (a never pairs with b)");
ok(edges.every((e) => byId.get(e.source_claim_id)!.is_own_contribution !== false
  && byId.get(e.target_claim_id)!.is_own_contribution !== false),
  "cited-Kaplan children form zero edges (no self-referential Kaplan↔Kaplan)");

console.log(fail === 0 ? "\nAll scaling-e2e checks passed." : `\n${fail} check(s) failed.`);
process.exit(fail === 0 ? 0 : 1);
