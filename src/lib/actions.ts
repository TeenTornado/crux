"use client";

import { useStore } from "./store";
import {
  streamExtract,
  reconcile,
  generateExperiment,
  askChatStream,
} from "./client";
import { buildCandidateEdges } from "./graph";
import { DEMO_EXPERIMENTS, DEMO_RECONCILIATIONS } from "./demoData";
import {
  persistCurrentSession,
  persistExperiment,
  persistChatTurn,
  logStep,
} from "./persistence";
import { toast } from "./toast";
import type { Claim, CandidateEdge, ExperimentPlan } from "./types";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run extraction (demo or live), streaming claims into the store. */
export async function runExtraction(opts: {
  files?: File[];
  demo?: boolean;
  demoLive?: boolean;
}) {
  const s = useStore.getState();
  // Ensure a session exists (direct deep-links may skip the intro screen).
  if (!s.sessionId) s.startSession();
  s.reset();
  s.setPhase("extracting");
  s.setStatus("Starting extraction…");

  const collectedPapers: any[] = [];
  const collectedClaims: Claim[] = [];

  await streamExtract(opts, (ev) => {
    const st = useStore.getState();
    switch (ev.type) {
      case "paper":
        collectedPapers.push(ev.paper);
        st.addPaper(ev.paper);
        break;
      case "status":
        st.setStatus(ev.message);
        break;
      case "progress":
        st.setStatus(
          `Extracting · chunk ${ev.done}/${ev.total} · ${ev.heading}${
            ev.ms ? ` · ${Math.round(ev.ms / 1000)}s` : ""
          }`
        );
        break;
      case "claim":
        collectedClaims.push(ev.claim);
        st.addClaim(ev.claim);
        break;
      case "done":
        st.setSource(ev.source);
        st.finalizeExtraction(ev.papers, ev.claims);
        st.setStatus(
          `${ev.claims.length} claims from ${ev.papers.length} papers`
        );
        break;
      case "error":
        st.setStatus(`Extraction error: ${ev.message}`);
        break;
    }
  });

  // Safety net if no "done" event arrived.
  const after = useStore.getState();
  if (after.phase === "extracting" && after.claims.length > 0) {
    after.finalizeExtraction(
      collectedPapers,
      collectedClaims.length ? collectedClaims : after.claims
    );
  }

  // Auto-save after extraction completes.
  const done = useStore.getState();
  logStep("extract", `${done.claims.length} claims · ${done.papers.length} papers`);
  persistCurrentSession();
}

/**
 * Authenticity path: run the demo papers through REAL Gemma 4 extraction and
 * REAL Gemini reconciliation (no curated data), so it can be verified live.
 */
export async function runLiveDemo() {
  const s = useStore.getState();
  if (!s.sessionId) s.startSession({ name: "Demo · SparseViT (live)" });
  else s.setSessionName("Demo · SparseViT (live)");
  await runExtraction({ demoLive: true });
  await runReconciliation(); // source is "gemma-hosted" → live Gemini, not curated
}

/** Reconcile every candidate edge sequentially, animating each as it resolves. */
export async function runReconciliation() {
  const s = useStore.getState();
  let edges = s.edges;
  if (edges.length === 0) {
    edges = buildCandidateEdges(s.claims);
    s.setEdges(edges);
  }
  s.setPhase("reconciling");
  const total = edges.length;
  s.setReconcileProgress(0, total);

  const claimMap = new Map(s.claims.map((c) => [c.claim_id, c]));

  for (let i = 0; i < edges.length; i++) {
    const e = edges[i];
    const a = claimMap.get(e.source_claim_id);
    const b = claimMap.get(e.target_claim_id);
    if (!a || !b) continue;
    const st = useStore.getState();
    const isDemo = st.source === "demo";
    st.setEdgeReconciling(e.edge_id);
    st.setStatus(`Diagnosing conditions · pair ${i + 1} of ${total}…`);
    await wait(isDemo ? 520 : 280); // let the animated edge register visually
    try {
      if (isDemo && DEMO_RECONCILIATIONS[e.edge_id]) {
        // Curated demo path — instant, high-quality, no network.
        useStore.getState().setReconciliation(
          e.edge_id,
          DEMO_RECONCILIATIONS[e.edge_id]
        );
      } else {
        const { reconciliation, engine } = await reconcile(a, b);
        // Keep the producing engine on the verdict so the UI can honestly
        // label "reconciled on-device · gemma4:e4b" vs Gemini vs guard.
        useStore.getState().setReconciliation(e.edge_id, { ...reconciliation, engine });
      }
    } catch {
      // leave as pending; keep going
    }
    useStore.getState().setReconcileProgress(i + 1, total);
    persistCurrentSession(); // auto-save after each reconciliation resolves
    await wait(120);
  }

  const done = useStore.getState();
  done.setPhase("reconciled");
  done.setStatus("Reconciliation complete");
  const verdicts = done.edges.filter((e) => e.reconciliation).length;
  logStep("reconcile", `${verdicts} pairs reconciled`);
  persistCurrentSession();

  // Change 2 — close the decide→act gap: the agent executes the top of its
  // NEXT queue once per reconciliation run (skip-if-already-experimented makes
  // re-runs a no-op, so this can never runaway-fire).
  await agentActOnNext();
}

const edgeActLabel = (e: CandidateEdge) =>
  `${e.dataset || e.task || "pair"} · ${e.metric}`.slice(0, 60);

/**
 * The agent's decide step as a pure function: what should be done next, given
 * the reconciled edges and existing experiments?
 *  1. highest-confidence GENUINE_CONTRADICTION without an experiment → act
 *  2. else a needs_human_review pair → defer to the human (the handoff boundary)
 *  3. else reconciled edges exist → nothing to falsify; report the review
 */
export function pickAgentAction(
  edges: CandidateEdge[],
  experiments: Record<string, ExperimentPlan>
):
  | { kind: "experiment"; edge: CandidateEdge }
  | { kind: "handoff"; edge: CandidateEdge }
  | { kind: "review" }
  | null {
  const reconciled = edges.filter((e) => e.reconciliation);
  if (reconciled.length === 0) return null;
  const genuine = reconciled
    .filter((e) => e.reconciliation!.verdict === "GENUINE_CONTRADICTION")
    .sort(
      (a, b) =>
        (b.reconciliation?.confidence ?? 0) - (a.reconciliation?.confidence ?? 0)
    );
  const target = genuine.find((e) => !experiments[e.edge_id]);
  if (target) return { kind: "experiment", edge: target };
  const review = reconciled.find((e) => e.reconciliation!.needs_human_review);
  if (review) return { kind: "handoff", edge: review };
  return { kind: "review" };
}

/**
 * Change 2 — the ACT step. High-confidence contradictions are acted on
 * autonomously (experiment auto-designed, on-device in Local Mode via the same
 * /api/experiment path); low-confidence pairs are explicitly deferred to the
 * human. Either way the agent decides — and says so visibly.
 */
async function agentActOnNext() {
  const st = useStore.getState();
  const act = pickAgentAction(st.edges, st.experiments);
  if (!act) return;

  if (act.kind === "experiment") {
    const label = edgeActLabel(act.edge);
    st.selectEdge(act.edge.edge_id); // auto-open the edge panel — the act is visible
    st.setStatus(`Agent → acting on NEXT: designing experiment · ${label}`);
    toast("⚡ Agent acted on NEXT queue — auto-designing the experiment for the top contradiction");
    const plan = await runExperiment(act.edge.edge_id);
    const after = useStore.getState();
    if (plan) {
      after.setLastAgentAction(`auto-designed experiment · ${label}`);
      after.setStatus(`Agent: experiment designed autonomously · ${plan.title.slice(0, 60)}`);
      logStep("experiment", `agent auto-designed · ${label}`);
    } else {
      after.setLastAgentAction(`experiment design failed · ${label} — deferred to you`);
      after.setStatus("Agent: experiment design failed — your move");
    }
    return;
  }

  if (act.kind === "handoff") {
    const label = edgeActLabel(act.edge);
    st.selectEdge(act.edge.edge_id);
    st.setLastAgentAction(`deferred to human · ${label} needs your judgment`);
    st.setStatus(`Agent → handing off: ${label} is low-confidence — your judgment needed`);
    toast("Agent defers to you — a low-confidence pair needs human review");
    return;
  }

  // No genuine contradictions and nothing flagged: the agent reports its review.
  st.setLastAgentAction("reviewed queue — no genuine contradictions to falsify");
  st.setStatus("Agent: reviewed all pairs — divergences/agreements only, nothing to falsify");
}

/** Generate (or fetch cached) an experiment plan for a genuine contradiction. */
export async function runExperiment(edgeId: string) {
  const s = useStore.getState();
  if (s.experiments[edgeId]) return s.experiments[edgeId];
  const edge = s.edges.find((e) => e.edge_id === edgeId);
  if (!edge) return null;

  // Demo corpus → resolve the curated POPPER plan instantly (no network), but
  // keep a short beat so the "designing…" state is visible.
  if (s.source === "demo" && DEMO_EXPERIMENTS[edgeId]) {
    await wait(900);
    const plan = DEMO_EXPERIMENTS[edgeId];
    useStore.getState().setExperiment(edgeId, plan);
    logStep("experiment", plan.title);
    persistExperiment(plan);
    return plan;
  }

  const a = s.claims.find((c) => c.claim_id === edge.source_claim_id);
  const b = s.claims.find((c) => c.claim_id === edge.target_claim_id);
  if (!a || !b) return null;
  const { plan: rawPlan, engine } = await generateExperiment(
    a,
    b,
    edge.reconciliation?.reasoning || "",
    edgeId
  );
  // Keep the producing engine on the plan: "generated on-device · gemma4:e4b"
  // vs Gemini vs deterministic template — never fake the provenance.
  const plan = { ...rawPlan, engine };
  useStore.getState().setExperiment(edgeId, plan);
  logStep("experiment", plan.title);
  persistExperiment(plan);
  return plan;
}

// ── Chat (shared across the Ask panel and the expanded overlay) ──────────────

function chatUid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `turn-${Date.now()}-${Math.random()}`;
}

function detectReferencedClaims(answer: string): string[] {
  const st = useStore.getState();
  const out = new Set<string>();
  for (const c of st.claims) {
    const paper = st.papers.find((p) => p.paper_id === c.paper_id);
    const handleHit =
      paper && new RegExp(`\\bpaper ${paper.handle}\\b`, "i").test(answer);
    const valueHit = c.result_value && answer.includes(c.result_value);
    if (
      valueHit ||
      (handleHit && c.result_value && answer.includes(c.result_value.slice(0, 4)))
    )
      out.add(c.claim_id);
  }
  return [...out].slice(0, 3);
}

/**
 * Send a chat message. Streaming state lives in the store so the Ask panel and
 * the expanded conversation view stay perfectly in sync.
 */
export async function sendChat(text: string) {
  const q = text.trim();
  const st = useStore.getState();
  if (!q || st.chatPending || !st.sessionId) return;
  const sessionId = st.sessionId;

  const userTurn = {
    turn_id: chatUid(),
    session_id: sessionId,
    role: "user" as const,
    content: q,
    timestamp: Date.now(),
    referenced_claim_ids: [],
  };
  st.addChatTurn(userTurn);
  persistChatTurn(userTurn);
  st.setChatPending(true);
  st.setChatStreaming("");

  // Convenience: jump the graph to the strongest contradiction.
  if (/strongest|contradiction|resolve/i.test(q)) {
    const contra = useStore
      .getState()
      .edges.find((e) => e.reconciliation?.verdict === "GENUINE_CONTRADICTION");
    if (contra) useStore.getState().selectEdge(contra.edge_id);
  }

  try {
    const { papers, claims, edges } = useStore.getState();
    const { answer, engine } = await askChatStream(
      q,
      papers,
      claims,
      edges,
      (_d, full) => useStore.getState().setChatStreaming(full)
    );
    const assistant = {
      turn_id: chatUid(),
      session_id: sessionId,
      role: "assistant" as const,
      content: answer,
      timestamp: Date.now(),
      referenced_claim_ids: detectReferencedClaims(answer),
      engine,
    };
    useStore.getState().addChatTurn(assistant);
    persistChatTurn(assistant);
    logStep("chat", q.slice(0, 60));
  } catch {
    useStore.getState().addChatTurn({
      turn_id: chatUid(),
      session_id: sessionId,
      role: "assistant",
      content: "Something went wrong reaching the chat model.",
      timestamp: Date.now(),
      referenced_claim_ids: [],
    });
  } finally {
    useStore.getState().setChatStreaming(null);
    useStore.getState().setChatPending(false);
  }
}

export function regenerateChat() {
  const chat = useStore.getState().chat;
  const lastUser = [...chat].reverse().find((t) => t.role === "user");
  if (lastUser) sendChat(lastUser.content);
}

/** True while Judge Mode is on. Sleep in small chunks so we can bail fast. */
async function judgeSleep(ms: number) {
  const step = 200;
  for (let t = 0; t < ms; t += step) {
    if (!useStore.getState().judgeMode) return;
    await wait(Math.min(step, ms - t));
  }
}

/**
 * Unattended ~90s loop for the booth: extract → graph builds → contradiction
 * surfaces → resolves → experiment appears → hold → reset → repeat.
 */
export async function runJudgeMode() {
  while (useStore.getState().judgeMode) {
    const st = useStore.getState();
    st.reset();
    st.selectClaim(null);
    st.selectEdge(null);
    if (!useStore.getState().judgeMode) break;

    // 1) Extract + reconcile the demo corpus.
    await runExtraction({ demo: true });
    if (!useStore.getState().judgeMode) break;
    await runReconciliation();
    if (!useStore.getState().judgeMode) break;

    await judgeSleep(1600);

    // 2) Surface the contradiction — select it so the graph focuses + panel opens.
    const contra = useStore
      .getState()
      .edges.find((e) => e.reconciliation?.verdict === "GENUINE_CONTRADICTION");
    if (contra) {
      useStore.getState().selectEdge(contra.edge_id);
      useStore.getState().setStatus("Contradiction found — diagnosing…");
      await judgeSleep(2600);

      // 3) Generate the resolving experiment.
      if (!useStore.getState().judgeMode) break;
      useStore.getState().setStatus("Generating resolving experiment…");
      await runExperiment(contra.edge_id);
      useStore.getState().setStatus("Experiment plan ready");
    }

    // 4) Hold on the payoff, then loop (~90s total cadence).
    await judgeSleep(9000);
    if (!useStore.getState().judgeMode) break;

    // Briefly show a divergence for contrast.
    const div = useStore
      .getState()
      .edges.find(
        (e) => e.reconciliation?.verdict === "CONTEXT_CONDITIONED_DIVERGENCE"
      );
    if (div) {
      useStore.getState().selectEdge(div.edge_id);
      await judgeSleep(5000);
    }

    await judgeSleep(3000);
  }
}
