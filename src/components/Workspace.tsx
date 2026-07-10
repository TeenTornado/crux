"use client";

import { useEffect, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { FileText, Layers, ChevronRight } from "lucide-react";
import { Header } from "@/components/Header";
import { SourcesPanel } from "@/components/SourcesPanel";
import { EvidenceGraph } from "@/components/EvidenceGraph";
import { RightSidebar } from "@/components/RightSidebar";
import { ConversationOverlay } from "@/components/AskPanel";
import { SourceViewer } from "@/components/SourceViewer";
import { useStore } from "@/lib/store";
import { runJudgeMode } from "@/lib/actions";

export function Workspace() {
  const phase = useStore((s) => s.phase);
  const judgeMode = useStore((s) => s.judgeMode);
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const leftCollapsed = useStore((s) => s.leftCollapsed);
  // Mobile (<lg): sidebars overlay the graph as drawers instead of grid columns.
  const [mobilePanel, setMobilePanel] = useState<"sources" | "context" | null>(null);

  useEffect(() => {
    if (judgeMode) runJudgeMode();
  }, [judgeMode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA");
      // Note: ⌘B is owned by the left nav (AppSidebar). The right sidebar toggles
      // via its ✕ / rail buttons. ⌘. also collapses the right panel here.
      if ((e.metaKey || e.ctrlKey) && e.key === ".") {
        e.preventDefault();
        useStore.getState().toggleSidebar();
      } else if ((e.metaKey || e.ctrlKey) && e.key === "[") {
        e.preventDefault();
        useStore.getState().toggleLeftSidebar();
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        document.getElementById("claim-search")?.focus();
      } else if (e.key === "Escape") {
        const st = useStore.getState();
        if (st.chatExpanded) {
          st.setChatExpanded(false);
          return;
        }
        if (st.searchQuery) st.setSearchQuery("");
        st.selectClaim(null);
        st.selectEdge(null);
        (document.getElementById("claim-search") as HTMLInputElement)?.blur();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <Header />

      {judgeMode && (
        <div className="flex items-center justify-center gap-2 border-b border-gold-dim/40 bg-gold/8 py-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-soft" />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-gold-soft">
            Judge Mode — auto-playing the full flow on a loop
          </span>
        </div>
      )}

      <main
        className={`grid min-h-0 flex-1 grid-cols-1 transition-[grid-template-columns] duration-300 ease-out ${
          leftCollapsed
            ? collapsed
              ? "lg:grid-cols-[44px_1fr_40px] xl:grid-cols-[44px_1fr_40px]"
              : "lg:grid-cols-[44px_1fr_320px] xl:grid-cols-[44px_1fr_400px]"
            : collapsed
            ? "lg:grid-cols-[288px_1fr_40px] xl:grid-cols-[320px_1fr_40px]"
            : "lg:grid-cols-[288px_1fr_320px] xl:grid-cols-[320px_1fr_400px]"
        }`}
      >
        <section className="hidden min-h-0 border-r border-paper/10 lg:block">
          {leftCollapsed ? <SourcesRail /> : <SourcesPanel />}
        </section>

        <section className="relative min-h-0">
          {/* Mobile: shifted right of the sources FAB (left-3) to avoid overlap */}
          <div className="pointer-events-none absolute left-16 top-[22px] z-10 lg:left-4 lg:top-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper-faint">
              Evidence graph
            </span>
          </div>
          <div className="h-full w-full">
            <ReactFlowProvider>
              <EvidenceGraph />
            </ReactFlowProvider>
          </div>
          {phase === "reconciling" && (
            <div className="pointer-events-none absolute bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-gold-dim/50 bg-ink-800/95 px-4 py-1.5 font-mono text-[11px] text-gold-soft backdrop-blur">
              Reconciling condition diffs…
            </div>
          )}

          {/* Mobile: 44px touch targets to open the sidebars as drawers */}
          <div className="absolute left-3 top-3 z-20 lg:hidden">
            <button
              onClick={() => setMobilePanel("sources")}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-ink-500 bg-ink-800/90 text-paper-dim backdrop-blur transition-colors hover:text-paper"
              aria-label="Open sources"
            >
              <FileText size={17} />
            </button>
          </div>
          <div className="absolute right-3 top-3 z-20 lg:hidden">
            <button
              onClick={() => {
                // A collapsed right sidebar would render its rail inside the
                // drawer — force-expand for the mobile overlay.
                useStore.getState().setSidebarCollapsed(false);
                setMobilePanel("context");
              }}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-ink-500 bg-ink-800/90 text-paper-dim backdrop-blur transition-colors hover:text-paper"
              aria-label="Open context"
            >
              <Layers size={17} />
            </button>
          </div>
        </section>

        <section className="hidden min-h-0 lg:block">
          <RightSidebar />
        </section>
      </main>

      {/* Mobile drawers — overlay (not push) with a tap-to-close scrim */}
      {mobilePanel && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/55"
            onClick={() => setMobilePanel(null)}
            aria-label="Close panel"
          />
          <div
            className={`absolute inset-y-0 w-[86vw] max-w-[360px] border-paper/10 bg-ink-900 pb-[env(safe-area-inset-bottom)] shadow-[0_0_60px_rgba(0,0,0,0.6)] ${
              mobilePanel === "sources" ? "left-0 border-r" : "right-0 border-l"
            }`}
          >
            {mobilePanel === "sources" ? <SourcesPanel /> : <RightSidebar />}
          </div>
        </div>
      )}

      <SourceViewer />
      <ConversationOverlay />
    </div>
  );
}

/** Collapsed sources column — a thin rail that reclaims space for the graph. */
function SourcesRail() {
  const papers = useStore((s) => s.papers);
  const claims = useStore((s) => s.claims);
  const setLeftCollapsed = useStore((s) => s.setLeftCollapsed);
  return (
    <div className="flex h-full w-full flex-col items-center gap-3 py-3">
      <button
        onClick={() => setLeftCollapsed(false)}
        className="flex h-8 w-8 items-center justify-center rounded-lg text-paper-faint transition-colors hover:text-paper"
        title="Expand sources (⌘[)"
        aria-label="Expand sources panel"
      >
        <ChevronRight size={16} />
      </button>
      <span
        className="font-mono text-[9px] uppercase tracking-[0.2em] text-paper-faint"
        style={{ writingMode: "vertical-rl" }}
      >
        Sources · {papers.length}p · {claims.length}c
      </span>
    </div>
  );
}
