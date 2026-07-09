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

export function groupKey(c: Claim): string {
  return [canonTask(c.task), canonDataset(c.dataset), canonMetric(c.metric)].join(" · ");
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
    // A reconcilable claim needs a comparable (dataset, metric) AND a value to
    // compare; third-party results (is_own_contribution === false) never edge (Fix 4).
    if (c.is_own_contribution === false) continue;
    if (!c.result_value) continue;
    if (!canonDataset(c.dataset) || !canonMetric(c.metric)) continue;
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
