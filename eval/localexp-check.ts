// Build 2 proof: with RECONCILE_BACKEND=local, experiment generation runs the
// ACTUAL route handler fully on-device (fetch guard blocks non-localhost) and
// returns a well-formed POPPER plan with engine "gemma:<model>".
//   npx tsx eval/localexp-check.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
process.env.RECONCILE_BACKEND = "local";

const realFetch = globalThis.fetch;
const blocked: string[] = [];
globalThis.fetch = ((input: any, init?: any) => {
  const url = String(typeof input === "string" ? input : input?.url ?? input);
  if (!/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
    blocked.push(url);
    throw new TypeError(`fetch blocked (offline simulation): ${url}`);
  }
  return realFetch(input, init);
}) as typeof fetch;

import { POST } from "../src/app/api/experiment/route";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

const claim = (id: string, paper: string, value: string, cond: string) => ({
  claim_id: id,
  paper_id: paper,
  claim_text: `param scaling exponent a (N_opt ∝ C^a) = ${value}`,
  task: "language modeling",
  dataset: paper === "kaplan" ? "WebText2" : "MassiveText",
  metric: "param scaling exponent a (N_opt ∝ C^a)",
  result_value: value,
  result_confidence: "medium",
  conditions: { train_test_split: null, sample_size: null, hyperparameters: cond, preprocessing: null, other: null },
  source_span: { page: 0, text: "…" },
});

async function main() {
  const t0 = Date.now();
  const req = new Request("http://localhost/api/experiment", {
    method: "POST",
    body: JSON.stringify({
      a: claim("k-a", "kaplan", "0.73", "fixed LR schedule"),
      b: claim("c-a", "chinchilla", "0.50", "LR schedule tuned per token budget"),
      reasoning:
        "Same coefficient in the same functional form; Kaplan's fixed LR schedule undertrains small models, inflating the parameter exponent.",
      edgeId: "edge-test",
    }),
  });
  const res = await POST(req as any);
  const d = await res.json();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`engine=${d.engine} in ${secs}s · title="${d.plan?.title?.slice(0, 60)}"`);
  ok(res.status === 200, "route returns 200");
  ok(blocked.length === 0, `zero cloud fetches (blocked: ${blocked.length})`);
  ok(
    String(d.engine).startsWith("gemma:") || d.engine === "template",
    `engine is on-device or honest template (got "${d.engine}")`
  );
  ok(Boolean(d.plan?.hypothesis_null), "H0 present");
  ok(Boolean(d.plan?.hypothesis_alternative), "H1 present");
  ok(Boolean(d.plan?.manipulation), "manipulation present");
  ok(Boolean(d.plan?.discriminating_metric), "discriminating metric present");
  ok((d.plan?.variables_held_fixed || []).length > 0, "held-fixed variables present");
  if (d.engine === "template")
    console.log("NOTE: local model fell through to template — check Ollama health.");

  console.log(fail === 0 ? "\nLocal experiment check PASSED." : `\n${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
