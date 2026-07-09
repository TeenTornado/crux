import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { writeFileSync, mkdirSync } from "node:fs";
import { adjudicate } from "../src/lib/contra";
import { loadJsonl, contradictionPrecision } from "./metrics";

interface Pair {
  id: string;
  label: string;
  claim_a: any;
  claim_b: any;
  why?: string;
}

const toAdj = (c: any) => ({
  dataset: c.dataset,
  metric: c.metric,
  result_value: c.value,
  conditions: c.conditions,
  result_confidence: "medium",
});

async function main() {
  const pairs = loadJsonl<Pair>("eval/gold/contradictions.jsonl");
  const preds: { id: string; predicted_genuine: boolean }[] = [];
  for (const p of pairs) {
    const r = await adjudicate(toAdj(p.claim_a), toAdj(p.claim_b));
    const genuine = r.reconciliation.verdict === "GENUINE_CONTRADICTION";
    preds.push({ id: p.id, predicted_genuine: genuine });
    console.log(
      `${p.id.padEnd(4)} gold=${p.label.padEnd(22)} pred=${r.reason.padEnd(22)} likert=${String(r.likert).padStart(2)} ${genuine ? "[GENUINE]" : ""}`
    );
  }
  const m = contradictionPrecision(
    preds,
    pairs.map((p) => ({ id: p.id, label: p.label }))
  );
  console.log(
    `\nprecision ${m.precision.toFixed(2)}  recall ${m.recall.toFixed(2)}  tp=${m.tp} fp=${m.fp} fn=${m.fn}`
  );
  console.log("false positives:", m.false_positives.length ? m.false_positives : "none");
  mkdirSync("eval/results", { recursive: true });
  writeFileSync(
    "eval/results/contradiction.json",
    JSON.stringify({ ...m, preds, timestamp: new Date().toISOString() }, null, 2)
  );
}
main();
