// Deterministic eval metrics — no gold-labelling bias where avoidable.
// Primary metric is span-grounding (objective: is the claim literally in the source?).

import { readFileSync } from "node:fs";

export interface GoldClaim {
  id: string;
  paper_id: string;
  dataset: string;
  metric: string;
  value: string;
  span: string;
  note?: string;
}

export function loadJsonl<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);
}

const norm = (s: string) =>
  (s || "").toLowerCase().replace(/[^a-z0-9%.\-\s]/g, " ").replace(/\s+/g, " ").trim();

/** Whitespace/punct-normalized substring test with a light fuzzy fallback. */
export function isGrounded(span: string, source: string): boolean {
  const s = norm(span);
  if (!s || s.length < 4) return false;
  const src = norm(source);
  if (src.includes(s)) return true;
  // Fuzzy: require the distinctive tokens (len>=4 or numeric) to all appear.
  const toks = s.split(" ").filter((t) => t.length >= 4 || /\d/.test(t));
  if (toks.length === 0) return false;
  return toks.every((t) => src.includes(t));
}

/** Numeric core of a value string: "84.2%" -> "84.2", "152" -> "152". */
export function numericCore(v: string): string | null {
  const m = (v || "").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? m[0] : null;
}

export interface ClaimLike {
  claim_text?: string;
  result_value?: string;
  source_span?: { text?: string };
  // Phase 2 fields:
  provenance_span?: string;
  claim?: string;
}

function claimSpan(c: ClaimLike): string {
  return c.provenance_span || c.source_span?.text || "";
}
function claimValue(c: ClaimLike): string {
  return c.result_value || "";
}
function claimText(c: ClaimLike): string {
  return c.claim || c.claim_text || "";
}

export interface PaperMetrics {
  paper_id: string;
  claims: number;
  with_span: number;
  span_grounded: number;
  span_grounding_rate: number;
  value_total: number;
  value_grounded: number;
  value_grounding_rate: number;
  gold_total: number;
  gold_recalled: number;
  gold_recall: number;
}

export function scorePaper(
  paperId: string,
  claims: ClaimLike[],
  source: string,
  gold: GoldClaim[]
): PaperMetrics {
  const withSpan = claims.filter((c) => claimSpan(c).trim().length > 0);
  const spanGrounded = claims.filter((c) => isGrounded(claimSpan(c), source)).length;

  const valued = claims.filter((c) => numericCore(claimValue(c)));
  const valueGrounded = valued.filter((c) => {
    const core = numericCore(claimValue(c))!;
    return norm(source).includes(core);
  }).length;

  // Gold recall: a gold claim is recalled if some extracted claim carries its
  // value (numeric or literal) or its span overlaps the gold span.
  const goldForPaper = gold.filter((g) => g.paper_id === paperId);
  const recalled = goldForPaper.filter((g) => {
    const gv = numericCore(g.value);
    return claims.some((c) => {
      const cv = numericCore(claimValue(c));
      const hay = norm(claimText(c) + " " + claimValue(c) + " " + claimSpan(c));
      if (gv && cv && gv === cv) return true;
      if (gv && hay.includes(gv)) return true;
      if (!gv && hay.includes(norm(g.value))) return true;
      return false;
    });
  }).length;

  return {
    paper_id: paperId,
    claims: claims.length,
    with_span: withSpan.length,
    span_grounded: spanGrounded,
    span_grounding_rate: claims.length ? spanGrounded / claims.length : 0,
    value_total: valued.length,
    value_grounded: valueGrounded,
    value_grounding_rate: valued.length ? valueGrounded / valued.length : 0,
    gold_total: goldForPaper.length,
    gold_recalled: recalled,
    gold_recall: goldForPaper.length ? recalled / goldForPaper.length : 0,
  };
}

export function aggregate(rows: PaperMetrics[]) {
  const sum = (f: (r: PaperMetrics) => number) => rows.reduce((a, r) => a + f(r), 0);
  const claims = sum((r) => r.claims);
  const spanG = sum((r) => r.span_grounded);
  const valG = sum((r) => r.value_grounded);
  const valued = sum((r) => r.value_total);
  const goldT = sum((r) => r.gold_total);
  const goldR = sum((r) => r.gold_recalled);
  return {
    papers: rows.length,
    total_claims: claims,
    mean_yield: rows.length ? claims / rows.length : 0,
    span_grounding_rate: claims ? spanG / claims : 0,
    hallucination_rate: claims ? 1 - spanG / claims : 1,
    value_grounding_rate: valued ? valG / valued : 0,
    gold_recall: goldT ? goldR / goldT : 0,
  };
}

// ── Contradiction precision (Phase 3) ────────────────────────────────────────

export interface ContraGold {
  id: string;
  label: string; // genuine_contradiction | different_* | agreement | not_comparable
}
export function contradictionPrecision(
  preds: { id: string; predicted_genuine: boolean }[],
  gold: ContraGold[]
) {
  const goldMap = new Map(gold.map((g) => [g.id, g.label === "genuine_contradiction"]));
  let tp = 0, fp = 0, fn = 0;
  const falsePositives: string[] = [];
  for (const p of preds) {
    const isGenuine = goldMap.get(p.id);
    if (p.predicted_genuine && isGenuine) tp++;
    else if (p.predicted_genuine && !isGenuine) { fp++; falsePositives.push(p.id); }
    else if (!p.predicted_genuine && isGenuine) fn++;
  }
  const precision = tp + fp ? tp / (tp + fp) : 1;
  const recall = tp + fn ? tp / (tp + fn) : 1;
  return { precision, recall, tp, fp, fn, false_positives: falsePositives };
}
