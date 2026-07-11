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
  Check,
} from "lucide-react";
import type { ComputeMode } from "@/lib/prefs";

const MODE_META: Record<
  ComputeMode,
  { label: string; cls: string; dot: string; desc: string }
> = {
  local: {
    label: "Local",
    cls: "text-sage-soft",
    dot: "bg-sage",
    desc: "On-device only — Gemma via Ollama. No cloud model calls, chat disabled.",
  },
  auto: {
    label: "Auto",
    cls: "text-gold-soft",
    dot: "bg-gold",
    desc: "Local-first: Gemma on-device, cloud fills in when a step starves.",
  },
  cloud: {
    label: "Cloud",
    cls: "text-paper-dim",
    dot: "bg-paper-faint",
    desc: "Hosted Gemma + Gemini first — fastest verdicts, needs the API key.",
  },
};

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
          <img
            src="/Crux_Logo.png"
            alt=""
            className="h-full w-full scale-[1.6] object-contain"
          />
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

/** Model stack + the HARD compute-mode selector (Local / Auto / Cloud). */
function StackPill() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const mode = useStore((s) => s.computeMode);
  const setMode = useStore((s) => s.setComputeMode);
  const m = MODE_META[mode];

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
        title="Model stack & compute mode"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
        <span className={`font-semibold ${m.cls}`}>{m.label}</span>
        <span className="hidden text-paper-faint md:inline">· Gemma 4 + Gemini</span>
        <ChevronDown
          size={11}
          className={`text-paper-faint transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-72 overflow-hidden rounded-xl border border-ink-500 bg-ink-800 py-1 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.7)]">
          <div className="px-3 pb-1 pt-2 font-mono text-[9px] uppercase tracking-[0.18em] text-paper-faint">
            Compute mode
          </div>
          {(Object.keys(MODE_META) as ComputeMode[]).map((k) => {
            const mm = MODE_META[k];
            const active = mode === k;
            return (
              <button
                key={k}
                onClick={() => setMode(k)}
                className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors hover:bg-ink-700 ${
                  active ? "bg-ink-700/60" : ""
                }`}
              >
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${mm.dot}`} />
                <span className="min-w-0 flex-1">
                  <span className={`text-[12px] font-semibold ${mm.cls}`}>{mm.label}</span>
                  <span className="block text-[10.5px] leading-snug text-paper-faint">
                    {mm.desc}
                  </span>
                </span>
                {active && <Check size={13} className="mt-0.5 shrink-0 text-paper-dim" />}
              </button>
            );
          })}
          <div className="my-1 h-px bg-paper/10" />
          <div className="px-3 pb-1 pt-1 font-mono text-[9px] uppercase tracking-[0.18em] text-paper-faint">
            The stack
          </div>
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
          <TierRow icon={<Zap size={13} />} label="Flash" sub="chat (cloud only)" tone="#8FA6C1" />
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
  const mode = useStore((s) => s.computeMode);
  const setMode = useStore((s) => s.setComputeMode);
  const nextMode: ComputeMode =
    mode === "auto" ? "local" : mode === "local" ? "cloud" : "auto";

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
            onClick={() => setMode(nextMode)}
            className={item}
            title="Cycle compute mode"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${MODE_META[mode].dot}`} />
            Mode: <span className={MODE_META[mode].cls}>{MODE_META[mode].label}</span>
            <span className="ml-auto font-mono text-[9px] text-paper-faint">tap to cycle</span>
          </button>
          <div className="my-1 h-px bg-paper/10" />
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
