"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useStore } from "@/lib/store";
import { sendChat, regenerateChat } from "@/lib/actions";
import { Markdown } from "./Markdown";
import type { ChatTurn } from "@/lib/db";
import { Send, Sparkles, Copy, Check, RotateCcw, ArrowUpRight } from "lucide-react";

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
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const wide = variant === "full";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 1e9, behavior: "smooth" });
  }, [chat.length, streaming, pending]);

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
            <EmptyState wide={wide} onPick={send} claims={claims.length} />
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
          {isEmpty && (
            <div className="mb-2 flex flex-wrap gap-1.5">
              {SUGGESTIONS.slice(0, wide ? 4 : 3).map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="rounded-full border border-ink-600 bg-ink-900/50 px-2.5 py-1 text-[11px] text-paper-dim transition-colors hover:border-gold-dim/50 hover:text-paper"
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
              placeholder="Ask about a contradiction, claim, or paper…"
              className="max-h-44 flex-1 resize-none bg-transparent py-1 text-[13.5px] leading-relaxed text-paper placeholder:text-paper-faint focus:outline-none"
            />
            <button
              onClick={() => send(input)}
              disabled={pending || !input.trim()}
              className="mb-0.5 flex h-8 w-8 items-center justify-center rounded-xl bg-gold text-ink-900 transition-colors hover:bg-gold-soft disabled:bg-ink-600 disabled:text-paper-faint"
            >
              <Send size={15} />
            </button>
          </div>
          <p className="mt-1.5 text-center font-mono text-[9.5px] text-paper-faint">
            Grounded in your evidence graph · numbers are reported, verify against sources
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
              className="block w-full rounded-lg border border-ink-600 bg-ink-900/50 px-3 py-2 text-left text-[12px] text-paper-dim transition-colors hover:border-gold-dim/50 hover:text-paper"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Avatar() {
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-gold-dim/50 bg-gold/10">
      <span className="font-serif text-[12px] font-semibold text-gold-soft">C</span>
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
