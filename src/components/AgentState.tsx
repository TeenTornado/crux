"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { useStore } from "@/lib/store";
import type { CandidateEdge } from "@/lib/types";

// ── Agent State panel ─────────────────────────────────────────────────────────
// The visible sense-decide-act-check surface. Every line is DERIVED from real
// store state — nothing here is scripted or faked:
//   GOAL        session.question (the composer's hypothesis field)
//   STATE       phase + the live streamed status (chunk progress, degradation)
//   PROGRESS    reconcileProgress done/total
//   CONFIDENCE  mean of reconciled-edge confidence, with a real trend arrow
//   NEXT        the decide-step: first pending edge → unexperimented genuine
//               contradiction → human-review handoff → complete
//   HANDOFF     count of needs_human_review edges

const edgeLabel = (e: CandidateEdge) =>
  `${e.dataset || e.task || "pair"} · ${e.metric}`.slice(0, 46);

export function AgentState() {
  const [open, setOpen] = useState(false); // minimized by default
  const question = useStore((s) => s.question);
  const phase = useStore((s) => s.phase);
  const status = useStore((s) => s.statusMessage);
  const progress = useStore((s) => s.reconcileProgress);
  const edges = useStore((s) => s.edges);
  const claims = useStore((s) => s.claims);
  const papers = useStore((s) => s.papers);
  const source = useStore((s) => s.source);
  const experiments = useStore((s) => s.experiments);

  const reconciled = edges.filter((e) => e.reconciliation);
  const contradictions = reconciled.filter(
    (e) => e.reconciliation!.verdict === "GENUINE_CONTRADICTION"
  );
  const divergences = reconciled.filter(
    (e) => e.reconciliation!.verdict === "CONTEXT_CONDITIONED_DIVERGENCE"
  );
  const review = reconciled.filter((e) => e.reconciliation!.needs_human_review);

  // Confidence: mean over reconciled edges; trend = last edge vs prior mean
  // (edges reconcile sequentially, so array order is completion order).
  const confs = reconciled.map((e) => e.reconciliation!.confidence);
  const mean = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
  const prior = confs.slice(0, -1);
  const priorMean = prior.length ? prior.reduce((a, b) => a + b, 0) / prior.length : 0;
  const trend =
    confs.length >= 2 ? (confs[confs.length - 1] < priorMean - 0.02 ? "↓" : confs[confs.length - 1] > priorMean + 0.02 ? "↑" : "→") : "";

  // The decide step — what the agent does next, in priority order.
  const pending = edges.find((e) => e.status !== "done");
  const unexperimented = contradictions.find((e) => !experiments[e.edge_id]);
  const busy = phase === "extracting" || phase === "reconciling";

  let next = "Drop papers or load the demo corpus";
  let nextTone = "text-paper-dim";
  if (phase === "extracting") {
    next = "Ground claims from sources";
    nextTone = "text-gold-soft";
  } else if (pending) {
    next = `Reconcile · ${edgeLabel(pending)}`;
    nextTone = "text-gold-soft";
  } else if (unexperimented) {
    next = `Design experiment · ${edgeLabel(unexperimented)}`;
    nextTone = "text-gold-soft";
  } else if (review.length > 0) {
    next = `Hand off · ${edgeLabel(review[0])} — your judgment`;
    nextTone = "text-rust-soft";
  } else if (reconciled.length > 0) {
    next = `Investigation complete — ${contradictions.length} contradiction${
      contradictions.length === 1 ? "" : "s"
    } · ${divergences.length} divergence${divergences.length === 1 ? "" : "s"}`;
    nextTone = "text-sage-soft";
  } else if (claims.length > 0) {
    next = "Reconcile candidate pairs";
    nextTone = "text-gold-soft";
  }

  const state =
    phase === "extracting" || phase === "reconciling"
      ? status || (phase === "extracting" ? "Extracting…" : "Reconciling…")
      : phase === "reconciled"
      ? review.length > 0
        ? `Awaiting your review · ${review.length} pair${review.length === 1 ? "" : "s"}`
        : "Loop complete"
      : phase === "extracted"
      ? `${claims.length} grounded claims · ready to reconcile`
      : papers.length === 0
      ? "Idle · no sources"
      : "Idle";

  const goal =
    question ||
    (papers.length > 0
      ? `Reconcile the ${papers.length}-paper corpus`
      : "State a hypothesis to investigate");

  return (
    <div className="mx-2 mt-2 rounded-lg border border-ink-600/70 bg-ink-800/60 px-3 py-2">
      {/* Minimized by default — the header row stays glanceable, click expands */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[44px] w-full items-center gap-1.5 py-0.5 text-left lg:min-h-0"
        aria-expanded={open}
        aria-label="Toggle agent state"
      >
        <span
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${
            busy ? "animate-pulse bg-gold" : reconciled.length ? "bg-sage" : "bg-ink-500"
          }`}
        />
        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-paper-faint">
          Agent state
        </span>
        {!open && (
          <span className="ml-1 truncate font-mono text-[9.5px] text-paper-dim">
            {progress.total > 0 && `${progress.done}/${progress.total}`}
            {review.length > 0 && (
              <span className="text-rust-soft"> · {review.length} handoff</span>
            )}
          </span>
        )}
        {source === "gemma-on-device" && (
          <span className="ml-auto font-mono text-[8.5px] uppercase tracking-wide text-sage-soft">
            on-device
          </span>
        )}
        <ChevronDown
          size={12}
          className={`shrink-0 text-paper-faint transition-transform ${
            open ? "rotate-180" : ""
          } ${source === "gemma-on-device" ? "ml-1" : "ml-auto"}`}
        />
      </button>

      {open && (
        <div className="mt-1.5">
      <Row label="Goal">
        <span className="text-paper">{goal.slice(0, 90)}</span>
      </Row>
      <Row label="State">
        <span className="text-paper-dim">{state.slice(0, 80)}</span>
      </Row>

      {progress.total > 0 && (
        <Row label="Progress">
          <span className="flex items-center gap-2">
            <span className="h-1 w-24 overflow-hidden rounded-full bg-ink-600">
              <span
                className="block h-full rounded-full bg-gold transition-all duration-500"
                style={{ width: `${(progress.done / progress.total) * 100}%` }}
              />
            </span>
            <span className="text-paper-dim">
              {progress.done}/{progress.total} pairs
            </span>
          </span>
        </Row>
      )}

      {confs.length > 0 && (
        <Row label="Confidence">
          <span className="text-paper-dim">
            {mean.toFixed(2)} mean{" "}
            {trend && (
              <span className={trend === "↓" ? "text-rust-soft" : "text-paper-faint"}>
                {trend} {trend !== "→" ? `from ${priorMean.toFixed(2)}` : ""}
              </span>
            )}
            {review.length > 0 && (
              <span className="text-rust-soft"> · {review.length} low</span>
            )}
          </span>
        </Row>
      )}

      <Row label="Next">
        <span className={nextTone}>{next}</span>
      </Row>

      {review.length > 0 && phase === "reconciled" && (
        <Row label="Handoff">
          <span className="text-rust-soft">
            {review.length} pair{review.length === 1 ? "" : "s"} need
            {review.length === 1 ? "s" : ""} your judgment
          </span>
        </Row>
      )}
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 py-[3px]">
      <span className="w-[72px] shrink-0 font-mono text-[9px] uppercase tracking-[0.14em] text-paper-faint">
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] leading-snug">
        {children}
      </span>
    </div>
  );
}
