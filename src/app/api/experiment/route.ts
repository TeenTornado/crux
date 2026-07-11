import { NextRequest, NextResponse } from "next/server";
import { generate, extractJson, hasKey, MODELS } from "@/lib/gemini";
import { experimentPrompt } from "@/lib/prompts";
import { DEMO_EXPERIMENTS } from "@/lib/demoData";
import {
  OLLAMA_HOST,
  OLLAMA_MODEL,
  OLLAMA_KEEP_ALIVE,
  ollamaReachable,
} from "@/lib/ollama";
import type { Claim, ExperimentPlan, Confidence } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POPPER plan via on-device Gemma — same prompt, local backend (Build 2).
 *  >90s or malformed output falls through to the deterministic template. */
async function ollamaExperiment(prompt: string): Promise<unknown> {
  const res = await fetch(`${OLLAMA_HOST}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      format: "json",
      stream: false,
      keep_alive: OLLAMA_KEEP_ALIVE,
      options: { temperature: 0.4, num_ctx: 4096, num_predict: 1400 },
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  const d = await res.json();
  return extractJson(d.response || "{}");
}

/** A local plan must carry the load-bearing fields or we don't trust it. */
function usablePlan(raw: any): boolean {
  return Boolean(raw?.hypothesis_null && raw?.manipulation && raw?.discriminating_metric);
}

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
  const { a, b, reasoning, edgeId, mode } = (await req.json()) as {
    a: Claim;
    b: Claim;
    reasoning: string;
    edgeId: string;
    mode?: "auto" | "local" | "cloud";
  };
  if (!a || !b) {
    return NextResponse.json({ error: "Missing claims" }, { status: 400 });
  }

  const prompt = experimentPrompt(a, b, reasoning || "");
  // Explicit UI mode beats the env default (same rule as the adjudicator).
  const localOnly =
    mode === "local" ||
    (mode !== "cloud" && process.env.RECONCILE_BACKEND === "local");

  // Deterministic scaffold — the honest last resort, clearly labeled.
  const template = () =>
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

  // Local Gemma attempt — same POPPER prompt, on-device backend.
  const tryLocal = async (): Promise<NextResponse | null> => {
    if (!(await ollamaReachable())) return null;
    try {
      const raw = await ollamaExperiment(prompt);
      if (!usablePlan(raw)) return null; // malformed → let caller fall through
      return NextResponse.json({
        plan: coerce(raw, edgeId),
        engine: "gemma:" + OLLAMA_MODEL,
      });
    } catch {
      return null; // timeout (>90s) or model error → fall through to template
    }
  };

  // Local Mode: on-device Gemma → deterministic template. Never touches cloud.
  if (localOnly) {
    const local = await tryLocal();
    if (local) return local;
    return NextResponse.json({ plan: template(), engine: "template" });
  }

  // No key: on-device Gemma → curated demo plan → template.
  if (!hasKey()) {
    const local = await tryLocal();
    if (local) return local;
    const plan = DEMO_EXPERIMENTS[edgeId] || template();
    return NextResponse.json({
      plan,
      engine: DEMO_EXPERIMENTS[edgeId] ? "demo" : "template",
    });
  }

  try {
    const { text, model } = await generate(MODELS.experiment(), prompt, {
      json: true,
      thinkingLevel: "low",
      temperature: 0.4,
      maxOutputTokens: 3500,
    });
    return NextResponse.json({
      plan: coerce(extractJson(text), edgeId),
      engine: model,
    });
  } catch (err: any) {
    // Gemini failed (quota / dead network with a key set): recover locally.
    const local = await tryLocal();
    if (local) return local;
    const plan = DEMO_EXPERIMENTS[edgeId];
    if (plan) return NextResponse.json({ plan, engine: "demo" });
    return NextResponse.json({ plan: template(), engine: "template" });
  }
}
