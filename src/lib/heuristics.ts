import type { Claim, Reconciliation } from "./types";

/** Pull the first number out of a verbatim result string ("84.2%" → 84.2). */
export function parseNumber(v: string): number | null {
  const m = v.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

function condPairs(c: Claim["conditions"]) {
  return Object.entries(c).filter(([, v]) => v) as [string, string][];
}

/**
 * Deterministic offline reconciler used when no API key is present. Not as sharp
 * as the Gemini "thinking" path, but keeps the flow alive and honest.
 */
export function heuristicReconcile(a: Claim, b: Claim): Reconciliation {
  const na = parseNumber(a.result_value);
  const nb = parseNumber(b.result_value);
  const gap = na != null && nb != null ? Math.abs(na - nb) : null;

  const shared: string[] = [];
  const differing: string[] = [];
  const keys: (keyof Claim["conditions"])[] = [
    "train_test_split",
    "sample_size",
    "hyperparameters",
    "preprocessing",
    "other",
  ];
  for (const k of keys) {
    const va = a.conditions[k];
    const vb = b.conditions[k];
    if (va && vb) {
      if (va.toLowerCase() === vb.toLowerCase()) shared.push(`${k}: ${va}`);
      else differing.push(`${k}: A=“${va}” vs B=“${vb}”`);
    } else if (va || vb) {
      differing.push(`${k}: only one paper reports (${va || vb})`);
    }
  }

  const relGap =
    gap != null && na ? gap / Math.max(Math.abs(na), Math.abs(nb ?? na)) : 0;
  const materialDiff = differing.length > 0;

  let verdict: Reconciliation["verdict"];
  let confidence: number;
  if (gap == null) {
    verdict = "AGREEMENT";
    confidence = 0.4;
  } else if (relGap < 0.01) {
    verdict = "AGREEMENT";
    confidence = 0.8;
  } else if (materialDiff) {
    verdict = "CONTEXT_CONDITIONED_DIVERGENCE";
    confidence = 0.7;
  } else {
    verdict = "GENUINE_CONTRADICTION";
    confidence = 0.65;
  }

  const reasoning =
    `1. Both claims share (task, dataset, metric): ${a.task} / ${a.dataset} / ${a.metric}.\n` +
    `2. Reported values: A=${a.result_value}, B=${b.result_value}` +
    (gap != null ? ` (gap ≈ ${gap.toFixed(2)}, ${(relGap * 100).toFixed(1)}% relative).` : ".") +
    `\n3. Condition diff: ${differing.length} differing, ${shared.length} shared.` +
    `\n4. ${
      verdict === "AGREEMENT"
        ? "Values are within noise — agreement."
        : verdict === "CONTEXT_CONDITIONED_DIVERGENCE"
        ? "Differing conditions plausibly explain the gap — context-conditioned divergence."
        : "Conditions match yet values differ beyond noise — genuine contradiction."
    }` +
    `\n(Offline heuristic — set GEMINI_API_KEY for the Gemini thinking reconciler.)`;

  return {
    verdict,
    confidence,
    reasoning,
    differing_conditions: differing.slice(0, 6),
    shared_conditions: shared.slice(0, 6),
    needs_human_review: confidence < 0.7 || verdict === "GENUINE_CONTRADICTION",
  };
}
