"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  Paper,
  Claim,
  CandidateEdge,
  ExperimentPlan,
  ExtractSource,
} from "./types";

// ── Persisted entity types ───────────────────────────────────────────────────

export interface ChatTurn {
  turn_id: string;
  session_id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  referenced_claim_ids: string[];
  engine?: string;
}

export type WorkflowStep =
  | "session_created"
  | "extract"
  | "reconcile"
  | "experiment"
  | "chat";

export interface WorkflowEvent {
  event_id: string;
  session_id: string;
  step: WorkflowStep;
  detail: string;
  timestamp: number;
}

export interface StoredExperiment extends ExperimentPlan {
  session_id: string;
  created_at: number;
}

export interface Session {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  source: ExtractSource | null;
  papers: Paper[];
  claims: Claim[];
  edges: CandidateEdge[];
  /** Reconciliations live on edges; kept denormalized for quick counters. */
  question?: string;
}

// ── Schema ───────────────────────────────────────────────────────────────────

interface CruxDB extends DBSchema {
  sessions: {
    key: string;
    value: Session;
    indexes: { updated_at: number };
  };
  chats: {
    key: string; // turn_id
    value: ChatTurn;
    indexes: { session_id: string };
  };
  workflows: {
    key: string; // event_id
    value: WorkflowEvent;
    indexes: { session_id: string };
  };
  experiments: {
    key: string; // `${session_id}:${edge_id}`
    value: StoredExperiment;
    indexes: { session_id: string };
  };
}

const DB_NAME = "crux";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<CruxDB>> | null = null;

export function getDB() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable on server"));
  }
  if (!dbPromise) {
    dbPromise = openDB<CruxDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        const s = db.createObjectStore("sessions", { keyPath: "id" });
        s.createIndex("updated_at", "updated_at");
        const c = db.createObjectStore("chats", { keyPath: "turn_id" });
        c.createIndex("session_id", "session_id");
        const w = db.createObjectStore("workflows", { keyPath: "event_id" });
        w.createIndex("session_id", "session_id");
        const e = db.createObjectStore("experiments", {
          keyPath: ["session_id", "edge_id"] as any,
        });
        e.createIndex("session_id", "session_id");
      },
    });
  }
  return dbPromise;
}

/** Feature-detect IndexedDB so we can degrade gracefully (e.g. private mode). */
export function dbAvailable(): boolean {
  try {
    return typeof window !== "undefined" && "indexedDB" in window;
  } catch {
    return false;
  }
}

// ── Sessions ─────────────────────────────────────────────────────────────────

export async function saveSession(session: Session): Promise<void> {
  const db = await getDB();
  await db.put("sessions", { ...session, updated_at: Date.now() });
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await getDB();
  return db.get("sessions", id);
}

export async function listSessions(): Promise<Session[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("sessions", "updated_at");
  return all.reverse(); // most recent first
}

export async function renameSession(id: string, name: string): Promise<void> {
  const db = await getDB();
  const s = await db.get("sessions", id);
  if (s) await db.put("sessions", { ...s, name, updated_at: Date.now() });
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("sessions", id);
  for (const store of ["chats", "workflows", "experiments"] as const) {
    const keys = await db.getAllKeysFromIndex(store, "session_id", id);
    const tx = db.transaction(store, "readwrite");
    await Promise.all(keys.map((k) => tx.store.delete(k as any)));
    await tx.done;
  }
}

export async function clearAll(): Promise<void> {
  const db = await getDB();
  await Promise.all(
    (["sessions", "chats", "workflows", "experiments"] as const).map((s) =>
      db.clear(s)
    )
  );
}

// ── Chats ────────────────────────────────────────────────────────────────────

export async function saveChatTurn(turn: ChatTurn): Promise<void> {
  const db = await getDB();
  await db.put("chats", turn);
}

export async function getChats(sessionId: string): Promise<ChatTurn[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("chats", "session_id", sessionId);
  return all.sort((a, b) => a.timestamp - b.timestamp);
}

// ── Workflows ────────────────────────────────────────────────────────────────

export async function logWorkflow(event: WorkflowEvent): Promise<void> {
  const db = await getDB();
  await db.put("workflows", event);
}

export async function getWorkflow(sessionId: string): Promise<WorkflowEvent[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("workflows", "session_id", sessionId);
  return all.sort((a, b) => a.timestamp - b.timestamp);
}

// ── Experiments ──────────────────────────────────────────────────────────────

export async function saveExperiment(exp: StoredExperiment): Promise<void> {
  const db = await getDB();
  await db.put("experiments", exp);
}

export async function getExperiments(
  sessionId: string
): Promise<StoredExperiment[]> {
  const db = await getDB();
  return db.getAllFromIndex("experiments", "session_id", sessionId);
}

// ── Debounced writer ─────────────────────────────────────────────────────────

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounce a write by key (default 500ms) to avoid thrashing IndexedDB. */
export function debouncedWrite(key: string, fn: () => void, ms = 500) {
  const existing = timers.get(key);
  if (existing) clearTimeout(existing);
  timers.set(
    key,
    setTimeout(() => {
      timers.delete(key);
      fn();
    }, ms)
  );
}
