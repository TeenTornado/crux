// Deterministic result-miner — a span-grounded safety net beside the LLM tier.
//
// Small local models (gemma4:e4b) are flaky on headline numbers: they fixate on
// table rows and miss "…configuration E achieves 7.3% top-5 error". This scans
// each chunk for a metric+value stated *literally adjacent* and emits a claim
// only then, so every mined claim is span- AND value-grounded by construction
// (the matched sentence IS the provenance span). It is CONSERVATIVE about
// ownership: it mines only own-result sentences (first-person / "configuration
// X") and skips any comparison sentence, so competitor numbers (GoogLeNet 6.7%,
// Clarifai 11.2%) are never mined — the precision invariant (Fix 4) holds.

import type { Claim, Conditions } from "../types";
import { inferMetric, inferTask, inferDataset } from "./index";

const emptyConditions = (): Conditions => ({
  train_test_split: null,
  sample_size: null,
  hyperparameters: null,
  preprocessing: null,
  other: null,
});

// A sentence states the PAPER's own result …
const OWN_SIGNAL = /\b(we|our|us|configuration\s+[a-e]|config\.?\s+[a-e]|model\s+[a-e])\b/i;
// … and is NOT a comparison against another system (where a nearby number would
// belong to that other system).
const COMPARE_SIGNAL =
  /\b(compared?|comparison|versus|vs\.?|than|outperform\w*|whereas|prior|previous|state[- ]of[- ]the[- ]art|respectively|et al)\b/i;

// value/metric stated adjacently, both orders ("7.3% top-5 error" / "top-5 error of 7.3%").
const PATTERNS: { re: RegExp; metric: string }[] = [
  { re: /top-?5\s*(?:test|validation|val\.?)?\s*error(?:\s*rate)?\s*(?:of|:|=|is|was|to)?\s*(\d+(?:\.\d+)?)\s*%/gi, metric: "top-5 error" },
  { re: /(\d+(?:\.\d+)?)\s*%\s*(?:top-?5|test|classification)\s*error/gi, metric: "top-5 error" },
  { re: /top-?1\s*(?:test|validation|val\.?)?\s*error(?:\s*rate)?\s*(?:of|:|=|is|was|to)?\s*(\d+(?:\.\d+)?)\s*%/gi, metric: "top-1 error" },
  { re: /(\d+(?:\.\d+)?)\s*%\s*top-?1\s*error/gi, metric: "top-1 error" },
];

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);
}

export function mineResults(
  chunkText: string,
  paperId: string,
  tier: NonNullable<Claim["extractor"]>
): Claim[] {
  const out: Claim[] = [];
  const seen = new Set<string>();
  for (const s of sentences(chunkText)) {
    if (!OWN_SIGNAL.test(s) || COMPARE_SIGNAL.test(s)) continue;
    for (const { re, metric } of PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(s))) {
        const value = `${m[1]}%`;
        const key = `${metric}|${m[1]}`;
        if (seen.has(key)) continue;
        seen.add(key);
        let dataset = inferDataset(s);
        // top-5 error is the ImageNet/ILSVRC convention (see groundChunk).
        if (!dataset && /top-?5/.test(metric)) dataset = "ImageNet";
        const finalMetric = metric || inferMetric(s, dataset);
        out.push({
          claim_id: `claim-${crypto.randomUUID().slice(0, 8)}`,
          paper_id: paperId,
          claim_text: s.slice(0, 300),
          task: inferTask(dataset, finalMetric, s),
          dataset,
          metric: finalMetric,
          result_value: value,
          result_confidence: "medium", // value is literally in the source
          conditions: emptyConditions(),
          source_span: { page: 0, text: s.slice(0, 400) },
          extractor: tier,
          grounded: true,
          mined: true,
          is_own_contribution: true, // only own-result sentences reach here
        });
      }
    }
  }
  return out;
}
