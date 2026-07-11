"use client";

import { useStore } from "./store";
import {
  dbAvailable,
  debouncedWrite,
  saveSession,
  saveChatTurn,
  saveExperiment,
  logWorkflow,
  getSession,
  getChats,
  getExperiments,
  type Session,
  type ChatTurn,
  type WorkflowStep,
} from "./db";
import { toast } from "./toast";
import type { ExperimentPlan } from "./types";

// Track created_at per session so repeated saves don't overwrite it.
const createdAt = new Map<string, number>();

// Surface storage-quota failures once (throttled) instead of crashing silently.
let lastQuotaWarn = 0;
function onWriteError(e: unknown) {
  const name = (e as any)?.name || "";
  const isQuota =
    name === "QuotaExceededError" ||
    (e as any)?.code === 22 ||
    /quota/i.test(String((e as any)?.message || ""));
  if (isQuota && Date.now() - lastQuotaWarn > 20_000) {
    lastQuotaWarn = Date.now();
    toast(
      "Storage is full — recent changes may not be saved. Try Clear all data.",
      "error",
      5000
    );
  }
  // Non-quota errors are non-fatal; the UI keeps working in memory.
}

export function seedCreatedAt(id: string, ts: number) {
  createdAt.set(id, ts);
}

function deriveName(): string {
  const st = useStore.getState();
  if (st.sessionName && st.sessionName !== "Untitled session")
    return st.sessionName;
  if (st.question) return st.question.slice(0, 60);
  const first = st.papers[0];
  return first ? first.title.slice(0, 60) : "Untitled session";
}

/** Snapshot the current store into a Session record and debounce-write it. */
export function persistCurrentSession() {
  if (!dbAvailable()) return;
  const st = useStore.getState();
  if (!st.sessionId) return;
  const id = st.sessionId;
  if (!createdAt.has(id)) createdAt.set(id, Date.now());

  const session: Session = {
    id,
    name: deriveName(),
    created_at: createdAt.get(id)!,
    updated_at: Date.now(),
    source: st.source,
    papers: st.papers,
    claims: st.claims,
    edges: st.edges,
    question: st.question,
    agent_log: st.agentLog,
    run_started_at: st.runStartedAt,
  };

  debouncedWrite(`session:${id}`, () => {
    saveSession(session).catch(onWriteError);
  });
}

export function logStep(step: WorkflowStep, detail: string) {
  if (!dbAvailable()) return;
  const st = useStore.getState();
  if (!st.sessionId) return;
  logWorkflow({
    event_id:
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `evt-${Date.now()}-${Math.random()}`,
    session_id: st.sessionId,
    step,
    detail,
    timestamp: Date.now(),
  }).catch(() => {});
}

export function persistChatTurn(turn: ChatTurn) {
  if (!dbAvailable()) return;
  saveChatTurn(turn).catch(onWriteError);
  persistCurrentSession();
}

export function persistExperiment(plan: ExperimentPlan) {
  if (!dbAvailable()) return;
  const st = useStore.getState();
  if (!st.sessionId) return;
  saveExperiment({
    ...plan,
    session_id: st.sessionId,
    created_at: Date.now(),
  }).catch(onWriteError);
  persistCurrentSession();
}

/** Load a session (and its chats/experiments) from IndexedDB into the store. */
export async function hydrateSessionById(id: string): Promise<boolean> {
  if (!dbAvailable()) return false;
  const session = await getSession(id);
  if (!session) return false;
  seedCreatedAt(id, session.created_at);
  const [chats, exps] = await Promise.all([getChats(id), getExperiments(id)]);
  const experiments: Record<string, ExperimentPlan> = {};
  for (const e of exps) {
    const { session_id, created_at, ...plan } = e;
    experiments[e.edge_id] = plan as ExperimentPlan;
  }
  useStore.getState().hydrateSession({ session, chats, experiments });
  return true;
}
