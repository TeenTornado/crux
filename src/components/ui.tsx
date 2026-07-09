"use client";

import type { Verdict, Confidence } from "@/lib/types";
import { VERDICT_META, CONFIDENCE_META, paperTint } from "@/lib/theme";
import { ShieldCheck, AlertTriangle } from "lucide-react";

export function VerdictBadge({
  verdict,
  size = "sm",
}: {
  verdict: Verdict;
  size?: "sm" | "md";
}) {
  const m = VERDICT_META[verdict];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${
        size === "md" ? "px-3 py-1 text-[13px]" : "px-2 py-0.5 text-[11px]"
      }`}
      style={{ background: m.bg, color: m.soft, boxShadow: `inset 0 0 0 1px ${m.ring}` }}
    >
      <span
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: m.color }}
      />
      {m.label}
    </span>
  );
}

export function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.75 ? "#6B8F71" : value >= 0.55 ? "#C9A227" : "#C1440E";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-600">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="font-mono text-[11px] text-paper-dim">{pct}%</span>
    </div>
  );
}

export function ConfidencePill({ level }: { level: Confidence }) {
  const m = CONFIDENCE_META[level];
  return (
    <span
      className="rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide"
      style={{ color: m.color, background: `${m.color}1a` }}
    >
      {m.label}
    </span>
  );
}

export function OnDeviceBadge({
  source,
}: {
  source: "demo" | "gemma-on-device" | "gemma-hosted" | null | undefined;
}) {
  if (!source) return null;
  const label =
    source === "gemma-on-device"
      ? "Extracted on-device · Gemma 4"
      : source === "gemma-hosted"
      ? "Extracted · Gemma 4"
      : "Demo · Gemma 4 trace";
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-sage-dim/50 bg-sage-dim/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-sage-soft">
      <ShieldCheck size={11} />
      {label}
    </span>
  );
}

export function HandleChip({ handle }: { handle: string }) {
  const c = paperTint(handle);
  return (
    <span
      className="inline-flex h-5 w-5 items-center justify-center rounded font-mono text-[11px] font-semibold"
      style={{ color: c, background: `${c}1f`, boxShadow: `inset 0 0 0 1px ${c}55` }}
    >
      {handle}
    </span>
  );
}

export function HumanReviewFlag() {
  return (
    <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-gold-soft"
      style={{ background: "rgba(201,162,39,0.12)" }}>
      <AlertTriangle size={11} /> verify
    </span>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.18em] text-paper-faint">
      {children}
    </div>
  );
}
