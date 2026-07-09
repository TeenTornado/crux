// Fix 3 — author self-reference dedup + grounded dataset inference.
// Run: npx tsx eval/fix3-check.ts
import {
  dedupSignature,
  paperSystemName,
  inferDataset,
  reconcileOwnership,
} from "../src/lib/extract/index";
import { canonDataset, canonMetric } from "../src/lib/graph";
import { numericCore } from "../src/lib/extract/ground";
import type { Claim } from "../src/lib/types";

let fail = 0;
const ok = (cond: boolean, msg: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) fail++;
};

// ── 1. self-reference signatures collapse across phrasings ──────────────────
const sysA = dedupSignature("We propose a deeper network improving localization", "vgg");
const sysB = dedupSignature("VGG proposes a deeper network improving localization", "vgg");
ok(sysA === sysB, `self-ref folds to same signature ("we"→system): "${sysA}"`);

const s1 = dedupSignature("Our team secured first place in localization", "vgg");
const s2 = dedupSignature("The authors' team secured first place in localization", "vgg");
ok(s1 === s2, `"our team"/"the authors' team" fold together: "${s1}"`);

// distinct claims must NOT collapse (recall guard)
const d1 = dedupSignature("We reduce top-1 error substantially", "vgg");
const d2 = dedupSignature("We improve object detection mAP", "vgg");
ok(d1 !== d2, "distinct value-less claims keep distinct signatures");

// ── 2. paperSystemName picks the dominant own system ────────────────────────
const claims: Claim[] = [
  { about_system: "VGG", is_own_contribution: true } as Claim,
  { about_system: "VGG", is_own_contribution: true } as Claim,
  { about_system: "GoogLeNet", is_own_contribution: false } as Claim,
];
ok(paperSystemName(claims, "Very Deep Convolutional Networks") === "vgg",
  "paperSystemName = dominant own system (ignores cited GoogLeNet)");
ok(paperSystemName([], "ResNet: Deep Residual Learning") === "resnet",
  "paperSystemName falls back to leading title token");

// ── 3. grounded dataset inference (only names literally present) ────────────
ok(inferDataset("attains 7.3% top-5 error on the ILSVRC-2014 dataset") === "ImageNet",
  "ILSVRC → ImageNet");
ok(inferDataset("3.57% top-5 error on ImageNet") === "ImageNet", "ImageNet literal");
ok(inferDataset("error of 3.46% on CIFAR-100") === "CIFAR-100", "CIFAR-100");
ok(inferDataset("we achieve a low error rate") === "", "no benchmark named → empty (no invention)");

// ── 4. end-to-end dedup keys (replicates the pipeline key construction) ─────
// Two chunks report VGG's headline 7.3% top-5 error: one names ILSVRC-2014,
// the other left the dataset empty so inferDataset filled ImageNet.
const SYS = "vgg";
const key = (c: Partial<Claim>) =>
  `${canonDataset(c.dataset || "")}|${canonMetric(c.metric || "")}|${
    numericCore(c.result_value || "") || dedupSignature(c.claim_text || "", SYS)
  }`.toLowerCase();

const vggAbstract = key({
  claim_text: "Our team secured first place with 7.3% top-5 error",
  dataset: "ILSVRC-2014", metric: "top-5 error", result_value: "7.3%",
});
const vggResults = key({
  claim_text: "VGG obtains 7.3% top-5 test error",
  dataset: inferDataset("VGG obtains 7.3% top-5 test error on ImageNet"),
  metric: "top-5 error", result_value: "7.3%",
});
ok(vggAbstract === vggResults,
  `value-dup collapses across chunks (ILSVRC vs inferred ImageNet): ${vggAbstract}`);

// value-less self-reference pair collapses on the same (dataset, metric)
const noValA = key({ claim_text: "We propose a deeper network", dataset: "ImageNet", metric: "top-5 error" });
const noValB = key({ claim_text: "VGG proposes a deeper network", dataset: "ImageNet", metric: "top-5 error" });
ok(noValA === noValB, "value-less self-ref pair collapses");

// a genuinely different result (6.8% vs 7.3%) must NOT collapse (recall guard)
const distinct = key({ claim_text: "ensemble reaches 6.8% top-5 error", dataset: "ImageNet", metric: "top-5 error", result_value: "6.8%" });
ok(distinct !== vggAbstract, "distinct value (6.8% vs 7.3%) stays a separate claim");

// ── 5. reconcileOwnership: re-assert own results the model mis-flagged ───────
const own: Claim[] = [
  { about_system: "configuration E", is_own_contribution: false } as Claim, // no "we" → mis-flagged
  { about_system: "our best single-network", is_own_contribution: true } as Claim,
  { about_system: "", is_own_contribution: false } as Claim, // unnamed → own
  { about_system: "GoogLeNet", is_own_contribution: false } as Claim, // named competitor → stays third-party
  { about_system: "Clarifai", is_own_contribution: false } as Claim,
];
reconcileOwnership(own, "vgg");
ok(own[0].is_own_contribution === true, "'configuration E' (generic self-descriptor) re-asserted as own");
ok(own[2].is_own_contribution === true, "unnamed about_system → own");
ok(own[3].is_own_contribution === false, "named competitor GoogLeNet stays third-party");
ok(own[4].is_own_contribution === false, "named competitor Clarifai stays third-party");

console.log(fail === 0 ? "\nAll Fix-3 checks passed." : `\n${fail} check(s) failed.`);
process.exit(fail === 0 ? 0 : 1);
