import { NextRequest } from "next/server";
import { generateStream, hasKey, MODELS } from "@/lib/gemini";
import { chatPrompt, chatSystemPrompt } from "@/lib/prompts";
import type { Claim, Paper, CandidateEdge } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const enc = new TextEncoder();

/** Serialize the graph compactly so Flash can ground answers in it. */
function buildContext(
  papers: Paper[],
  claims: Claim[],
  edges: CandidateEdge[]
): string {
  const pById = new Map(papers.map((p) => [p.paper_id, p]));
  const cById = new Map(claims.map((c) => [c.claim_id, c]));
  const paperLines = papers.map(
    (p) => `Paper ${p.handle}: "${p.title}" (${p.authors}, ${p.year})`
  );
  const claimLines = claims.map((c) => {
    const p = pById.get(c.paper_id);
    return `- [${p?.handle}] ${c.task}/${c.dataset}/${c.metric} = ${c.result_value} (conf ${c.result_confidence}). conditions: ${JSON.stringify(
      c.conditions
    )}`;
  });
  const edgeLines = edges
    .filter((e) => e.reconciliation)
    .map((e) => {
      const a = cById.get(e.source_claim_id);
      const b = cById.get(e.target_claim_id);
      const pa = a && pById.get(a.paper_id);
      const pb = b && pById.get(b.paper_id);
      const r = e.reconciliation!;
      return `- ${pa?.handle} vs ${pb?.handle} on ${e.dataset}/${e.metric}: ${r.verdict} (conf ${r.confidence}). differing: ${r.differing_conditions.join("; ")}`;
    });
  return `PAPERS:\n${paperLines.join("\n")}\n\nCLAIMS:\n${claimLines.join(
    "\n"
  )}\n\nRECONCILIATIONS:\n${edgeLines.join("\n")}`;
}

const OFFLINE_ANSWER =
  "The chat layer needs `GEMINI_API_KEY` to answer freely. From the loaded graph: the **A↔C** ImageNet Top-1 pair is the genuine contradiction (84.2% vs 82.9% under matched 300-epoch recipes); **A↔B** and **B↔C** are context-conditioned divergences driven by training budget.";

export async function POST(req: NextRequest) {
  const { question, papers, claims, edges } = (await req.json()) as {
    question: string;
    papers: Paper[];
    claims: Claim[];
    edges: CandidateEdge[];
  };
  const context = buildContext(papers || [], claims || [], edges || []);

  const stream = new ReadableStream({
    async start(controller) {
      const send = (t: string) => controller.enqueue(enc.encode(t));
      if (!hasKey()) {
        // Simulate streaming for the offline canned answer.
        for (const word of OFFLINE_ANSWER.split(" ")) {
          send(word + " ");
          await new Promise((r) => setTimeout(r, 18));
        }
        controller.close();
        return;
      }
      try {
        await generateStream(
          MODELS.chat(),
          chatPrompt(context, question),
          // No thinking budget — this is grounded Q&A, so keep it fast (~2-5s).
          { system: chatSystemPrompt(), temperature: 0.5, maxOutputTokens: 900 },
          (delta) => send(delta)
        );
      } catch (err: any) {
        send(`\n\n_Chat error: ${err?.message?.slice(0, 120) || "unavailable"}_`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Engine": hasKey() ? MODELS.chat()[0] : "offline",
    },
  });
}
