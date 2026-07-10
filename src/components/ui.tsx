"use client";

import { useEffect, useRef, useState } from "react";
import type { Verdict, Confidence } from "@/lib/types";
import { VERDICT_META, CONFIDENCE_META, paperTint } from "@/lib/theme";
import { ShieldCheck, AlertTriangle, Cpu, Loader2 } from "lucide-react";

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

/**
 * On-device warmth badge. Preloads the local Gemma model on mount (POST
 * /api/warmup) so the first extraction is instant, then polls its state so the
 * demo driver can see "warm ✓" vs "cold ⚠" before hitting Load demo.
 */
export function WarmthIndicator() {
  const [state, setState] = useState<"warming" | "warm" | "cold" | "off">("warming");
  const [loadMs, setLoadMs] = useState(0);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const r = await fetch("/api/warmup", { cache: "no-store" });
        const d = await r.json();
        if (!alive) return;
        setState(!d.reachable ? "off" : d.warm ? "warm" : "cold");
      } catch {
        if (alive) setState("off");
      }
    };
    // Kick off a real preload once, then poll status.
    (async () => {
      try {
        const r = await fetch("/api/warmup", { method: "POST", cache: "no-store" });
        const d = await r.json();
        if (!alive) return;
        setLoadMs(d.loadMs || 0);
        setState(!d.reachable ? "off" : d.ready || d.warm ? "warm" : "cold");
      } catch {
        if (alive) setState("off");
      }
    })();
    const id = setInterval(check, 45_000); // model evicts on idle; keep an eye on it
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (state === "off") return null; // no Ollama → nothing to show (hosted path)

  const meta = {
    warming: { cls: "border-gold-dim/50 bg-gold/10 text-gold-soft", label: "Model warming…", icon: <Loader2 size={11} className="animate-spin" /> },
    warm: { cls: "border-sage-dim/50 bg-sage-dim/10 text-sage-soft", label: `Model warm ✓${loadMs ? ` · ${(loadMs / 1000).toFixed(1)}s` : ""}`, icon: <Cpu size={11} /> },
    cold: { cls: "border-rust/50 bg-rust/10 text-rust-soft", label: "Model cold ⚠", icon: <AlertTriangle size={11} /> },
  }[state];

  return (
    <span
      title="Local Gemma 4 (Ollama) memory state. Cold = next extraction pays a reload; warming keeps it resident."
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide ${meta.cls}`}
    >
      {meta.icon}
      {meta.label}
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
