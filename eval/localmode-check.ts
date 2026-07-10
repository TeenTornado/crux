// Local Mode proof: with RECONCILE_BACKEND=local, adjudication touches ONLY
// 127.0.0.1 — a fetch guard throws on any other host, simulating WiFi-off.
//   RECONCILE_BACKEND=local npx tsx eval/localmode-check.ts
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
process.env.RECONCILE_BACKEND = "local";

// Network kill-switch: any non-localhost fetch = simulated dead WiFi.
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

import { adjudicate } from "../src/lib/contra";

let fail = 0;
const ok = (c: boolean, m: string) => {
  console.log(`${c ? "PASS" : "FAIL"}  ${m}`);
  if (!c) fail++;
};

async function main() {
  // The live Kaplan-vs-Chinchilla param-exponent pair.
  const r = await adjudicate(
    {
      metric: "param scaling exponent a (N_opt ∝ C^a)",
      claim_text: "Kaplan et al. fit N_opt ∝ C^0.73 (power law over compute)",
      dataset: "WebText2",
      result_value: "0.73",
      conditions: "fixed learning-rate schedule across runs; early-stopped fits",
      result_confidence: "medium",
    },
    {
      metric: "param scaling exponent a (N_opt ∝ C^a)",
      claim_text: "Chinchilla fits N_opt ∝ C^a with a = 0.50 (power law over compute)",
      dataset: "MassiveText",
      result_value: "0.50",
      conditions: "learning-rate schedule tuned per token budget; 3 estimation approaches agree",
      result_confidence: "medium",
    }
  );
  console.log(`engine=${r.engine} verdict=${r.reconciliation.verdict} likert=${r.likert} reason=${r.reason}`);
  ok(r.engine.startsWith("gemma:"), `engine is on-device Gemma (got "${r.engine}")`);
  ok(blocked.length === 0, `zero cloud fetches attempted (blocked list: ${blocked.length})`);
  ok(
    ["GENUINE_CONTRADICTION", "CONTEXT_CONDITIONED_DIVERGENCE", "AGREEMENT"].includes(
      r.reconciliation.verdict
    ),
    "verdict is well-formed"
  );
  ok(r.reconciliation.reasoning.length > 10, "reasoning present");

  // Guard path stays deterministic-local too (different metric).
  const g = await adjudicate(
    { metric: "top-5 error", dataset: "ImageNet", result_value: "7.3%" },
    { metric: "mAP", dataset: "COCO", result_value: "59.1" }
  );
  ok(g.engine === "guard", `hard guard path unaffected (engine=${g.engine})`);
  ok(blocked.length === 0, "still zero cloud fetches");

  console.log(fail === 0 ? "\nLocal Mode check PASSED — fully on-device." : `\n${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main();
