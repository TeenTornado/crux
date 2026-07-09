"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useStore } from "@/lib/store";
import { runExtraction, runReconciliation, runLiveDemo } from "@/lib/actions";
import { useTypewriter } from "@/lib/useTypewriter";
import { HandleChip, ConfidencePill, OnDeviceBadge } from "./ui";
import { paperTint } from "@/lib/theme";
import {
  UploadCloud,
  Sparkles,
  FileText,
  Loader2,
  GitCompareArrows,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { Claim } from "@/lib/types";

export function SourcesPanel() {
  const phase = useStore((s) => s.phase);
  const papers = useStore((s) => s.papers);
  const claims = useStore((s) => s.claims);
  const source = useStore((s) => s.source);
  const status = useStore((s) => s.statusMessage);
  const edges = useStore((s) => s.edges);
  const selectedClaimId = useStore((s) => s.selectedClaimId);
  const selectClaim = useStore((s) => s.selectClaim);
  const reconcileProgress = useStore((s) => s.reconcileProgress);
  const searchQuery = useStore((s) => s.searchQuery);
  const setSearchQuery = useStore((s) => s.setSearchQuery);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const busy = phase === "extracting" || phase === "reconciling";
  const reconciledCount = edges.filter((e) => e.reconciliation).length;

  const q = searchQuery.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    const set = new Set<string>();
    for (const c of claims) {
      const hay = `${c.task} ${c.dataset} ${c.metric} ${c.result_value} ${c.claim_text}`.toLowerCase();
      if (hay.includes(q)) set.add(c.claim_id);
    }
    return set;
  }, [q, claims]);

  const handleFiles = useCallback(async (files: File[]) => {
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfs.length === 0) return;
    await runExtraction({ files: pdfs });
    await runReconciliation();
  }, []);

  const loadDemo = useCallback(async () => {
    await runExtraction({ demo: true });
    await runReconciliation();
  }, []);

  const byPaper = (pid: string) => claims.filter((c) => c.paper_id === pid);

  return (
    <div className="flex h-full flex-col">
      {/* Upload / demo actions */}
      <div className="border-b border-paper/10 p-4">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(Array.from(e.dataTransfer.files));
          }}
          onClick={() => !busy && inputRef.current?.click()}
          className={`group cursor-pointer rounded-xl border border-dashed p-5 text-center transition-colors ${
            dragOver
              ? "border-gold/70 bg-gold/5"
              : "border-ink-500 hover:border-paper-faint/60"
          } ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            hidden
            onChange={(e) => handleFiles(Array.from(e.target.files || []))}
          />
          <UploadCloud
            size={22}
            className="mx-auto mb-2 text-paper-faint group-hover:text-gold-soft"
          />
          <div className="font-serif text-[15px] text-paper">Drop 2–3 PDFs</div>
          <div className="mt-0.5 text-[11px] text-paper-faint">
            Structured claims via Gemma 4
          </div>
        </div>

        <button
          onClick={loadDemo}
          disabled={busy}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gold/90 px-3 py-2.5 text-[13px] font-semibold text-ink-900 transition-colors hover:bg-gold disabled:opacity-50"
        >
          <Sparkles size={15} />
          Load demo corpus
        </button>

        <button
          onClick={() => runLiveDemo()}
          disabled={busy}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-sage-dim/50 bg-sage-dim/10 px-3 py-2 text-[12px] font-medium text-sage-soft transition-colors hover:border-sage/60 hover:bg-sage-dim/20 disabled:opacity-50"
          title="Re-run the same demo papers through real Gemma 4 + Gemini — no pre-baked results"
        >
          <ShieldCheck size={14} />
          Verify live · real Gemma 4 + Gemini
        </button>

        {(busy || status) && (
          <div className="mt-3 flex items-center gap-2 text-[12px] text-paper-dim">
            {busy && <Loader2 size={13} className="animate-spin text-gold-soft" />}
            <span className="truncate font-mono text-[11px]">{status}</span>
          </div>
        )}

        {phase === "reconciling" && (
          <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-ink-600">
            <div
              className="h-full rounded-full bg-gold transition-all duration-500"
              style={{
                width: `${
                  reconcileProgress.total
                    ? (reconcileProgress.done / reconcileProgress.total) * 100
                    : 0
                }%`,
              }}
            />
          </div>
        )}
      </div>

      {/* Corpus header + search */}
      <div className="space-y-2 px-4 py-2.5">
        <div className="flex items-center justify-between">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-paper-faint">
            Sources · {papers.length} papers · {claims.length} claims
          </div>
          <OnDeviceBadge source={source} />
        </div>
        {claims.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-900/50 px-2.5 py-1.5 focus-within:border-gold-dim/60">
            <Search size={13} className="text-paper-faint" />
            <input
              id="claim-search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search claims"
              className="flex-1 bg-transparent text-[12px] text-paper placeholder:text-paper-faint focus:outline-none"
            />
            <kbd className="rounded border border-ink-500 px-1 py-0.5 font-mono text-[9px] text-paper-faint">
              /
            </kbd>
          </div>
        )}
      </div>

      {/* Streaming claim list grouped by paper */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {papers.length === 0 && (
          <div className="px-2 py-8 text-center">
            <div className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-lg border border-ink-500 bg-ink-800/60">
              <FileText size={16} className="text-paper-faint" />
            </div>
            <div className="text-[12px] text-paper-dim">No sources yet</div>
            <div className="mt-1 text-[11px] text-paper-faint">
              Load the demo or drop PDFs above to begin.
            </div>
          </div>
        )}
        {matches && matches.size === 0 && papers.length > 0 && (
          <div className="px-2 py-4 text-center text-[12px] text-paper-faint">
            No claims match “{searchQuery}”.
          </div>
        )}
        {papers.map((p) => {
          const pClaims = byPaper(p.paper_id).filter(
            (c) => !matches || matches.has(c.claim_id)
          );
          if (matches && pClaims.length === 0) return null;
          return (
            <div key={p.paper_id} className="mb-4">
              <div className="mb-1.5 flex items-start gap-2 px-1">
                <HandleChip handle={p.handle} />
                <div className="min-w-0">
                  <div className="truncate font-serif text-[13px] leading-tight text-paper">
                    {p.title}
                  </div>
                  <div className="truncate font-mono text-[10px] text-paper-faint">
                    {p.authors} · {p.year}
                    {p.venue ? ` · ${p.venue}` : ""}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                {pClaims.map((c) => (
                  <ClaimRow
                    key={c.claim_id}
                    claim={c}
                    selected={c.claim_id === selectedClaimId}
                    animate={phase === "extracting"}
                    onClick={() => selectClaim(c.claim_id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reconcile hint / re-run */}
      {phase === "reconciled" && (
        <div className="border-t border-paper/10 p-3">
          <button
            onClick={runReconciliation}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-ink-500 px-3 py-2 text-[12px] text-paper-dim transition-colors hover:border-paper-faint/60 hover:text-paper"
          >
            <GitCompareArrows size={14} />
            Re-run reconciliation ({reconciledCount} edges)
          </button>
        </div>
      )}
    </div>
  );
}

function ClaimRow({
  claim,
  selected,
  animate,
  onClick,
}: {
  claim: Claim;
  selected: boolean;
  animate: boolean;
  onClick: () => void;
}) {
  const onDevice = claim.extractor === "gemma-on-device";
  // Token-by-token reveal of the claim text as it streams in.
  const { shown, complete } = useTypewriter(claim.claim_text, animate);
  return (
    <button
      onClick={onClick}
      className={`card-enter block w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
        selected
          ? "border-gold/60 bg-gold/5"
          : "border-ink-600/70 bg-ink-800/60 hover:border-ink-500"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 truncate">
          <FileText size={11} className="shrink-0 text-paper-faint" />
          <span className="truncate font-mono text-[10px] uppercase tracking-wide text-paper-faint">
            {claim.dataset || "—"} · {claim.metric || claim.task}
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-1.5">
          {claim.is_own_contribution === false && (
            <span
              className="rounded bg-ink-600/60 px-1 py-0.5 font-mono text-[8px] uppercase tracking-wide text-paper-faint"
              title={`Cited third-party result${claim.about_system ? ` (${claim.about_system})` : ""} — context only, not compared`}
            >
              cited
            </span>
          )}
          <ConfidencePill level={claim.result_confidence} />
        </div>
      </div>
      <div className="mt-1 line-clamp-2 font-serif text-[12px] leading-snug text-paper-dim">
        {shown}
        {!complete && (
          <span className="ml-0.5 inline-block h-3 w-1.5 -translate-y-[1px] animate-pulse bg-gold-soft align-middle" />
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 rounded bg-sage-dim/15 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-sage-soft">
          <ShieldCheck size={9} /> {onDevice ? "on-device · Gemma 4" : "Gemma 4"}
        </span>
        <span className="shrink-0 font-mono text-[14px] font-semibold text-paper">
          {claim.result_value || "—"}
        </span>
      </div>
    </button>
  );
}
