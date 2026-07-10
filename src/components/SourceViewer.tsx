"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";
import { DEMO_PAPER_BODIES, type PageBlock } from "@/lib/demoData";
import { HandleChip } from "./ui";
import { X, FileText, ShieldCheck } from "lucide-react";

/** Split a paragraph and wrap the first occurrence of `span` in a highlight. */
function highlight(text: string, span: string) {
  if (!span) return [text];
  const key = span.trim().slice(0, 60);
  const idx = text.toLowerCase().indexOf(key.toLowerCase());
  if (idx === -1) return [text];
  // Extend the match to the end of the sentence for a cleaner highlight.
  let end = idx + key.length;
  const dot = text.indexOf(". ", end);
  if (dot !== -1 && dot - idx < 220) end = dot + 1;
  return [
    text.slice(0, idx),
    <mark
      key="hl"
      className="rounded bg-gold/25 px-0.5 text-paper shadow-[inset_0_-2px_0_rgba(201,162,39,0.6)]"
    >
      {text.slice(idx, end)}
    </mark>,
    text.slice(end),
  ];
}

export function SourceViewer() {
  const claimId = useStore((s) => s.sourceViewClaimId);
  const openSource = useStore((s) => s.openSource);
  const claim = useStore((s) =>
    s.claims.find((c) => c.claim_id === claimId)
  );
  const paper = useStore((s) =>
    s.papers.find((p) => p.paper_id === claim?.paper_id)
  );
  const markRef = useRef<HTMLDivElement>(null);

  const body: PageBlock[] | undefined = claim
    ? DEMO_PAPER_BODIES[claim.paper_id]
    : undefined;

  // Scroll the highlighted span into view once rendered.
  useEffect(() => {
    if (!claimId) return;
    const t = setTimeout(() => {
      markRef.current
        ?.querySelector("mark")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && openSource(null);
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [claimId, openSource]);

  return (
    <AnimatePresence>
      {claim && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-ink-900/80 backdrop-blur-sm"
            onClick={() => openSource(null)}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 8 }}
            transition={{ duration: 0.25 }}
            className="relative z-10 flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-ink-500 bg-ink-800 pb-[env(safe-area-inset-bottom)] shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)] sm:h-[80vh] sm:max-w-3xl sm:rounded-2xl sm:pb-0"
          >
            {/* header */}
            <div className="flex items-center justify-between border-b border-paper/10 px-5 py-3">
              <div className="flex items-center gap-2.5">
                {paper && <HandleChip handle={paper.handle} />}
                <div>
                  <div className="flex items-center gap-2 font-serif text-[14px] text-paper">
                    <FileText size={13} className="text-paper-faint" />
                    {paper?.title || "Source"}
                  </div>
                  <div className="font-mono text-[10px] text-paper-faint">
                    source provenance · page {claim.source_span.page}
                  </div>
                </div>
              </div>
              <button
                onClick={() => openSource(null)}
                className="text-paper-faint transition-colors hover:text-paper"
              >
                <X size={18} />
              </button>
            </div>

            {/* claim recap */}
            <div className="flex items-center justify-between gap-3 border-b border-paper/10 bg-ink-900/40 px-5 py-2.5">
              <span className="truncate font-serif text-[13px] text-paper-dim">
                {claim.dataset} · {claim.metric}
              </span>
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded bg-sage-dim/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wide text-sage-soft">
                  <ShieldCheck size={9} />
                  {claim.extractor === "gemma-on-device" ? "on-device · Gemma 4" : "Gemma 4"}
                </span>
                <span className="font-mono text-[14px] font-semibold text-gold-soft">
                  {claim.result_value}
                </span>
              </div>
            </div>

            {/* page body */}
            <div ref={markRef} className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
              {body ? (
                <div className="mx-auto max-w-xl space-y-5">
                  {body.map((blk, i) => (
                    <div key={i}>
                      <div className="mb-1 flex items-center justify-between">
                        {blk.heading ? (
                          <h4 className="font-serif text-[14px] font-semibold text-paper">
                            {blk.heading}
                          </h4>
                        ) : (
                          <span />
                        )}
                        <span className="font-mono text-[9px] uppercase tracking-wide text-paper-faint">
                          p.{blk.page}
                        </span>
                      </div>
                      <p className="text-[13px] leading-relaxed text-paper-dim">
                        {highlight(blk.text, claim.source_span.text)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                // Uploaded papers: no reconstructed body, show the span in a page frame.
                <div className="mx-auto max-w-xl">
                  <div className="rounded-lg border border-ink-600 bg-ink-900/60 p-5">
                    <div className="mb-2 font-mono text-[9px] uppercase tracking-wide text-paper-faint">
                      extracted source span · page {claim.source_span.page}
                    </div>
                    <p className="font-serif text-[14px] leading-relaxed text-paper">
                      <mark className="rounded bg-gold/25 px-0.5 text-paper shadow-[inset_0_-2px_0_rgba(201,162,39,0.6)]">
                        {claim.source_span.text || "(no span captured)"}
                      </mark>
                    </p>
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-paper-faint">
                    Full-page rendering is available for the demo corpus. For uploads,
                    Gemma 4 returns the verbatim span and page for verification against
                    your original PDF.
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-paper/10 px-5 py-2 text-center font-mono text-[10px] text-paper-faint">
              esc to close · numeric values are reported, verify against the highlighted span
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
