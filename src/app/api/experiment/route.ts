import { NextRequest, NextResponse } from "next/server";
import { generate, extractJson, hasKey, MODELS } from "@/lib/gemini";
import { experimentPrompt } from "@/lib/prompts";
import { DEMO_EXPERIMENTS } from "@/lib/demoData";
import type { Claim, ExperimentPlan, Confidence } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

function asArr(x: unknown): string[] {
  if (Array.isArray(x)) return x.map(String);
  if (typeof x === "string" && x.trim()) return [x];
  return [];
}
function asConf(x: unknown): Confidence {
  return x === "high" || x === "low" ? x : "medium";
}

function coerce(raw: any, edgeId: string): ExperimentPlan {
  return {
    edge_id: edgeId,
    title: String(raw?.title || "Falsification experiment"),
    hypothesis_null: String(raw?.hypothesis_null || ""),
    hypothesis_alternative: String(raw?.hypothesis_alternative || ""),
    variables_held_fixed: asArr(raw?.variables_held_fixed),
    manipulation: String(raw?.manipulation || ""),
    discriminating_metric: String(raw?.discriminating_metric || ""),
    expected_outcome_if_paper_a_correct: String(
      raw?.expected_outcome_if_paper_a_correct || ""
    ),
    expected_outcome_if_paper_b_correct: String(
      raw?.expected_outcome_if_paper_b_correct || ""
    ),
    estimated_conclusiveness: asConf(raw?.estimated_conclusiveness),
    estimated_compute_cost: String(raw?.estimated_compute_cost || "—"),
  };
}

export async function POST(req: NextRequest) {
  const { a, b, reasoning, edgeId } = (await req.json()) as {
    a: Claim;
    b: Claim;
    reasoning: string;
    edgeId: string;
  };
  if (!a || !b) {
    return NextResponse.json({ error: "Missing claims" }, { status: 400 });
  }

  // Offline: serve the curated demo plan if we have one, else a scaffold.
  if (!hasKey()) {
    const plan =
      DEMO_EXPERIMENTS[edgeId] ||
      coerce(
        {
          title: `Resolve: ${a.metric} on ${a.dataset}`,
          hypothesis_null: `H0: Under matched conditions, the true ${a.metric} equals ${b.result_value}; ${a.result_value} is not reproducible.`,
          hypothesis_alternative: `H1: Under matched conditions the true ${a.metric} equals ${a.result_value}.`,
          variables_held_fixed: [
            a.task,
            a.dataset,
            "training schedule",
            "evaluation protocol",
          ],
          manipulation: `Re-run both configurations across ≥5 seeds with an identical, fully-logged pipeline; ablate the single condition that differs.`,
          discriminating_metric: `Mean ${a.metric} with 95% CI; reject H0 if the CI excludes ${b.result_value}.`,
          expected_outcome_if_paper_a_correct: `Results cluster near ${a.result_value}.`,
          expected_outcome_if_paper_b_correct: `Results cluster near ${b.result_value}.`,
          estimated_conclusiveness: "medium",
          estimated_compute_cost: "~5–10 runs; scale depends on dataset.",
        },
        edgeId
      );
    return NextResponse.json({ plan, engine: "offline" });
  }

  try {
    const { text, model } = await generate(
      MODELS.experiment(),
      experimentPrompt(a, b, reasoning || ""),
      { json: true, thinkingLevel: "low", temperature: 0.4, maxOutputTokens: 3500 }
    );
    return NextResponse.json({
      plan: coerce(extractJson(text), edgeId),
      engine: model,
    });
  } catch (err: any) {
    const plan = DEMO_EXPERIMENTS[edgeId];
    if (plan) return NextResponse.json({ plan, engine: "fallback" });
    return NextResponse.json(
      { error: err?.message?.slice(0, 200) || "Experiment generation failed" },
      { status: 500 }
    );
  }
}
