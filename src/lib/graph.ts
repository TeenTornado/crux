import type { Claim, CandidateEdge } from "./types";

/** Normalize an entity string for grouping (case/space/punctuation-insensitive). */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Canonicalize a dataset so common variants group together
 * (e.g. "ImageNet-1k", "ImageNet validation", "ILSVRC-2014" → "imagenet").
 */
export function canonDataset(s: string): string {
  let x = norm(s);
  // ILSVRC (with or without a year) is the ImageNet challenge.
  x = x.replace(/\bilsvrc( ?\d{4})?\b/g, "imagenet");
  x = x.replace(/\bms coco\b/g, "coco");
  x = x.replace(/\b(validation|val|test set|test|dev|training|train|1k|2012|2014|2015)\b/g, "");
  x = x.replace(/\b(19|20)\d{2}\b/g, ""); // stray challenge years
  return x.replace(/\s+/g, " ").trim();
}

/**
 * Canonicalize a metric so phrasing variants group
 * (e.g. "top-5 validation error", "top-5 error rate", "top-5 test error" → "top5 error").
 * A bare classification "error"/"test error" defaults to top-5 (the ImageNet/ILSVRC
 * convention) so it groups with an explicit "top-5 error".
 */
export function canonMetric(s: string): string {
  let x = norm(s);
  x = x.replace(/\b(validation|val|single model|single crop|single scale|rate|score|test)\b/g, "");
  x = x.replace(/\btop ?1\b/g, "top1").replace(/\btop ?5\b/g, "top5");
  x = x.replace(/\bmiou\b|\bmean iou\b/g, "miou");
  x = x.replace(/\bmap\b|\bmean ap\b|\baverage precision\b/g, "map");
  x = x.replace(/\bacc\b/g, "accuracy");
  x = x.replace(/\s+/g, " ").trim();
  // Bare classification error (no top-k) → top-5 error (ILSVRC convention).
  if (/^(classification )?error$/.test(x)) x = "top5 error";
  return x;
}

/**
 * Scaling-law claim shape (Kaplan/Chinchilla-class papers). These claims are
 * not (task, dataset, metric, score) — they are (equation, coefficient role,
 * value): e.g. Kaplan's N_opt ∝ C^a with a=0.73 vs Chinchilla's a≈0.50. Two
 * such claims are comparable when they describe the SAME coefficient role in
 * the same functional form (a power law over compute), even though the papers
 * fit different corpora (WebText2 vs MassiveText) — the corpus is a *condition*
 * for the reconciler to weigh, not an identity that blocks comparison.
 *
 * Detection is precision-first: it requires power-law-over-COMPUTE context
 * (∝ / power law / scaling AND C^ / compute), so a bare "a"/"b" or a loss-vs-N
 * exponent (L ∝ N^-α, no compute) never triggers it. Ambiguous sentences that
 * mention both roles return "" (no pairing) rather than guess.
 */
export function scalingRole(s: string): "param-exponent" | "data-exponent" | "" {
  const x = (s || "").toLowerCase().replace(/\\propto|∝/g, " prop ");
  const power = /\bprop\b|power[- ]?law|scal(?:es?|ing)/.test(x);
  const compute = /\bc\s*\^|compute/.test(x);
  if (!power || !compute) return "";
  // N_opt / No_pt (ar5iv-mangled) / α_N / "parameters ∝ C^a" / coefficient a
  const param =
    /\bn\s?[_o]?\s?opt\b|\bno\s?_?\s?pt\b|(alpha|α)\s?_?\s?n\b|\bparam(eter)?s?\b|model size|\bc\s*\^\s*a\b|c\^a|(coefficient|exponent)\s+a\b/.test(x);
  // D_opt / Do_pt / α_D / "tokens/data ∝ C^b" / coefficient b
  const data =
    /\bd\s?[_o]?\s?opt\b|\bdo\s?_?\s?pt\b|(alpha|α)\s?_?\s?d\b|\btokens?\b|\b(training )?data(set)?( size)?\b|\bc\s*\^\s*b\b|c\^b|(coefficient|exponent)\s+b\b/.test(x);
  if (param && !data) return "param-exponent";
  if (data && !param) return "data-exponent";
  return "";
}

/** Role for a full claim. An explicit metric label wins (a split-coefficient
 * claim's text still narrates BOTH coefficients, which reads as ambiguous);
 * otherwise fall back to metric+text, where the equation usually lives. */
export function claimScalingRole(c: Pick<Claim, "metric" | "claim_text">): string {
  return scalingRole(c.metric || "") || scalingRole(`${c.metric} ${c.claim_text}`);
}

export function groupKey(c: Claim): string {
  // Scaling-law claims group by coefficient role, ignoring the corpus.
  const role = claimScalingRole(c);
  if (role) return `scaling law · ${role}`;
  return [canonTask(c.task), canonDataset(c.dataset), canonMetric(c.metric)].join(" · ");
}

// ── Compound-coefficient split ───────────────────────────────────────────────
// LLM extraction bundles both exponents into ONE claim ("For C4, the
// coefficient a is 0.50 and the coefficient b is 0.50" → value "0.50, 0.50").
// The graph needs one node per coefficient or a=0.73 can never pair with
// a=0.50. Split is gated on the claim being scaling-coefficient shaped (the
// model's own metric label says so, or the text carries the power-law form),
// so benchmark claims are never touched. Children keep the parent's span,
// dataset, paper and ownership; ids are deterministic (`<id>-pa`/`-pb`) so
// hydration and edge-building agree across runs.
const COMPOUND_COEFF =
  /(?:coefficient|exponent)?\s*\ba\b[^.;]{0,24}?(?:is|=|of)\s*(0?\.\d+)[^.;]{0,60}?\band\b[^.;]{0,24}?(?:coefficient|exponent)?\s*\bb\b[^.;]{0,24}?(?:is|=|of)\s*(0?\.\d+)/i;

const SPLIT_METRIC = {
  param: "param scaling exponent a (N_opt ∝ C^a)",
  data: "data scaling exponent b (D_opt ∝ C^b)",
} as const;

export function splitCompoundCoefficients(claims: Claim[]): Claim[] {
  const out: Claim[] = [];
  for (const c of claims) {
    // Idempotent: children (already per-coefficient) pass through untouched —
    // finalizeExtraction AND hydrateSession both run this.
    if (c.metric === SPLIT_METRIC.param || c.metric === SPLIT_METRIC.data) {
      out.push(c);
      continue;
    }
    const shaped =
      /scaling coefficient|scaling exponent/i.test(c.metric || "") ||
      scalingRole(`${c.metric} ${c.claim_text}`) !== "";
    const m = shaped ? (c.claim_text || "").match(COMPOUND_COEFF) : null;
    if (!m) {
      out.push(c);
      continue;
    }
    const [, a, b] = m;
    const mk = (suffix: "pa" | "pb", role: "param" | "data", value: string): Claim => ({
      ...c,
      claim_id: `${c.claim_id}-${suffix}`,
      metric: SPLIT_METRIC[role],
      result_value: value,
      claim_text: `${c.claim_text} [${role === "param" ? "a" : "b"} = ${value}]`,
    });
    out.push(mk("pa", "param", a), mk("pb", "data", b));
  }
  return out;
}

/** Fold task naming so "image classification" / "classification" / "recognition" group. */
export function canonTask(s: string): string {
  const x = norm(s);
  if (/classif|recognition|image net/.test(x)) return "classification";
  if (/detection/.test(x)) return "detection";
  if (/localiz|localis/.test(x)) return "localization";
  if (/segmentation/.test(x)) return "segmentation";
  if (/translation|\bnmt\b|\bmt\b/.test(x)) return "translation";
  if (/question|\bqa\b/.test(x)) return "qa";
  return x;
}

/**
 * Build candidate reconciliation edges: any two claims from *different* papers
 * that share (task, dataset, metric) get an edge for the reconciler to judge.
 */
export function buildCandidateEdges(claims: Claim[]): CandidateEdge[] {
  const groups = new Map<string, Claim[]>();
  for (const c of claims) {
    // A reconcilable claim needs a comparable identity AND a value to compare;
    // third-party results (is_own_contribution === false) never edge (Fix 4).
    if (c.is_own_contribution === false) continue;
    if (!c.result_value) continue;
    // Benchmark claims need (dataset, metric); scaling-law claims have neither
    // in the benchmark sense — their identity is the coefficient role.
    if (!claimScalingRole(c) && (!canonDataset(c.dataset) || !canonMetric(c.metric)))
      continue;
    const k = groupKey(c);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  }

  const edges: CandidateEdge[] = [];
  for (const [, members] of groups) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i];
        const b = members[j];
        if (a.paper_id === b.paper_id) continue;
        edges.push({
          edge_id: `edge-${a.claim_id}-${b.claim_id}`,
          source_claim_id: a.claim_id,
          target_claim_id: b.claim_id,
          task: a.task,
          dataset: a.dataset,
          metric: a.metric,
          status: "pending",
        });
      }
    }
  }
  return edges;
}
