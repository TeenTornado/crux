import { NextRequest, NextResponse } from "next/server";
import { heuristicReconcile } from "@/lib/heuristics";
import { adjudicate, type AdjClaim } from "@/lib/contra";
import type { Claim } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/** Flatten the structured conditions object into a single phrase for the adjudicator. */
function toAdjClaim(c: Claim): AdjClaim {
  const conds = Object.values(c.conditions || {}).filter(Boolean).join("; ");
  return {
    dataset: c.dataset,
    metric: c.metric,
    result_value: c.result_value,
    conditions: conds,
    result_confidence: c.result_confidence,
    // Carries the equation for scaling-law claims (hardGuard role detection).
    claim_text: c.claim_text,
  };
}

export async function POST(req: NextRequest) {
  const { a, b } = (await req.json()) as { a: Claim; b: Claim };
  if (!a || !b) {
    return NextResponse.json({ error: "Missing claims" }, { status: 400 });
  }

  try {
    // Phase 3: precision-first — deterministic guard + strict Likert adjudicator.
    const adj = await adjudicate(toAdjClaim(a), toAdjClaim(b));
    if (adj.engine === "none") {
      // No local model and no key — fall back to the offline heuristic.
      return NextResponse.json({ reconciliation: heuristicReconcile(a, b), engine: "heuristic" });
    }
    return NextResponse.json({
      reconciliation: adj.reconciliation,
      engine: adj.engine,
      reason: adj.reason,
      likert: adj.likert,
      comparable: adj.comparable,
    });
  } catch (err: any) {
    return NextResponse.json({
      reconciliation: heuristicReconcile(a, b),
      engine: "heuristic-fallback",
      error: err?.message?.slice(0, 200),
    });
  }
}
