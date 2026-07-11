"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "@/lib/store";
import { sendChat, regenerateChat } from "@/lib/actions";
import { useTypewriter } from "@/lib/useTypewriter";
import { Markdown } from "./Markdown";
import type { ChatTurn } from "@/lib/db";
import {
  Send,
  Sparkles,
  Copy,
  Check,
  RotateCcw,
  ArrowUpRight,
  Loader2,
  Circle,
} from "lucide-react";

const SUGGESTIONS = [
  "Which contradiction is strongest?",
  "Explain the divergence between Paper A and Paper B",
  "What experiment should I run first?",
  "Summarize what the papers agree on",
];

export function Conversation({ variant = "panel" }: { variant?: "panel" | "full" }) {
  const chat = useStore((s) => s.chat);
  const claims = useStore((s) => s.claims);
  const streaming = useStore((s) => s.chatStreaming);
  const pending = useStore((s) => s.chatPending);
  const agentLog = useStore((s) => s.agentLog);
  const agentBusy = useStore((s) => s.agentBusy);
  const phase = useStore((s) => s.phase);
  const computeMode = useStore((s) => s.computeMode);
  const localMode = computeMode === "local";
  const runBusy = phase === "extracting" || phase === "reconciling" || !!agentBusy;
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const wide = variant === "full";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" });
  }, [chat.length, streaming, pending, agentLog.length]);

  // Auto-grow the composer.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = Math.min(ta.scrollHeight, 180) + "px";
  }, [input]);

  const send = useCallback((text: string) => {
    if (!text.trim()) return;
    setInput("");
    sendChat(text);
  }, []);

  const regenerate = useCallback(() => regenerateChat(), []);

  const isEmpty = chat.length === 0 && !pending;

  return (
    <div className="flex h-full flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className={`mx-auto w-full ${wide ? "max-w-3xl px-6 py-8" : "px-4 py-4"}`}>
          {isEmpty ? (
            agentLog.length > 0 ? (
              <>
                <AgentRunCard wide={wide} />
                {!runBusy && <ContinueChat wide={wide} onPick={send} />}
              </>
            ) : (
              <EmptyState wide={wide} onPick={send} claims={claims.length} />
            )
          ) : (
            <div className={wide ? "space-y-7" : "space-y-5"}>
              {chat.map((t, i) => (
                <MessageRow
                  key={t.turn_id}
                  turn={t}
                  wide={wide}
                  isLast={i === chat.length - 1}
                  onRegenerate={regenerate}
                />
              ))}
              {/* The agent's run arrives at the bottom, like a new message */}
              {agentLog.length > 0 && <AgentRunCard wide={wide} />}
              {pending && (
                <StreamingRow wide={wide} content={streaming || ""} />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className={`border-t border-paper/10 ${wide ? "px-6 py-4" : "px-3 py-3"}`}>
        <div className="mx-auto w-full max-w-3xl">
          {isEmpty && agentLog.length === 0 && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.slice(0, wide ? 4 : 3).map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-ink-600 bg-ink-900/50 px-2.5 py-2 text-[11px] text-paper-dim transition-colors hover:border-gold-dim/50 hover:text-paper lg:py-1"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-ink-500 bg-ink-900/60 px-3 py-2 transition-colors focus-within:border-gold-dim/60">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              disabled={localMode}
              placeholder={
                localMode
                  ? "Chat is cloud-only (Gemini) — disabled in Local mode"
                  : "Ask about a contradiction, claim, or paper…"
              }
              className="max-h-44 flex-1 resize-none bg-transparent py-1 text-[16px] leading-relaxed text-paper placeholder:text-paper-faint focus:outline-none disabled:opacity-50 lg:text-[13.5px]"
            />
            <button
              onClick={() => send(input)}
              disabled={pending || !input.trim() || localMode}
              className="mb-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-gold text-ink-900 transition-colors hover:bg-gold-soft disabled:bg-ink-600 disabled:text-paper-faint"
            >
              <Send size={15} />
            </button>
          </div>
          <p className="mt-1.5 text-center font-mono text-[9.5px] text-paper-faint">
            {localMode
              ? "Local mode — extraction, verdicts & experiments on-device; chat needs Auto/Cloud"
              : "Grounded in your evidence graph · numbers are reported, verify against sources"}
          </p>
        </div>
      </div>
    </div>
  );
}

function EmptyState({
  wide,
  onPick,
  claims,
}: {
  wide: boolean;
  onPick: (s: string) => void;
  claims: number;
}) {
  return (
    <div className={`flex flex-col items-center justify-center text-center ${wide ? "pt-24" : "pt-16"}`}>
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-gold-dim/50 bg-gold/10">
        <Sparkles size={18} className="text-gold-soft" />
      </div>
      <h3 className="mb-1.5 font-serif text-[18px] text-paper">
        Chat with your evidence graph
      </h3>
      <p className="mb-5 max-w-sm text-[12.5px] leading-relaxed text-paper-faint">
        Ask why two papers disagree, which contradiction to test first, or what a
        result depends on. Grounded in your {claims} claims and their reconciliations.
      </p>
      {!wide && (
        <div className="w-full space-y-1.5">
          {SUGGESTIONS.slice(0, 3).map((s) => (
            <button
              key={s}
              onClick={() => onPick(s)}
              className="block w-full rounded-lg border border-ink-600 bg-ink-900/50 px-3 py-3 text-left text-[12px] text-paper-dim transition-colors hover:border-gold-dim/50 hover:text-paper lg:py-2"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const RUN_TONE: Record<string, string> = {
  info: "text-paper-dim",
  gold: "text-gold-soft",
  sage: "text-sage-soft",
  rust: "text-rust-soft",
};

const fmtClock = (ms: number) => {
  const sec = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
};

/**
 * The agent's live worklog, Claude-Code style: finished steps check off with
 * their timings, the current step types itself out with a cursor, and the
 * remaining queue sits below as todos. Replaces the chat empty-state while a
 * run exists; sits above the thread once you start chatting.
 */
function AgentRunCard({ wide }: { wide: boolean }) {
  const log = useStore((s) => s.agentLog);
  const startedAt = useStore((s) => s.runStartedAt);
  const agentBusy = useStore((s) => s.agentBusy);
  const phase = useStore((s) => s.phase);
  const status = useStore((s) => s.statusMessage);
  const progress = useStore((s) => s.reconcileProgress);
  const edges = useStore((s) => s.edges);
  const experiments = useStore((s) => s.experiments);
  const [, tick] = useState(0);

  const busy = phase === "extracting" || phase === "reconciling" || !!agentBusy;

  // "I'm doing this right now" — the animated current line.
  const currentText = agentBusy
    ? `⚡ ${agentBusy.label}`
    : busy
    ? status || (phase === "extracting" ? "Extracting…" : "Reconciling…")
    : "";

  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [busy]);

  // The remaining queue — the agent's todo list.
  const todos: string[] = [];
  if (phase === "extracting") {
    todos.push("ground claims → build candidate edges", "reconcile pairs", "act on the top contradiction");
  } else if (phase === "reconciling") {
    const left = Math.max(0, progress.total - progress.done);
    if (left > 0) todos.push(`reconcile ${left} remaining pair${left === 1 ? "" : "s"}`);
    todos.push("act on the top contradiction — or hand off");
  } else {
    const rec = edges.filter((e) => e.reconciliation);
    const genuine = rec
      .filter((e) => e.reconciliation!.verdict === "GENUINE_CONTRADICTION")
      .find((e) => !experiments[e.edge_id]);
    const review = rec.find((e) => e.reconciliation!.needs_human_review);
    if (agentBusy) todos.push("attach the experiment to the edge");
    else if (genuine) todos.push(`design experiment · ${genuine.dataset || genuine.task} · ${genuine.metric}`.slice(0, 56));
    else if (review) todos.push(`your review · ${(review.dataset || review.task)} · ${review.metric}`.slice(0, 56));
  }

  const lastTs = log[log.length - 1]?.ts ?? Date.now();
  const elapsed = startedAt ? fmtClock((busy ? Date.now() : lastTs) - startedAt) : "";

  return (
    <div className={`card-enter ${wide ? "mx-auto max-w-2xl" : ""} mb-5`}>
      <div className="mb-1.5 flex items-center gap-2">
        <Avatar />
        <span className="font-serif text-[12.5px] font-semibold text-paper">Crux</span>
        <span className="font-mono text-[9px] uppercase tracking-wide text-paper-faint">
          agent run
        </span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-[9.5px] text-paper-dim">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              busy ? "animate-pulse bg-gold" : "bg-sage"
            }`}
          />
          {log.length} steps{elapsed && ` · ⏱ ${elapsed}`}
        </span>
      </div>

      <div className="rounded-xl border border-ink-600/70 bg-ink-800/50 px-3.5 py-2.5 pl-8">
        {/* done steps */}
        {log.map((e) => (
          <div key={e.id} className="card-enter flex items-baseline gap-2 py-[2.5px]">
            <Check size={11} className={`shrink-0 translate-y-[1.5px] ${RUN_TONE[e.tone]}`} />
            <span className={`min-w-0 flex-1 font-mono text-[10.5px] leading-snug ${RUN_TONE[e.tone]}`}>
              {e.text}
              {e.ms != null && (
                <span className="text-paper-faint"> · {(e.ms / 1000).toFixed(1)}s</span>
              )}
            </span>
            <span className="shrink-0 font-mono text-[8.5px] text-paper-faint">
              {startedAt ? `+${fmtClock(e.ts - startedAt)}` : ""}
            </span>
          </div>
        ))}

        {/* the current step — typing (keyed so each new status retypes) */}
        {busy && (
          <div className="flex items-baseline gap-2 py-[2.5px]">
            <Loader2 size={11} className="shrink-0 translate-y-[1.5px] animate-spin text-gold-soft" />
            <span className="min-w-0 flex-1 font-mono text-[10.5px] leading-snug text-gold-soft">
              <TypeLine key={currentText} text={currentText} />
              {agentBusy && (
                <span className="text-paper-faint">
                  {" "}· {Math.floor((Date.now() - agentBusy.since) / 1000)}s
                </span>
              )}
            </span>
          </div>
        )}

        {/* the queue — what's next */}
        {todos.length > 0 && (
          <div className="mt-1.5 border-t border-ink-600/60 pt-1.5">
            {todos.map((t) => (
              <div key={t} className="flex items-baseline gap-2 py-[2px] opacity-60">
                <Circle size={9} className="shrink-0 translate-y-[1px] text-paper-faint" />
                <span className="min-w-0 flex-1 font-mono text-[10px] leading-snug text-paper-faint">
                  {t}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One retyping status line — remounted (via key) whenever the text changes. */
function TypeLine({ text }: { text: string }) {
  const { shown } = useTypewriter(text, true, 140);
  return (
    <>
      {shown}
      <span className="ml-0.5 inline-block h-2.5 w-[3px] animate-pulse rounded-full bg-gold-soft align-middle" />
    </>
  );
}

/** The "keep talking to it" affordance under the run card. */
function ContinueChat({ wide, onPick }: { wide: boolean; onPick: (s: string) => void }) {
  return (
    <div className={`${wide ? "mx-auto max-w-2xl" : ""} pl-8`}>
      <div className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-paper-faint">
        Continue the conversation
      </div>
      <div className="flex flex-wrap gap-1.5">
        {[
          "Why did you flag that pair as the top contradiction?",
          ...SUGGESTIONS.slice(0, 2),
        ].map((s) => (
          <button
            key={s}
            onClick={() => onPick(s)}
            className="rounded-full border border-ink-600 bg-ink-900/50 px-2.5 py-2 text-left text-[11px] text-paper-dim transition-colors hover:border-gold-dim/50 hover:text-paper lg:py-1"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function Avatar() {
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-gold-dim/50 bg-gold/10">
      <img src="/Crux_Logo.png" alt="" className="h-full w-full scale-[1.6] object-contain" />
    </div>
  );
}

function MessageRow({
  turn,
  wide,
  isLast,
  onRegenerate,
}: {
  turn: ChatTurn;
  wide: boolean;
  isLast: boolean;
  onRegenerate: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const selectClaim = useStore((s) => s.selectClaim);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const setExpanded = useStore((s) => s.setChatExpanded);
  const claims = useStore((s) => s.claims);
  const papers = useStore((s) => s.papers);

  if (turn.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-ink-700 px-3.5 py-2 text-[13.5px] leading-relaxed text-paper">
          {turn.content}
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      <div className="mb-1.5 flex items-center gap-2">
        <Avatar />
        <span className="font-serif text-[12.5px] font-semibold text-paper">Crux</span>
        {turn.engine && (
          <span className="font-mono text-[9px] text-paper-faint">{turn.engine}</span>
        )}
      </div>
      <div className="pl-8">
        <Markdown content={turn.content} />

        {turn.referenced_claim_ids.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {turn.referenced_claim_ids.map((cid) => {
              const c = claims.find((x) => x.claim_id === cid);
              if (!c) return null;
              const p = papers.find((x) => x.paper_id === c.paper_id);
              return (
                <button
                  key={cid}
                  onClick={() => {
                    selectClaim(cid);
                    setActiveTab("context");
                    setExpanded(false);
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-gold-dim/40 bg-gold/8 px-1.5 py-0.5 font-mono text-[9.5px] text-gold-soft transition-colors hover:bg-gold/15"
                >
                  <ArrowUpRight size={10} />
                  {c.metric} · Paper {p?.handle}
                </button>
              );
            })}
          </div>
        )}

        {/* actions */}
        <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(turn.content).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1400);
              });
            }}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9.5px] text-paper-faint transition-colors hover:text-paper"
          >
            {copied ? <Check size={11} /> : <Copy size={11} />}
            {copied ? "Copied" : "Copy"}
          </button>
          {isLast && (
            <button
              onClick={onRegenerate}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9.5px] text-paper-faint transition-colors hover:text-paper"
            >
              <RotateCcw size={11} /> Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function StreamingRow({ wide, content }: { wide: boolean; content: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <Avatar />
        <span className="font-serif text-[12.5px] font-semibold text-paper">Crux</span>
      </div>
      <div className="pl-8">
        {content ? (
          <div className="relative">
            <Markdown content={content} />
            <span className="ml-0.5 inline-block h-3.5 w-[3px] translate-y-0.5 animate-pulse rounded-full bg-gold-soft align-middle" />
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[12px] text-paper-faint">
            <span className="flex gap-0.5">
              <Dot d={0} /> <Dot d={0.15} /> <Dot d={0.3} />
            </span>
            Crux is thinking…
          </div>
        )}
      </div>
    </div>
  );
}

function Dot({ d }: { d: number }) {
  return (
    <span
      className="inline-block h-1 w-1 animate-bounce rounded-full bg-paper-faint"
      style={{ animationDelay: `${d}s` }}
    />
  );
}
