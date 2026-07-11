"use client";

import { create } from "zustand";
import type {
  Claim,
  Paper,
  CandidateEdge,
  ExperimentPlan,
  Reconciliation,
  ExtractSource,
} from "./types";
import type { ChatTurn, Session } from "./db";
import { buildCandidateEdges, splitCompoundCoefficients } from "./graph";
import { buildDemoState } from "./demoData";
import { savePrefs, type Prefs, type ComputeMode } from "./prefs";

/** One step in the agent's visible activity feed (Ask tab). Transient. */
export interface AgentLogEntry {
  id: string;
  ts: number;
  text: string;
  tone: "info" | "gold" | "sage" | "rust";
  ms?: number; // measured duration of the step, when known
}

export type Phase =
  | "idle"
  | "extracting"
  | "extracted"
  | "reconciling"
  | "reconciled";

interface UIState {
  selectedClaimId: string | null;
  selectedEdgeId: string | null;
  hoveredSpanClaimId: string | null;
  /** The agent's most recent autonomous act on the NEXT queue (Change 2). */
  lastAgentAction: string | null;
}

interface AppState extends UIState {
  phase: Phase;
  source: ExtractSource | null;
  statusMessage: string;
  papers: Paper[];
  claims: Claim[];
  edges: CandidateEdge[];
  experiments: Record<string, ExperimentPlan>;
  reconcileProgress: { done: number; total: number };
  judgeMode: boolean;
  // The agent's step-by-step activity feed (Ask tab) + run clock
  agentLog: AgentLogEntry[];
  runStartedAt: number | null;
  /** In-flight agent act (drives the generating animation in the feed). */
  agentBusy: { label: string; since: number } | null;
  searchQuery: string;
  sourceViewClaimId: string | null;

  // session + persistence
  sessionId: string | null;
  sessionName: string;
  question: string;
  chat: ChatTurn[];
  chatStreaming: string | null; // in-flight assistant text (shared across views)
  chatPending: boolean;
  entered: boolean; // false → show intro screen

  // compute routing (mirrored to localStorage)
  computeMode: ComputeMode;
  // sidebar UI (mirrored to localStorage)
  sidebarCollapsed: boolean;
  leftCollapsed: boolean; // workspace sources panel → rail
  activeTab: "context" | "ask";
  chatExpanded: boolean;

  // actions
  setJudgeMode: (v: boolean) => void;
  setSearchQuery: (q: string) => void;
  openSource: (claimId: string | null) => void;
  reset: () => void;
  loadDemo: () => void;
  // session
  startSession: (opts?: { question?: string; name?: string }) => string;
  hydrateSession: (data: {
    session: Session;
    chats: ChatTurn[];
    experiments: Record<string, ExperimentPlan>;
  }) => void;
  goToIntro: () => void;
  setSessionName: (n: string) => void;
  setQuestion: (q: string) => void;
  addChatTurn: (turn: ChatTurn) => void;
  setChatStreaming: (v: string | null) => void;
  setChatPending: (v: boolean) => void;
  setChatExpanded: (v: boolean) => void;
  applyPrefs: (p: Prefs) => void;
  setComputeMode: (m: ComputeMode) => void;
  setSidebarCollapsed: (v: boolean) => void;
  toggleSidebar: () => void;
  setLeftCollapsed: (v: boolean) => void;
  toggleLeftSidebar: () => void;
  setActiveTab: (t: "context" | "ask") => void;
  setPhase: (p: Phase) => void;
  setStatus: (m: string) => void;
  setLastAgentAction: (a: string | null) => void;
  startAgentRun: () => void;
  logAgent: (text: string, opts?: { tone?: AgentLogEntry["tone"]; ms?: number }) => void;
  setAgentBusy: (v: { label: string; since: number } | null) => void;
  setSource: (s: ExtractSource) => void;
  addPaper: (p: Paper) => void;
  addClaim: (c: Claim) => void;
  finalizeExtraction: (papers: Paper[], claims: Claim[]) => void;
  setEdges: (edges: CandidateEdge[]) => void;
  setEdgeReconciling: (edgeId: string) => void;
  setReconciliation: (edgeId: string, r: Reconciliation) => void;
  setReconcileProgress: (done: number, total: number) => void;
  setExperiment: (edgeId: string, plan: ExperimentPlan) => void;
  selectClaim: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  setHoveredSpan: (id: string | null) => void;
}

const emptyUI: UIState = {
  selectedClaimId: null,
  selectedEdgeId: null,
  hoveredSpanClaimId: null,
  lastAgentAction: null,
};

export const useStore = create<AppState>((set, get) => ({
  ...emptyUI,
  phase: "idle",
  source: null,
  statusMessage: "",
  papers: [],
  claims: [],
  edges: [],
  experiments: {},
  reconcileProgress: { done: 0, total: 0 },
  judgeMode: false,
  agentLog: [],
  runStartedAt: null,
  agentBusy: null,
  searchQuery: "",
  sourceViewClaimId: null,

  sessionId: null,
  sessionName: "Untitled session",
  question: "",
  chat: [],
  chatStreaming: null,
  chatPending: false,
  entered: false,
  computeMode: "auto",
  sidebarCollapsed: false,
  leftCollapsed: false,
  activeTab: "context",
  chatExpanded: false,

  setJudgeMode: (v) => set({ judgeMode: v }),
  setSearchQuery: (q) => set({ searchQuery: q }),
  openSource: (claimId) => set({ sourceViewClaimId: claimId }),

  startSession: (opts) => {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `session-${Date.now()}`;
    set({
      ...emptyUI,
      agentLog: [],
      runStartedAt: null,
      agentBusy: null,
      sessionId: id,
      sessionName: opts?.name || "Untitled session",
      question: opts?.question || "",
      chat: [],
      entered: true,
      phase: "idle",
      source: null,
      statusMessage: "",
      papers: [],
      claims: [],
      edges: [],
      experiments: {},
      reconcileProgress: { done: 0, total: 0 },
    });
    return id;
  },

  hydrateSession: ({ session, chats, experiments }) =>
    set({
      ...emptyUI,
      // Restore the agent's worklog with the session (busy flag never persists).
      agentLog: session.agent_log ?? [],
      runStartedAt: session.run_started_at ?? null,
      agentBusy: null,
      sessionId: session.id,
      sessionName: session.name,
      question: session.question || "",
      chat: chats,
      entered: true,
      source: session.source,
      papers: session.papers,
      // Split compound scaling claims persisted before the one-node-per-
      // coefficient change, so old sessions can pair without re-extracting.
      claims: splitCompoundCoefficients(session.claims),
      edges: session.edges,
      experiments,
      phase: session.edges.some((e) => e.reconciliation)
        ? "reconciled"
        : session.claims.length
        ? "extracted"
        : "idle",
      reconcileProgress: {
        done: session.edges.filter((e) => e.reconciliation).length,
        total: session.edges.length,
      },
      statusMessage: "",
    }),

  goToIntro: () => set({ entered: false }),
  setSessionName: (n) => set({ sessionName: n }),
  setQuestion: (q) => set({ question: q }),
  addChatTurn: (turn) => set((st) => ({ chat: [...st.chat, turn] })),
  setChatStreaming: (v) => set({ chatStreaming: v }),
  setChatPending: (v) => set({ chatPending: v }),
  setChatExpanded: (v) => set({ chatExpanded: v }),

  applyPrefs: (p) =>
    set({
      computeMode: p.computeMode,
      sidebarCollapsed: p.sidebarCollapsed,
      leftCollapsed: p.leftCollapsed,
      activeTab: p.activeTab,
    }),
  setComputeMode: (m) => {
    savePrefs({ computeMode: m });
    set({ computeMode: m });
  },
  setSidebarCollapsed: (v) => {
    savePrefs({ sidebarCollapsed: v });
    set({ sidebarCollapsed: v });
  },
  toggleSidebar: () => {
    const v = !get().sidebarCollapsed;
    savePrefs({ sidebarCollapsed: v });
    set({ sidebarCollapsed: v });
  },
  setLeftCollapsed: (v) => {
    savePrefs({ leftCollapsed: v });
    set({ leftCollapsed: v });
  },
  toggleLeftSidebar: () => {
    const v = !get().leftCollapsed;
    savePrefs({ leftCollapsed: v });
    set({ leftCollapsed: v });
  },
  setActiveTab: (t) => {
    savePrefs({ activeTab: t });
    set({ activeTab: t, sidebarCollapsed: false });
  },

  reset: () =>
    set({
      ...emptyUI,
      agentLog: [],
      runStartedAt: null,
      agentBusy: null,
      phase: "idle",
      source: null,
      statusMessage: "",
      papers: [],
      claims: [],
      edges: [],
      experiments: {},
      reconcileProgress: { done: 0, total: 0 },
    }),

  loadDemo: () => {
    const s = buildDemoState();
    set({
      ...emptyUI,
      phase: "reconciled",
      source: "demo",
      statusMessage: "Loaded demo corpus",
      papers: s.papers,
      claims: s.claims,
      edges: s.edges,
      // Experiments are generated on-click (kept empty so the demo has a real
      // "Generate experiment" beat), then resolved instantly from the demo set.
      experiments: {},
      reconcileProgress: { done: s.edges.length, total: s.edges.length },
    });
  },

  setPhase: (p) => set({ phase: p }),
  setStatus: (m) => set({ statusMessage: m }),
  setLastAgentAction: (a) => set({ lastAgentAction: a }),
  startAgentRun: () => set({ agentLog: [], runStartedAt: Date.now(), agentBusy: null }),
  setAgentBusy: (v) => set({ agentBusy: v }),
  logAgent: (text, opts) =>
    set((st) => ({
      agentLog: [
        ...st.agentLog.slice(-199), // cap the feed
        {
          id: `alog-${Date.now()}-${st.agentLog.length}`,
          ts: Date.now(),
          text,
          tone: opts?.tone ?? "info",
          ms: opts?.ms,
        },
      ],
    })),
  setSource: (s) => set({ source: s }),
  addPaper: (p) =>
    set((st) =>
      st.papers.some((x) => x.paper_id === p.paper_id)
        ? st
        : { papers: [...st.papers, p] }
    ),
  addClaim: (c) => set((st) => ({ claims: [...st.claims, c] })),

  finalizeExtraction: (papers, rawClaims) => {
    // One node per coefficient (server already splits; this covers demo/live
    // streams and any path that bypassed the extract pipeline).
    const claims = splitCompoundCoefficients(rawClaims);
    const edges = buildCandidateEdges(claims);
    set({ papers, claims, edges, phase: "extracted" });
  },

  setEdges: (edges) => set({ edges }),
  setEdgeReconciling: (edgeId) =>
    set((st) => ({
      edges: st.edges.map((e) =>
        e.edge_id === edgeId ? { ...e, status: "reconciling" } : e
      ),
    })),
  setReconciliation: (edgeId, r) =>
    set((st) => ({
      edges: st.edges.map((e) =>
        e.edge_id === edgeId
          ? { ...e, reconciliation: r, status: "done" }
          : e
      ),
    })),
  setReconcileProgress: (done, total) =>
    set({ reconcileProgress: { done, total } }),
  setExperiment: (edgeId, plan) =>
    set((st) => ({ experiments: { ...st.experiments, [edgeId]: plan } })),

  selectClaim: (id) => set({ selectedClaimId: id, selectedEdgeId: null }),
  selectEdge: (id) => set({ selectedEdgeId: id, selectedClaimId: null }),
  setHoveredSpan: (id) => set({ hoveredSpanClaimId: id }),
}));

// Selectors
export const claimById = (id: string | null) => (s: AppState) =>
  s.claims.find((c) => c.claim_id === id) || null;
export const edgeById = (id: string | null) => (s: AppState) =>
  s.edges.find((e) => e.edge_id === id) || null;
export const paperById = (id: string | null) => (s: AppState) =>
  s.papers.find((p) => p.paper_id === id) || null;
