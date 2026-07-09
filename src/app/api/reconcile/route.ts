import { NextRequest, NextResponse } from "next/server";
import { generate, extractJson, hasKey, MODELS } from "@/lib/gemini";
import { reconciliationPrompt } from "@/lib/prompts";
import { heuristicReconcile } from "@/lib/heuristics";
import type { Claim, Reconciliation, Verdict } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const VERDICTS: Verdict[] = [
  "GENUINE_CONTRADICTION",
  "CONTEXT_CONDITIONED_DIVERGENCE",
  "AGREEMENT",
];

function coerce(raw: any, a: Claim, b: Claim): Reconciliation {
  const verdict: Verdict = VERDICTS.includes(raw?.verdict)
    ? raw.verdict
    : "AGREEMENT";
  return {
    verdict,
    confidence:
      typeof raw?.confidence === "number"
        ? Math.max(0, Math.min(1, raw.confidence))
        : 0.6,
    reasoning: String(raw?.reasoning || "").trim() || heuristicReconcile(a, b).reasoning,
    differing_conditions: Array.isArray(raw?.differing_conditions)
      ? raw.differing_conditions.map(String).slice(0, 8)
      : [],
    shared_conditions: Array.isArray(raw?.shared_conditions)
      ? raw.shared_conditions.map(String).slice(0, 8)
      : [],
    needs_human_review: Boolean(raw?.needs_human_review),
  };
}

export async function POST(req: NextRequest) {
  const { a, b } = (await req.json()) as { a: Claim; b: Claim };
  if (!a || !b) {
    return NextResponse.json({ error: "Missing claims" }, { status: 400 });
  }

  if (!hasKey()) {
    return NextResponse.json({
      reconciliation: heuristicReconcile(a, b),
      engine: "heuristic",
    });
  }

  try {
    const { text, thought, model } = await generate(
      MODELS.reconcile(),
      reconciliationPrompt(a, b),
      { json: true, thinkingLevel: "low", temperature: 0.3, maxOutputTokens: 3000 }
    );
    const reconciliation = coerce(extractJson(text), a, b);
    return NextResponse.json({
      reconciliation,
      engine: model,
      thinking: thought || null,
    });
  } catch (err: any) {
    return NextResponse.json({
      reconciliation: heuristicReconcile(a, b),
      engine: "heuristic-fallback",
      error: err?.message?.slice(0, 200),
    });
  }
}
