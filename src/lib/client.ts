"use client";

import type {
  ExtractEvent,
  Claim,
  Reconciliation,
  ExperimentPlan,
  Paper,
  CandidateEdge,
} from "./types";

/** POST files (or demo flag) and stream NDJSON extraction events to `onEvent`. */
export async function streamExtract(
  opts: { files?: File[]; demo?: boolean; demoLive?: boolean },
  onEvent: (ev: ExtractEvent) => void
): Promise<void> {
  const fd = new FormData();
  if (opts.demoLive) fd.set("demo", "live");
  else if (opts.demo) fd.set("demo", "1");
  for (const f of opts.files || []) fd.append("files", f);

  const res = await fetch("/api/extract", { method: "POST", body: fd });
  if (!res.body) throw new Error("No stream");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const l of lines) {
      const t = l.trim();
      if (!t) continue;
      try {
        onEvent(JSON.parse(t) as ExtractEvent);
      } catch {
        /* ignore partial */
      }
    }
  }
  if (buf.trim()) {
    try {
      onEvent(JSON.parse(buf.trim()) as ExtractEvent);
    } catch {
      /* ignore */
    }
  }
}

export async function reconcile(
  a: Claim,
  b: Claim
): Promise<{ reconciliation: Reconciliation; engine: string; thinking?: string | null }> {
  const res = await fetch("/api/reconcile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ a, b }),
  });
  return res.json();
}

export async function generateExperiment(
  a: Claim,
  b: Claim,
  reasoning: string,
  edgeId: string
): Promise<{ plan: ExperimentPlan; engine: string }> {
  const res = await fetch("/api/experiment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ a, b, reasoning, edgeId }),
  });
  return res.json();
}

/** Stream a chat answer token-by-token; returns the full text + engine. */
export async function askChatStream(
  question: string,
  papers: Paper[],
  claims: Claim[],
  edges: CandidateEdge[],
  onToken: (delta: string, full: string) => void
): Promise<{ answer: string; engine: string }> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, papers, claims, edges }),
  });
  const engine = res.headers.get("X-Engine") || "gemini";
  if (!res.body) {
    const answer = await res.text();
    onToken(answer, answer);
    return { answer, engine };
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const delta = decoder.decode(value, { stream: true });
    if (delta) {
      full += delta;
      onToken(delta, full);
    }
  }
  return { answer: full, engine };
}
