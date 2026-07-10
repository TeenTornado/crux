"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { clearAll } from "@/lib/db";
import { toast } from "@/lib/toast";
import {
  RotateCcw,
  Cpu,
  Cloud,
  Zap,
  Radio,
  Plus,
  Layers,
  MoreHorizontal,
  Trash2,
  ChevronDown,
} from "lucide-react";

export function Header() {
  const router = useRouter();
  const reset = useStore((s) => s.reset);
  const phase = useStore((s) => s.phase);
  const judgeMode = useStore((s) => s.judgeMode);
  const setJudgeMode = useStore((s) => s.setJudgeMode);
  const sessionName = useStore((s) => s.sessionName);

  return (
    <header className="flex items-center justify-between border-b border-paper/10 px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gold-dim/50 bg-gold/10 transition-colors hover:bg-gold/20"
          aria-label="Back to home"
        >
          <span className="font-serif text-[16px] font-semibold text-gold-soft">
            C
          </span>
        </Link>
        <div className="min-w-0">
          <h1 className="font-serif text-[18px] font-semibold leading-none tracking-tight text-paper">
            Crux
          </h1>
          <p className="mt-1 truncate text-[11px] leading-none text-paper-faint">
            <span className="text-paper-dim">{sessionName}</span>
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <StackPill />
        <OverflowMenu
          judgeMode={judgeMode}
          canReset={phase !== "idle" && !judgeMode}
          onNewChat={() => {
            setJudgeMode(false);
            router.push("/app");
          }}
          onJudgeMode={() => setJudgeMode(!judgeMode)}
          onReset={reset}
          onCleared={() => router.push("/app")}
        />
      </div>
    </header>
  );
}

/** The three model tiers, collapsed into one pill with a click-popover. */
function StackPill() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative hidden sm:block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-ink-500 px-2.5 py-1.5 text-[11px] text-paper-dim transition-colors hover:border-gold-dim/60 hover:text-paper"
        title="Model stack"
      >
        <Layers size={12} className="text-gold-soft" />
        <span className="font-medium text-paper">Stack</span>
        <span className="hidden text-paper-faint md:inline">· Gemma 4 + Gemini</span>
        <ChevronDown
          size={11}
          className={`text-paper-faint transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-64 overflow-hidden rounded-xl border border-ink-500 bg-ink-800 py-1 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.7)]">
          <TierRow
            icon={<Cpu size={13} />}
            label="Gemma 4"
            sub="claim extraction · on-device"
            tone="#6B8F71"
          />
          <TierRow
            icon={<Cloud size={13} />}
            label="Gemini"
            sub="reconcile · experiment"
            tone="#C9A227"
          />
          <TierRow icon={<Zap size={13} />} label="Flash" sub="chat" tone="#8FA6C1" />
        </div>
      )}
    </div>
  );
}

function TierRow({
  icon,
  label,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  sub: string;
  tone: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-lg border"
        style={{ borderColor: `${tone}44`, background: `${tone}10`, color: tone }}
      >
        {icon}
      </span>
      <div className="leading-none">
        <div className="text-[12px] font-medium text-paper">{label}</div>
        <div className="mt-1 font-mono text-[9px] uppercase tracking-wide text-paper-faint">
          {sub}
        </div>
      </div>
    </div>
  );
}

/** New chat / Judge Mode / Reset / shortcuts / clear-data behind one ⋯ menu. */
function OverflowMenu({
  judgeMode,
  canReset,
  onNewChat,
  onJudgeMode,
  onReset,
  onCleared,
}: {
  judgeMode: boolean;
  canReset: boolean;
  onNewChat: () => void;
  onJudgeMode: () => void;
  onReset: () => void;
  onCleared: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [open]);

  const item =
    "flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-paper-dim transition-colors hover:bg-ink-700 hover:text-paper";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex h-11 w-11 items-center justify-center rounded-lg border transition-colors sm:h-8 sm:w-8 ${
          judgeMode
            ? "border-gold/70 bg-gold/15 text-gold-soft animate-pulse-ring"
            : "border-ink-500 text-paper-dim hover:border-paper-faint/60 hover:text-paper"
        }`}
        title="Menu"
        aria-label="Menu"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-xl border border-ink-500 bg-ink-800 py-1 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.7)] sm:top-10">
          <button
            onClick={() => {
              setOpen(false);
              onNewChat();
            }}
            className={item}
          >
            <Plus size={13} /> New chat
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onJudgeMode();
            }}
            className={`${item} ${judgeMode ? "text-gold-soft" : ""}`}
            title="Auto-play the full demo on a loop, unattended"
          >
            <Radio size={13} className={judgeMode ? "text-gold-soft" : ""} />
            {judgeMode ? "Judge Mode · live — stop" : "Judge Mode"}
          </button>
          {canReset && (
            <button
              onClick={() => {
                setOpen(false);
                onReset();
              }}
              className={item}
            >
              <RotateCcw size={13} /> Reset
            </button>
          )}
          <div className="my-1 h-px bg-paper/10" />
          <div className="px-3 py-2">
            <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-paper-faint">
              Shortcuts
            </div>
            <div className="space-y-1 text-[11px] text-paper-dim">
              <Shortcut keys="⌘B" label="Toggle chat sidebar" />
              <Shortcut keys="⌘[" label="Toggle sources panel" />
              <Shortcut keys="⌘." label="Toggle context panel" />
              <Shortcut keys="/" label="Search claims" />
              <Shortcut keys="Esc" label="Close panel / clear" />
            </div>
          </div>
          <div className="my-1 h-px bg-paper/10" />
          <button
            onClick={async () => {
              setOpen(false);
              await clearAll().catch(() => {});
              toast("All local data cleared", "success");
              onCleared();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-paper-dim transition-colors hover:bg-ink-700 hover:text-rust-soft"
          >
            <Trash2 size={13} /> Clear all data
          </button>
        </div>
      )}
    </div>
  );
}

function Shortcut({ keys, label }: { keys: string; label: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <kbd className="rounded border border-ink-500 bg-ink-900 px-1.5 py-0.5 font-mono text-[9.5px] text-paper-faint">
        {keys}
      </kbd>
    </div>
  );
}
