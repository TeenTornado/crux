"use client";

import { useStore } from "@/lib/store";
import { AgentState } from "./AgentState";
import { DetailPanel } from "./DetailPanel";
import { AskPanel } from "./AskPanel";
import { PanelRightClose, ChevronLeft, Layers, MessageSquare } from "lucide-react";

export function RightSidebar() {
  const collapsed = useStore((s) => s.sidebarCollapsed);
  const activeTab = useStore((s) => s.activeTab);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const setCollapsed = useStore((s) => s.setSidebarCollapsed);
  const edges = useStore((s) => s.edges);
  const contradictions = edges.filter(
    (e) => e.reconciliation?.verdict === "GENUINE_CONTRADICTION"
  ).length;

  if (collapsed) {
    return (
      <div className="flex h-full w-10 flex-col items-center border-l border-paper/10 bg-ink-900/40 py-3">
        <button
          onClick={() => setCollapsed(false)}
          className="mb-4 text-paper-faint transition-colors hover:text-paper"
          title="Expand sidebar (⌘B)"
        >
          <ChevronLeft size={16} />
        </button>
        <RailLabel
          label="Context"
          active={activeTab === "context"}
          onClick={() => setActiveTab("context")}
        />
        <RailLabel
          label="Ask"
          active={activeTab === "ask"}
          onClick={() => setActiveTab("ask")}
        />
        {contradictions > 0 && (
          <span
            className="mt-4 h-2 w-2 animate-pulse rounded-full bg-rust"
            title={`${contradictions} contradiction${contradictions > 1 ? "s" : ""}`}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col border-l border-paper/10">
      {/* Tab bar */}
      <div className="flex items-center justify-between border-b border-paper/10 px-2 py-2">
        <div className="flex items-center gap-1">
          <Tab
            icon={<Layers size={13} />}
            label="Context"
            active={activeTab === "context"}
            onClick={() => setActiveTab("context")}
            badge={contradictions > 0 ? contradictions : undefined}
          />
          <Tab
            icon={<MessageSquare size={13} />}
            label="Ask"
            active={activeTab === "ask"}
            onClick={() => setActiveTab("ask")}
          />
        </div>
        <button
          onClick={() => setCollapsed(true)}
          className="mr-1 text-paper-faint transition-colors hover:text-paper"
          title="Collapse sidebar (⌘B)"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      {/* Agent state — the visible sense-decide-act-check surface (both tabs) */}
      <AgentState />

      {/* Active tab content */}
      <div className="min-h-0 flex-1">
        {activeTab === "context" ? <DetailPanel /> : <AskPanel />}
      </div>
    </div>
  );
}

function Tab({
  icon,
  label,
  active,
  onClick,
  badge,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
        active
          ? "bg-ink-700 text-paper"
          : "text-paper-faint hover:text-paper-dim"
      }`}
    >
      {icon}
      {label}
      {badge != null && (
        <span className="ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rust px-1 font-mono text-[9px] font-semibold text-paper">
          {badge}
        </span>
      )}
    </button>
  );
}

function RailLabel({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`my-1 py-2 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors ${
        active ? "text-gold-soft" : "text-paper-faint hover:text-paper-dim"
      }`}
      style={{ writingMode: "vertical-rl" }}
    >
      {label}
    </button>
  );
}
