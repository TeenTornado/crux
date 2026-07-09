"use client";

import { ShieldCheck } from "lucide-react";

// Compact, static-but-real mini-visuals for the three-step explainer.

export function ExtractVisual() {
  return (
    <div className="rounded-xl border border-ink-500/70 bg-ink-900/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-[9px] uppercase tracking-widest text-paper-faint">
          claim · paper A
        </span>
        <span className="inline-flex items-center gap-1 rounded-full border border-sage-dim/50 bg-sage-dim/10 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-sage-soft">
          <ShieldCheck size={9} /> on-device · Gemma 4
        </span>
      </div>
      <p className="mb-2 font-serif text-[12px] leading-snug text-paper">
        SparseViT-B attains 84.2% top-1 on ImageNet-1k.
      </p>
      <div className="grid grid-cols-3 gap-1">
        {[
          ["task", "Image cls."],
          ["dataset", "ImageNet-1k"],
          ["metric", "Top-1 acc."],
        ].map(([k, v]) => (
          <div key={k} className="rounded border border-ink-600 bg-ink-800/60 px-1.5 py-1">
            <div className="font-mono text-[7.5px] uppercase text-paper-faint">{k}</div>
            <div className="text-[9.5px] text-paper">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between rounded border border-gold-dim/40 bg-gold/5 px-2 py-1">
        <span className="font-mono text-[13px] font-semibold text-gold-soft">84.2%</span>
        <span className="text-[8.5px] text-paper-faint">reported — verify against source</span>
      </div>
    </div>
  );
}

export function ReconcileVisual() {
  return (
    <div className="rounded-xl border border-ink-500/70 bg-ink-900/50 p-3">
      <div className="mb-2 flex items-center gap-2">
        <Chip label="A" value="84.2%" tint="#C9A227" />
        <span className="font-mono text-[9px] text-paper-faint">vs</span>
        <Chip label="C" value="82.9%" tint="#8FA6C1" />
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-rust/12 px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-rust-soft" style={{ boxShadow: "inset 0 0 0 1px rgba(193,68,14,0.45)" }}>
          <span className="h-1 w-1 rounded-full bg-rust" /> contradiction
        </span>
      </div>
      <div className="space-y-1">
        <DiffRow ok text="300 epochs · same augmentation · same split" />
        <DiffRow ok text="resolution 224 · EMA weights" />
        <DiffRow text="single seed (A) vs 5-seed mean ±0.15 (C)" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-600">
          <div className="h-full rounded-full bg-rust" style={{ width: "82%" }} />
        </div>
        <span className="font-mono text-[9px] text-paper-dim">82% conf</span>
      </div>
    </div>
  );
}

export function ExperimentVisual() {
  return (
    <div className="rounded-xl border border-rust-dim/50 bg-gradient-to-b from-rust/6 to-transparent p-3">
      <div className="mb-2 font-mono text-[9px] uppercase tracking-widest text-rust-soft">
        POPPER-style plan
      </div>
      <Line k="H₀" v="true Top-1 ≤ 82.9%; 84.2% not reproducible" />
      <Line k="H₁" v="restore under-specified knobs → recover 84%" />
      <div className="my-2 flex flex-wrap gap-1">
        {["300 ep fixed", "same aug", "10 seeds"].map((t) => (
          <span key={t} className="rounded border border-ink-500 bg-ink-800/60 px-1.5 py-0.5 font-mono text-[8px] text-paper-dim">
            {t}
          </span>
        ))}
      </div>
      <div className="rounded border border-ink-600 bg-ink-900/60 px-2 py-1">
        <div className="font-mono text-[7.5px] uppercase text-paper-faint">decision rule</div>
        <div className="text-[9.5px] leading-snug text-paper-dim">
          Reject H₁ if 95% CI upper bound &lt; 84.0% across both arms.
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between font-mono text-[9px]">
        <span className="text-sage-soft">conclusiveness: HIGH</span>
        <span className="text-paper-faint">≈ 300–400 A100-h</span>
      </div>
    </div>
  );
}

function Chip({ label, value, tint }: { label: string; value: string; tint: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 bg-ink-800/60 px-2 py-1">
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded font-mono text-[9px] font-semibold"
        style={{ color: tint, background: `${tint}22`, boxShadow: `inset 0 0 0 1px ${tint}55` }}
      >
        {label}
      </span>
      <span className="font-mono text-[11px] font-semibold text-paper">{value}</span>
    </span>
  );
}

function DiffRow({ text, ok }: { text: string; ok?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className="h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: ok ? "#6B8F71" : "#C1440E" }}
      />
      <span className="text-[9.5px] leading-snug text-paper-dim">{text}</span>
    </div>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <div className="mb-1 flex gap-2">
      <span className="w-5 shrink-0 font-mono text-[10px] font-semibold text-rust-soft">{k}</span>
      <span className="text-[9.5px] leading-snug text-paper-dim">{v}</span>
    </div>
  );
}
