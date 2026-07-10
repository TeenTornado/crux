"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";
import { persistChatTurn } from "@/lib/persistence";
import {
  listSessions,
  deleteSession,
  renameSession,
  clearAll,
  type Session,
  type ChatTurn,
} from "@/lib/db";
import { SessionThumbnail } from "./SessionThumbnail";
import { HomeBlocks } from "./HomeBlocks";
import {
  ArrowUp,
  Sparkles,
  History,
  Trash2,
  Pencil,
  ArrowUpRight,
  Plus,
  Paperclip,
  Cpu,
} from "lucide-react";

const PLACEHOLDERS = [
  "Do LLMs really reason, or just pattern-match?",
  "Does dataset augmentation help low-resource NMT?",
  "Which contradiction in the Chinchilla scaling debate should I test?",
  "Why do two papers report different ImageNet accuracy for the same model?",
];

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `turn-${Date.now()}`;
}

/** Crux spark mark — an 8-point asterisk, à la a conversational home. */
function SparkMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <g stroke="#C1440E" strokeWidth="2.1" strokeLinecap="round">
        <path d="M12 3.2v6.1M12 14.7v6.1M3.2 12h6.1M14.7 12h6.1" />
        <path d="M6.2 6.2l3.1 3.1M14.7 14.7l3.1 3.1M17.8 6.2l-3.1 3.1M9.3 14.7l-3.1 3.1" opacity="0.7" />
      </g>
      <circle cx="12" cy="12" r="1.5" fill="#D9622C" />
    </svg>
  );
}

export function IntroScreen() {
  const router = useRouter();
  const startSession = useStore((s) => s.startSession);
  const addChatTurn = useStore((s) => s.addChatTurn);
  const [question, setQuestion] = useState("");
  const [ph, setPh] = useState(0);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [showResume, setShowResume] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setInterval(() => setPh((p) => (p + 1) % PLACEHOLDERS.length), 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    listSessions().then(setSessions).catch(() => {});
  }, []);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 200) + "px";
  }, [question]);

  const submitQuestion = useCallback(() => {
    const q = question.trim();
    const id = startSession({ question: q, name: q ? q.slice(0, 60) : undefined });
    if (q) {
      const turn: ChatTurn = {
        turn_id: uid(),
        session_id: id,
        role: "user",
        content: q,
        timestamp: Date.now(),
        referenced_claim_ids: [],
      };
      addChatTurn(turn);
      persistChatTurn(turn);
    }
    router.push(`/app/${id}${q ? "?tab=ask" : ""}`);
  }, [question, startSession, addChatTurn, router]);

  const loadDemo = useCallback(() => {
    const q = question.trim();
    const id = startSession({
      question: q || undefined,
      name: "Demo · SparseViT reproduction",
    });
    if (q) {
      const turn: ChatTurn = {
        turn_id: uid(),
        session_id: id,
        role: "user",
        content: q,
        timestamp: Date.now(),
        referenced_claim_ids: [],
      };
      addChatTurn(turn);
      persistChatTurn(turn);
    }
    router.push(`/app/${id}?run=demo`);
  }, [question, startSession, addChatTurn, router]);

  const prefill = useCallback((text: string) => {
    setQuestion(text);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(text.length, text.length);
      }
    });
  }, []);

  const handleFiles = useCallback(
    (files: File[]) => {
      const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
      if (pdfs.length === 0) return;
      const id = startSession({
        name: pdfs[0].name.replace(/\.pdf$/i, "").slice(0, 60),
      });
      router.push(`/app/${id}`);
      // Files can't ride the URL — start extraction now; the global store keeps
      // it running as the session route mounts.
      import("@/lib/actions").then(({ runExtraction, runReconciliation }) => {
        runExtraction({ files: pdfs }).then(() => runReconciliation());
      });
    },
    [startSession, router]
  );



  return (
    <div className="relative h-full overflow-y-auto">
      <HomeBlocks onPrefill={prefill} onLoadDemo={loadDemo} />
      <div className="relative z-10 mx-auto flex min-h-full max-w-[720px] flex-col justify-center px-6 pb-24 pt-16">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          {/* Greeting */}
          <div className="mb-7 flex items-center justify-center gap-3">
            <SparkMark />
            <h1 className="font-serif text-[32px] font-medium leading-tight tracking-tight text-paper md:text-[38px]">
              What shall we interrogate?
            </h1>
          </div>

          {/* Composer */}
          <div className="rounded-[26px] border border-ink-500 bg-ink-800/60 px-4 pb-3 pt-4 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.7)] backdrop-blur transition-colors focus-within:border-gold-dim/50">
            <textarea
              ref={taRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submitQuestion();
                }
              }}
              rows={1}
              placeholder={PLACEHOLDERS[ph]}
              className="max-h-52 min-h-[28px] w-full resize-none bg-transparent text-[16px] leading-relaxed text-paper placeholder:text-paper-faint focus:outline-none"
            />

            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-ink-500 text-paper-dim transition-colors hover:border-paper-faint/60 hover:text-paper sm:h-8 sm:w-8"
                  title="Attach PDFs"
                >
                  <Plus size={16} />
                </button>
                <span
                  className="flex items-center gap-1.5 rounded-full border border-ink-500 px-2.5 py-1 font-mono text-[10px] text-paper-dim"
                  title="Gemma 4 extraction → Gemini 3 reconciliation"
                >
                  <Cpu size={11} className="text-sage-soft" />
                  Gemma 4<span className="text-paper-faint">→</span>Gemini 3
                </span>
              </div>

              <button
                onClick={submitQuestion}
                disabled={!question.trim()}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-gold text-ink-900 transition-colors hover:bg-gold-soft disabled:bg-ink-600 disabled:text-paper-faint sm:h-8 sm:w-8"
                title="Start"
              >
                <ArrowUp size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            multiple
            hidden
            onChange={(e) => handleFiles(Array.from(e.target.files || []))}
          />

          {/* Action chips */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <Chip icon={<Sparkles size={13} className="text-gold-soft" />} label="Load demo corpus" onClick={loadDemo} />
            <Chip icon={<Paperclip size={13} className="text-sage-soft" />} label="Upload PDFs" onClick={() => fileRef.current?.click()} />
            {sessions.length > 0 && (
              <Chip
                icon={<History size={13} className="text-paper-dim" />}
                label={`Resume · ${sessions.length}`}
                active={showResume}
                onClick={() => setShowResume((v) => !v)}
              />
            )}
          </div>
        </motion.div>

        {/* Resume cards */}
        <AnimatePresence>
          {showResume && sessions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              className="mt-6"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-paper-faint">
                  Recent sessions
                </span>
                <button
                  onClick={async () => {
                    await clearAll();
                    setSessions([]);
                    setShowResume(false);
                  }}
                  className="flex items-center gap-1 font-mono text-[10px] text-paper-faint transition-colors hover:text-rust-soft"
                >
                  <Trash2 size={11} /> Clear all data
                </button>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {sessions.map((s) => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    onDeleted={() =>
                      setSessions((prev) => prev.filter((x) => x.id !== s.id))
                    }
                    onRenamed={(name) =>
                      setSessions((prev) =>
                        prev.map((x) => (x.id === s.id ? { ...x, name } : x))
                      )
                    }
                  />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 font-mono text-[10px] uppercase tracking-[0.18em] text-paper-faint">
        Powered by Gemma 4 · Gemini 3
      </div>
    </div>
  );
}

function Chip({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex min-h-[44px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors sm:min-h-0 ${
        active
          ? "border-gold-dim/60 bg-gold/10 text-paper"
          : "border-ink-500 bg-ink-800/40 text-paper-dim hover:border-paper-faint/50 hover:text-paper"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function SessionCard({
  session,
  onDeleted,
  onRenamed,
}: {
  session: Session;
  onDeleted: () => void;
  onRenamed: (name: string) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(session.name);
  const contradictions = session.edges.filter(
    (e) => e.reconciliation?.verdict === "GENUINE_CONTRADICTION"
  ).length;
  const divergences = session.edges.filter(
    (e) => e.reconciliation?.verdict === "CONTEXT_CONDITIONED_DIVERGENCE"
  ).length;
  const agreements = session.edges.filter(
    (e) => e.reconciliation?.verdict === "AGREEMENT"
  ).length;

  return (
    <div className="group relative w-[210px] shrink-0 overflow-hidden rounded-xl border border-ink-500/70 bg-ink-800/50 transition-colors hover:border-gold-dim/40">
      <button onClick={() => router.push(`/app/${session.id}`)} className="block w-full text-left">
        <SessionThumbnail session={session} />
        <div className="p-3">
          {editing ? (
            <input
              autoFocus
              value={name}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === "Enter") {
                  await renameSession(session.id, name);
                  onRenamed(name);
                  setEditing(false);
                }
              }}
              onBlur={async () => {
                await renameSession(session.id, name);
                onRenamed(name);
                setEditing(false);
              }}
              className="w-full rounded border border-ink-500 bg-ink-900 px-1.5 py-0.5 text-[12px] text-paper focus:outline-none"
            />
          ) : (
            <div className="truncate font-serif text-[13px] text-paper">
              {session.name}
            </div>
          )}
          <div className="mt-0.5 font-mono text-[10px] text-paper-faint">
            {relativeTime(session.updated_at)} · {session.papers.length} papers
          </div>
          <div className="mt-2 flex items-center gap-2 font-mono text-[10px]">
            <span className="text-rust-soft">● {contradictions}</span>
            <span className="text-gold-soft">● {divergences}</span>
            <span className="text-sage-soft">● {agreements}</span>
          </div>
        </div>
      </button>
      <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => setEditing(true)}
          className="rounded bg-ink-900/80 p-1 text-paper-faint hover:text-paper"
          title="Rename"
        >
          <Pencil size={11} />
        </button>
        <button
          onClick={async () => {
            await deleteSession(session.id);
            onDeleted();
          }}
          className="rounded bg-ink-900/80 p-1 text-paper-faint hover:text-rust-soft"
          title="Delete"
        >
          <Trash2 size={11} />
        </button>
      </div>
      <div className="pointer-events-none absolute bottom-14 right-2 flex items-center gap-1 rounded-md bg-gold px-2 py-0.5 font-mono text-[10px] font-semibold text-ink-900 opacity-0 transition-opacity group-hover:opacity-100">
        Resume <ArrowUpRight size={11} />
      </div>
    </div>
  );
}

function relativeTime(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
