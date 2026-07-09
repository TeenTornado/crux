"use client";

import { useEffect } from "react";
import { ReactFlowProvider } from "@xyflow/react";
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
          collapsed
            ? "lg:grid-cols-[288px_1fr_40px] xl:grid-cols-[320px_1fr_40px]"
            : "lg:grid-cols-[288px_1fr_320px] xl:grid-cols-[320px_1fr_400px]"
        }`}
      >
        <section className="hidden min-h-0 border-r border-paper/10 lg:block">
          <SourcesPanel />
        </section>

        <section className="relative min-h-0">
          <div className="pointer-events-none absolute left-4 top-3 z-10">
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
            <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-gold-dim/50 bg-ink-800/95 px-4 py-1.5 font-mono text-[11px] text-gold-soft backdrop-blur">
              Reconciling condition diffs…
            </div>
          )}
        </section>

        <section className="hidden min-h-0 lg:block">
          <RightSidebar />
        </section>
      </main>

      <SourceViewer />
      <ConversationOverlay />
    </div>
  );
}
