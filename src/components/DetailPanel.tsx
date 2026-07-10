"use client";

import { useState } from "react";
import { useStore, claimById, edgeById } from "@/lib/store";
import { runExperiment } from "@/lib/actions";
import {
  VerdictBadge,
  ConfidenceBar,
  ConfidencePill,
  OnDeviceBadge,
  HandleChip,
  HumanReviewFlag,
  SectionLabel,
} from "./ui";
import { VERDICT_META } from "@/lib/theme";
import type { Claim, CandidateEdge, ExperimentPlan } from "@/lib/types";
import {
  ChevronDown,
  Quote,
  FlaskConical,
  Loader2,
  BookOpen,
  Beaker,
  ShieldAlert,
} from "lucide-react";

export function DetailPanel() {
  const selectedClaimId = useStore((s) => s.selectedClaimId);
  const selectedEdgeId = useStore((s) => s.selectedEdgeId);
  const claim = useStore(claimById(selectedClaimId));
  const edge = useStore(edgeById(selectedEdgeId));

  if (edge) return <EdgeDetail edge={edge} />;
  if (claim) return <ClaimDetail claim={claim} />;
  return <Overview />;
}

// ── Overview (nothing selected) ──────────────────────────────────────────────
function Overview() {
  const edges = useStore((s) => s.edges);
  const claims = useStore((s) => s.claims);
  const selectEdge = useStore((s) => s.selectEdge);
  const counts = edges.reduce(
    (acc, e) => {
      const v = e.reconciliation?.verdict;
      if (v === "GENUINE_CONTRADICTION") acc.contradiction++;
      else if (v === "CONTEXT_CONDITIONED_DIVERGENCE") acc.divergence++;
      else if (v === "AGREEMENT") acc.agreement++;
      return acc;
    },
    { contradiction: 0, divergence: 0, agreement: 0 }
  );

  // Jump the graph to the highest-confidence edge of a given verdict.
  const jumpTo = (verdict: keyof typeof VERDICT_META) => {
    const best = edges
      .filter((e) => e.reconciliation?.verdict === verdict)
      .sort(
        (a, b) =>
          (b.reconciliation?.confidence ?? 0) - (a.reconciliation?.confidence ?? 0)
      )[0];
    if (best) selectEdge(best.edge_id);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-5">
      <div className="mb-1 font-serif text-lg text-paper">Evidence overview</div>
      <p className="mb-5 text-[12px] leading-relaxed text-paper-faint">
        Select a node to inspect a claim and its source provenance, or a{" "}
        <span className="text-paper-dim">colored edge</span> to see why two papers
        agree, diverge, or contradict — and generate the experiment that resolves it.
      </p>

      <div className="grid grid-cols-3 gap-2">
        <StatCard label="Contradictions" value={counts.contradiction} tone="GENUINE_CONTRADICTION" onClick={() => jumpTo("GENUINE_CONTRADICTION")} />
        <StatCard label="Divergences" value={counts.divergence} tone="CONTEXT_CONDITIONED_DIVERGENCE" onClick={() => jumpTo("CONTEXT_CONDITIONED_DIVERGENCE")} />
        <StatCard label="Agreements" value={counts.agreement} tone="AGREEMENT" onClick={() => jumpTo("AGREEMENT")} />
      </div>
      {(counts.contradiction || counts.divergence || counts.agreement) > 0 && (
        <div className="mt-1.5 text-center font-mono text-[9.5px] text-paper-faint">
          tap a tile to jump to its strongest edge
        </div>
      )}

      <div className="mt-6">
        <SectionLabel>How to read the graph</SectionLabel>
        <ul className="space-y-2 text-[12px] text-paper-dim">
          <LegendRow tone="GENUINE_CONTRADICTION" text="Same conditions, different results — a real conflict worth an experiment." />
          <LegendRow tone="CONTEXT_CONDITIONED_DIVERGENCE" text="Different conditions explain the gap — both results are valid (the BioDivergence case)." />
          <LegendRow tone="AGREEMENT" text="Results match within run-to-run noise." />
        </ul>
      </div>

      <div className="mt-6 shrink-0 rounded-lg border border-ink-600 bg-ink-800/60 p-3 text-[11px] leading-relaxed text-paper-faint">
        <div className="mb-1 flex items-center gap-1.5 text-paper-dim">
          <ShieldAlert size={13} /> Honest by design
        </div>
        Numeric values are shown as <span className="text-paper-dim">reported</span>,
        not verified — LLMs extract result numbers at only 44–69 F1 (SciLead/AxCell),
        so each is a low-confidence field with a source span to check. Reconciliation
        surfaces uncertainty rather than over-asserting (cf. ContraCrow’s 60% human
        agreement). {claims.length} claims loaded.
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  tone: keyof typeof VERDICT_META;
  onClick: () => void;
}) {
  const m = VERDICT_META[tone];
  const disabled = value === 0;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={disabled ? undefined : `Jump to strongest ${m.short.toLowerCase()}`}
      className={`rounded-lg border p-3 text-left transition-all ${
        disabled ? "cursor-default opacity-60" : "hover:brightness-125 hover:-translate-y-px"
      }`}
      style={{ borderColor: m.ring, background: m.bg }}
    >
      <div className="font-serif text-2xl" style={{ color: m.soft }}>
        {value}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-paper-faint">
        {label}
      </div>
    </button>
  );
}

function LegendRow({ tone, text }: { tone: keyof typeof VERDICT_META; text: string }) {
  const m = VERDICT_META[tone];
  return (
    <li className="flex gap-2">
      <span
        className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
        style={{ background: m.color }}
      />
      <span>{text}</span>
    </li>
  );
}

// ── Claim detail ─────────────────────────────────────────────────────────────
function ClaimDetail({ claim }: { claim: Claim }) {
  const paper = useStore((s) =>
    s.papers.find((p) => p.paper_id === claim.paper_id)
  );
  const openSource = useStore((s) => s.openSource);
  const condRows = Object.entries(claim.conditions).filter(([, v]) => v) as [
    string,
    string
  ][];

  return (
    <div className="flex h-full flex-col overflow-y-auto p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={14} className="text-paper-faint" />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-paper-faint">
            Claim
          </span>
        </div>
        <OnDeviceBadge source={claim.extractor === "demo" ? "demo" : "gemma-hosted"} />
      </div>

      {paper && (
        <div className="mb-3 flex items-center gap-2">
          <HandleChip handle={paper.handle} />
          <span className="truncate font-serif text-[13px] text-paper-dim">
            {paper.title}
          </span>
        </div>
      )}

      <p className="mb-4 font-serif text-[15px] leading-snug text-paper">
        {claim.claim_text}
      </p>

      <div className="mb-4 grid grid-cols-3 gap-2">
        <Field label="Task" value={claim.task} />
        <Field label="Dataset" value={claim.dataset} />
        <Field label="Metric" value={claim.metric} />
      </div>

      {/* Result value — honest, low-confidence */}
      <div className="mb-4 rounded-lg border border-gold-dim/40 bg-gold/5 p-3">
        <div className="flex items-center justify-between">
          <SectionLabel>Reported result</SectionLabel>
          <ConfidencePill level={claim.result_confidence} />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl font-semibold text-gold-soft">
            {claim.result_value || "—"}
          </span>
          <span className="text-[11px] text-paper-faint">
            reported — verify against source
          </span>
        </div>
      </div>

      {/* Conditions */}
      <SectionLabel>Conditions</SectionLabel>
      <div className="mb-4 overflow-hidden rounded-lg border border-ink-600">
        {condRows.length === 0 && (
          <div className="px-3 py-2 text-[12px] text-paper-faint">
            No conditions extracted.
          </div>
        )}
        {condRows.map(([k, v], i) => (
          <div
            key={k}
            className={`flex gap-3 px-3 py-2 ${
              i % 2 ? "bg-ink-800/40" : ""
            }`}
          >
            <span className="w-28 shrink-0 font-mono text-[10px] uppercase tracking-wide text-paper-faint">
              {k.replace(/_/g, " ")}
            </span>
            <span className="text-[12px] leading-snug text-paper-dim">{v}</span>
          </div>
        ))}
      </div>

      {/* Source span */}
      <SectionLabel>Source span</SectionLabel>
      <button
        onClick={() => openSource(claim.claim_id)}
        className="group w-full rounded-lg border border-ink-600 bg-ink-900/60 p-3 text-left transition-colors hover:border-gold-dim/60"
      >
        <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-wide text-paper-faint">
          <span className="flex items-center gap-1.5">
            <Quote size={11} /> page {claim.source_span.page}
          </span>
          <span className="flex items-center gap-1 text-gold-soft opacity-0 transition-opacity group-hover:opacity-100">
            <BookOpen size={11} /> open in source
          </span>
        </div>
        <p className="font-mono text-[12px] leading-relaxed text-paper-dim">
          “{claim.source_span.text || "—"}”
        </p>
        <span className="mt-2 inline-block font-mono text-[10px] text-paper-faint group-hover:text-gold-soft">
          Click to highlight the passage in the source →
        </span>
      </button>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-800/50 px-2.5 py-2">
      <div className="mb-0.5 font-mono text-[9px] uppercase tracking-wide text-paper-faint">
        {label}
      </div>
      <div className="text-[12px] leading-tight text-paper">{value || "—"}</div>
    </div>
  );
}

// ── Edge (reconciliation) detail ─────────────────────────────────────────────
function EdgeDetail({ edge }: { edge: CandidateEdge }) {
  const claims = useStore((s) => s.claims);
  const papers = useStore((s) => s.papers);
  const experiment = useStore((s) => s.experiments[edge.edge_id]);
  const [showReasoning, setShowReasoning] = useState(true);
  const [genLoading, setGenLoading] = useState(false);

  const a = claims.find((c) => c.claim_id === edge.source_claim_id);
  const b = claims.find((c) => c.claim_id === edge.target_claim_id);
  const pa = papers.find((p) => p.paper_id === a?.paper_id);
  const pb = papers.find((p) => p.paper_id === b?.paper_id);
  const r = edge.reconciliation;

  if (!a || !b) return <Overview />;

  const isContradiction = r?.verdict === "GENUINE_CONTRADICTION";

  const onGenerate = async () => {
    setGenLoading(true);
    try {
      await runExperiment(edge.edge_id);
    } finally {
      setGenLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-paper-faint">
          Reconciliation
        </span>
        {r?.needs_human_review && <HumanReviewFlag />}
      </div>

      {/* The two claims */}
      <div className="mb-4 space-y-2">
        <ClaimMini handle={pa?.handle || "?"} claim={a} />
        <div className="pl-2 font-mono text-[10px] uppercase tracking-widest text-paper-faint">
          vs
        </div>
        <ClaimMini handle={pb?.handle || "?"} claim={b} />
      </div>

      {r ? (
        <>
          <div className="mb-3 flex items-center justify-between rounded-lg border border-ink-600 bg-ink-800/50 p-3">
            <VerdictBadge verdict={r.verdict} size="md" />
            <div className="text-right">
              <div className="mb-1 font-mono text-[9px] uppercase tracking-wide text-paper-faint">
                Confidence
              </div>
              <ConfidenceBar value={r.confidence} />
            </div>
          </div>

          {/* Producing engine — honest label for the on-device story */}
          {r.engine && <EngineBadge engine={r.engine} kind="reconciled" />}

          <div className="mb-4 grid grid-cols-2 gap-2">
            <CondList
              title="Shared conditions"
              items={r.shared_conditions}
              tone="#6B8F71"
            />
            <CondList
              title="Differing conditions"
              items={r.differing_conditions}
              tone="#C1440E"
            />
          </div>

          {/* Collapsible reasoning trace */}
          <button
            onClick={() => setShowReasoning((v) => !v)}
            className="mb-2 flex w-full items-center justify-between rounded-lg border border-ink-600 bg-ink-800/50 px-3 py-2 text-left transition-colors hover:border-ink-500"
          >
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wide text-paper-dim">
              <Beaker size={12} /> Reasoning trace
            </span>
            <ChevronDown
              size={15}
              className={`text-paper-faint transition-transform ${
                showReasoning ? "rotate-180" : ""
              }`}
            />
          </button>
          {showReasoning && (
            <div className="mb-4 whitespace-pre-line rounded-lg border border-ink-700 bg-ink-900/60 p-3 font-mono text-[11.5px] leading-relaxed text-paper-dim">
              {r.reasoning}
            </div>
          )}

          {/* Experiment generation */}
          {isContradiction && !experiment && (
            <button
              onClick={onGenerate}
              disabled={genLoading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-rust px-3 py-2.5 text-[13px] font-semibold text-paper transition-colors hover:bg-rust-soft disabled:opacity-60"
            >
              {genLoading ? (
                <>
                  <Loader2 size={15} className="animate-spin" /> Designing experiment…
                </>
              ) : (
                <>
                  <FlaskConical size={15} /> Generate experiment to resolve
                </>
              )}
            </button>
          )}
          {!isContradiction && (
            <div className="rounded-lg border border-ink-600 bg-ink-800/40 p-3 text-[11.5px] leading-relaxed text-paper-faint">
              {r.verdict === "AGREEMENT"
                ? "No experiment needed — the results agree within noise."
                : "No experiment needed — the divergence is fully explained by differing conditions. Both results hold within their stated regimes."}
            </div>
          )}

          {experiment && <ExperimentCard plan={experiment} />}
        </>
      ) : (
        <div className="rounded-lg border border-ink-600 bg-ink-800/40 p-3 text-[12px] text-paper-faint">
          {edge.status === "reconciling"
            ? "Reconciling…"
            : "Not yet reconciled. Run reconciliation to diagnose this pair."}
        </div>
      )}
    </div>
  );
}

function ClaimMini({ handle, claim }: { handle: string; claim: Claim }) {
  const selectClaim = useStore((s) => s.selectClaim);
  return (
    <button
      onClick={() => selectClaim(claim.claim_id)}
      className="flex w-full items-center gap-2.5 rounded-lg border border-ink-600 bg-ink-800/50 px-3 py-2 text-left transition-colors hover:border-ink-500"
    >
      <HandleChip handle={handle} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[12px] text-paper-dim">
          {claim.dataset} · {claim.metric}
        </div>
      </div>
      <span className="shrink-0 font-mono text-[15px] font-semibold text-paper">
        {claim.result_value}
      </span>
    </button>
  );
}

function CondList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-ink-600 bg-ink-800/40 p-2.5">
      <div className="mb-1.5 font-mono text-[9px] uppercase tracking-wide text-paper-faint">
        {title}
      </div>
      <ul className="space-y-1">
        {items.length === 0 && (
          <li className="text-[11px] text-paper-faint">—</li>
        )}
        {items.map((it, i) => (
          <li key={i} className="flex gap-1.5 text-[11px] leading-snug text-paper-dim">
            <span
              className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: tone }}
            />
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExperimentCard({ plan }: { plan: ExperimentPlan }) {
  return (
    <div className="mt-4 card-enter rounded-xl border border-rust-dim/50 bg-gradient-to-b from-rust/5 to-transparent p-4">
      <div className="mb-2 flex items-center gap-1.5">
        <FlaskConical size={14} className="text-rust-soft" />
        <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-rust-soft">
          POPPER-style experiment plan
        </span>
      </div>
      <div className="mb-3 font-serif text-[15px] leading-tight text-paper">
        {plan.title}
      </div>

      <PlanBlock label="Null hypothesis (H₀)" body={plan.hypothesis_null} />
      <PlanBlock label="Alternative (H₁)" body={plan.hypothesis_alternative} />

      <div className="mb-2">
        <SectionLabel>Variables held fixed</SectionLabel>
        <div className="flex flex-wrap gap-1.5">
          {plan.variables_held_fixed.map((v, i) => (
            <span
              key={i}
              className="rounded border border-ink-500 bg-ink-800/60 px-2 py-0.5 font-mono text-[10px] text-paper-dim"
            >
              {v}
            </span>
          ))}
        </div>
      </div>

      <PlanBlock label="Manipulation" body={plan.manipulation} />
      <PlanBlock label="Discriminating metric & decision rule" body={plan.discriminating_metric} />

      <div className="mb-2 grid grid-cols-1 gap-2">
        <div className="rounded-lg border border-ink-600 bg-ink-800/40 p-2.5">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-wide text-paper-faint">
            If A is correct
          </div>
          <p className="text-[11.5px] leading-snug text-paper-dim">
            {plan.expected_outcome_if_paper_a_correct}
          </p>
        </div>
        <div className="rounded-lg border border-ink-600 bg-ink-800/40 p-2.5">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-wide text-paper-faint">
            If B is correct
          </div>
          <p className="text-[11.5px] leading-snug text-paper-dim">
            {plan.expected_outcome_if_paper_b_correct}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-ink-600 pt-2.5">
        <div>
          <span className="font-mono text-[9px] uppercase tracking-wide text-paper-faint">
            Conclusiveness{" "}
          </span>
          <span
            className="font-mono text-[11px] font-semibold"
            style={{
              color:
                plan.estimated_conclusiveness === "high"
                  ? "#6B8F71"
                  : plan.estimated_conclusiveness === "medium"
                  ? "#C9A227"
                  : "#C1440E",
            }}
          >
            {plan.estimated_conclusiveness.toUpperCase()}
          </span>
        </div>
        <div className="text-right font-mono text-[10px] text-paper-faint">
          {plan.estimated_compute_cost}
        </div>
      </div>
    </div>
  );
}

function PlanBlock({ label, body }: { label: string; body: string }) {
  if (!body) return null;
  return (
    <div className="mb-2.5">
      <SectionLabel>{label}</SectionLabel>
      <p className="text-[12px] leading-snug text-paper-dim">{body}</p>
    </div>
  );
}

/** Honest producing-engine label: on-device Gemma vs Gemini vs deterministic. */
function EngineBadge({ engine, kind }: { engine: string; kind: "reconciled" | "generated" }) {
  const local = engine.startsWith("gemma");
  const label = local
    ? `${kind} on-device · ${engine.replace(/^gemma(-fallback)?:/, "")}`
    : engine === "guard"
    ? "deterministic guard · no model call"
    : engine.startsWith("heuristic")
    ? "offline heuristic"
    : engine === "template"
    ? "deterministic template"
    : `${kind} · Gemini`;
  return (
    <div className="mb-3">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[9.5px] uppercase tracking-wide ${
          local
            ? "border-sage-dim/50 bg-sage-dim/10 text-sage-soft"
            : "border-ink-500 bg-ink-800/60 text-paper-faint"
        }`}
      >
        <ShieldAlert size={10} className={local ? "" : "opacity-60"} />
        {label}
      </span>
    </div>
  );
}
