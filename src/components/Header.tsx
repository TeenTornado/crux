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
  Settings,
  Trash2,
} from "lucide-react";

export function Header() {
  const router = useRouter();
  const reset = useStore((s) => s.reset);
  const phase = useStore((s) => s.phase);
  const judgeMode = useStore((s) => s.judgeMode);
  const setJudgeMode = useStore((s) => s.setJudgeMode);
  const sessionName = useStore((s) => s.sessionName);

  return (
    <header className="flex items-center justify-between border-b border-paper/10 px-5 py-3">
      <div className="flex items-center gap-3">
        <Link
          href="/"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-gold-dim/50 bg-gold/10 transition-colors hover:bg-gold/20"
          aria-label="Back to home"
        >
          <span className="font-serif text-[16px] font-semibold text-gold-soft">
            C
          </span>
        </Link>
        <div>
          <h1 className="font-serif text-[18px] font-semibold leading-none tracking-tight text-paper">
            Crux
          </h1>
          <p className="mt-1 truncate text-[11px] leading-none text-paper-faint">
            <span className="text-paper-dim">{sessionName}</span>
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <TierBadge icon={<Cpu size={12} />} label="Gemma 4" sub="claim extraction" tone="#6B8F71" />
        <TierBadge icon={<Cloud size={12} />} label="Gemini" sub="reconcile · experiment" tone="#C9A227" />
        <TierBadge icon={<Zap size={12} />} label="Flash" sub="chat" tone="#8FA6C1" />

        <button
          onClick={() => {
            setJudgeMode(false);
            router.push("/app");
          }}
          className="ml-1 flex items-center gap-1.5 rounded-lg border border-ink-500 px-2.5 py-1.5 text-[11px] text-paper-dim transition-colors hover:border-gold-dim/60 hover:text-paper"
          title="New chat"
        >
          <Plus size={12} /> New chat
        </button>

        <button
          onClick={() => setJudgeMode(!judgeMode)}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
            judgeMode
              ? "border-gold/70 bg-gold/15 text-gold-soft animate-pulse-ring"
              : "border-ink-500 text-paper-dim hover:border-gold-dim/60 hover:text-paper"
          }`}
          title="Auto-play the full demo on a loop, unattended"
        >
          <Radio size={12} className={judgeMode ? "text-gold-soft" : ""} />
          {judgeMode ? "Judge Mode · live" : "Judge Mode"}
        </button>

        {phase !== "idle" && !judgeMode && (
          <button
            onClick={reset}
            className="flex items-center gap-1.5 rounded-lg border border-ink-500 px-2.5 py-1.5 text-[11px] text-paper-dim transition-colors hover:border-paper-faint/60 hover:text-paper"
          >
            <RotateCcw size={12} /> Reset
          </button>
        )}

        <SettingsMenu onCleared={() => router.push("/app")} />
      </div>
    </header>
  );
}

function SettingsMenu({ onCleared }: { onCleared: () => void }) {
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
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-ink-500 text-paper-dim transition-colors hover:border-paper-faint/60 hover:text-paper"
        title="Settings"
      >
        <Settings size={13} />
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-60 overflow-hidden rounded-xl border border-ink-500 bg-ink-800 py-1 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.7)]">
          <div className="px-3 py-2">
            <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-paper-faint">
              Shortcuts
            </div>
            <div className="space-y-1 text-[11px] text-paper-dim">
              <Shortcut keys="⌘B" label="Toggle chat sidebar" />
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

function TierBadge({
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
    <div
      className="hidden items-center gap-2 rounded-lg border px-2.5 py-1.5 md:flex"
      style={{ borderColor: `${tone}44`, background: `${tone}10` }}
    >
      <span style={{ color: tone }}>{icon}</span>
      <div className="leading-none">
        <div className="text-[11px] font-medium text-paper">{label}</div>
        <div className="mt-0.5 font-mono text-[8.5px] uppercase tracking-wide text-paper-faint">
          {sub}
        </div>
      </div>
    </div>
  );
}
