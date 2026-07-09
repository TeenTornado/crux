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
 * (e.g. "ImageNet-1k", "ImageNet validation", "ImageNet test set" → "imagenet").
 */
export function canonDataset(s: string): string {
  let x = norm(s);
  x = x.replace(/\b(validation|val|test set|test|dev|training|train|1k|2012|ilsvrc)\b/g, "");
  x = x.replace(/\bms coco\b/g, "coco");
  return x.replace(/\s+/g, " ").trim();
}

/**
 * Canonicalize a metric so phrasing variants group
 * (e.g. "top-5 validation error", "top-5 error rate" → "top 5 error").
 */
export function canonMetric(s: string): string {
  let x = norm(s);
  x = x.replace(/\b(validation|val|single model|single crop|single scale|rate|score|test)\b/g, "");
  x = x.replace(/\btop ?1\b/g, "top1").replace(/\btop ?5\b/g, "top5");
  x = x.replace(/\bmiou\b|\bmean iou\b/g, "miou");
  x = x.replace(/\bacc\b/g, "accuracy");
  return x.replace(/\s+/g, " ").trim();
}

export function groupKey(c: Claim): string {
  return [norm(c.task), canonDataset(c.dataset), canonMetric(c.metric)].join(" · ");
}

/**
 * Build candidate reconciliation edges: any two claims from *different* papers
 * that share (task, dataset, metric) get an edge for the reconciler to judge.
 */
export function buildCandidateEdges(claims: Claim[]): CandidateEdge[] {
  const groups = new Map<string, Claim[]>();
  for (const c of claims) {
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
