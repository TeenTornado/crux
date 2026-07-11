// Deterministic result-miner checks (no model).  npx tsx eval/mine-check.ts
import { mineResults } from "../src/lib/extract/mine";

let fail = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) fail++;
};

// 1. own headline sentence → mined, ImageNet/top-5/own
const a = mineResults(
  "On the test set, the configuration E achieves 7.3% top-5 error.",
  "vgg",
  "gemma-on-device"
);
ok(a.length === 1, `mines one claim from the headline sentence (got ${a.length})`);
ok(a[0]?.result_value === "7.3%", "value = 7.3%");
ok(a[0]?.metric === "top-5 error", "metric = top-5 error");
ok(a[0]?.dataset === "ImageNet", "dataset defaulted to ImageNet (top-5 convention)");
ok(a[0]?.is_own_contribution === true && a[0]?.mined === true, "own + mined flag set");

// 2. first-person 'our team … 7.3% test error' → mined
const b = mineResults(
  "Our VGG team secured the 2nd place with 7.3% test error using an ensemble.",
  "vgg",
  "gemma-on-device"
);
ok(b.some((c) => c.result_value === "7.3%"), "'our … 7.3% test error' is mined as own");

// 3. named competitor result → NOT mined (no first-person / config signal)
const c = mineResults("GoogLeNet achieves 6.7% top-5 error.", "vgg", "gemma-on-device");
ok(c.length === 0, "competitor sentence (no own-signal) is not mined");

// 4. comparison sentence containing a competitor number → NOT mined
const d = mineResults(
  "We compare our method to GoogLeNet, which achieves 6.7% top-5 error.",
  "vgg",
  "gemma-on-device"
);
ok(d.length === 0, "comparison sentence is skipped (no competitor number leaks in)");

// 4b. accuracy phrasings (the SparseViT demo shapes)
const acc1 = mineResults("Across 5 seeds we obtain 82.9±0.15 top-1, matching the released config.", "c", "gemma-on-device");
ok(acc1.some((c) => c.result_value.startsWith("82.9") && c.metric === "top-1 accuracy"),
  "'we obtain 82.9±0.15 top-1' mined as top-1 accuracy");
const acc2 = mineResults("We train for 300 epochs; our model reaches 84.2 top-1 on ImageNet-1k.", "a", "gemma-on-device");
ok(acc2.some((c) => c.result_value.startsWith("84.2") && c.dataset === "ImageNet"),
  "'reaches 84.2 top-1 on ImageNet-1k' mined with dataset");
const acc3 = mineResults("GoogLeNet achieves 76.3% top-1 accuracy.", "a", "gemma-on-device");
ok(acc3.length === 0, "competitor accuracy sentence (no own-signal) not mined");
const acc4 = mineResults(
  "Table 2. SparseViT-B reaches 84.2 top-1 on ImageNet-1k (300 ep, 224px), a +1.1 gain over ViT-B at matched FLOPs.",
  "a", "gemma-on-device"
);
ok(acc4.some((c) => c.result_value.startsWith("84.2") && c.dataset === "ImageNet"),
  "own table-caption prose ('Table 2. … 84.2 top-1') is mined");
const acc5 = mineResults("Table 7. Comparison with the state of the art.", "a", "gemma-on-device");
ok(acc5.length === 0, "comparison table caption still refused");

// 5. table rows (no metric+value adjacency) → NOT mined
const e = mineResults("E | 256 | 256 | 27.3 | 9.0", "vgg", "gemma-on-device");
ok(e.length === 0, "table rows are not mined (no 'N% <metric> error' adjacency)");

console.log(fail === 0 ? "\nAll miner checks passed." : `\n${fail} check(s) failed.`);
process.exit(fail === 0 ? 0 : 1);
