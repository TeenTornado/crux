"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  type Node,
  type Edge,
  MarkerType,
} from "@xyflow/react";
import { useStore } from "@/lib/store";
import { ClaimNode } from "./ClaimNode";
import { VERDICT_META } from "@/lib/theme";
import type { Claim } from "@/lib/types";

const nodeTypes = { claim: ClaimNode };

const COL_W = 316;
const ROW_H = 132;
const PAD_X = 48;
const PAD_Y = 40;

export function EvidenceGraph() {
  const papers = useStore((s) => s.papers);
  const claims = useStore((s) => s.claims);
  const edges = useStore((s) => s.edges);
  const selectedClaimId = useStore((s) => s.selectedClaimId);
  const selectedEdgeId = useStore((s) => s.selectedEdgeId);
  const selectClaim = useStore((s) => s.selectClaim);
  const selectEdge = useStore((s) => s.selectEdge);

  // Which claims are attached to the currently selected edge (for emphasis).
  const activeClaimIds = useMemo(() => {
    const set = new Set<string>();
    const e = edges.find((x) => x.edge_id === selectedEdgeId);
    if (e) {
      set.add(e.source_claim_id);
      set.add(e.target_claim_id);
    }
    if (selectedClaimId) set.add(selectedClaimId);
    return set;
  }, [edges, selectedEdgeId, selectedClaimId]);

  const nodes: Node[] = useMemo(() => {
    const byPaper = new Map<string, Claim[]>();
    for (const c of claims) {
      if (!byPaper.has(c.paper_id)) byPaper.set(c.paper_id, []);
      byPaper.get(c.paper_id)!.push(c);
    }
    const anyActive = activeClaimIds.size > 0;
    const out: Node[] = [];
    papers.forEach((p, col) => {
      const list = byPaper.get(p.paper_id) || [];
      list.forEach((c, row) => {
        out.push({
          id: c.claim_id,
          type: "claim",
          position: { x: PAD_X + col * COL_W, y: PAD_Y + row * ROW_H },
          data: {
            handle: p.handle,
            metric: c.metric || c.task || "claim",
            dataset: c.dataset || "—",
            result: c.result_value,
            confidence: c.result_confidence,
            selected:
              c.claim_id === selectedClaimId || activeClaimIds.has(c.claim_id),
            dimmed: anyActive && !activeClaimIds.has(c.claim_id),
            onDevice: c.extractor !== "demo",
          },
          draggable: true,
        });
      });
    });
    return out;
  }, [papers, claims, selectedClaimId, activeClaimIds]);

  const rfEdges: Edge[] = useMemo(() => {
    return edges.map((e) => {
      const v = e.reconciliation?.verdict;
      const meta = v ? VERDICT_META[v] : null;
      const isSelected = e.edge_id === selectedEdgeId;
      const isReconciling = e.status === "reconciling";
      const color = meta?.color || "#37424C";
      return {
        id: e.edge_id,
        source: e.source_claim_id,
        target: e.target_claim_id,
        type: "default",
        animated: isReconciling,
        selected: isSelected,
        className: isReconciling ? "edge-animating" : undefined,
        style: {
          stroke: color,
          strokeWidth: isSelected ? 3.5 : v === "GENUINE_CONTRADICTION" ? 2.6 : 2,
          opacity: v ? (isSelected ? 1 : 0.85) : 0.4,
          strokeDasharray: v ? undefined : "5 5",
        },
        markerEnd: v
          ? { type: MarkerType.ArrowClosed, color, width: 14, height: 14 }
          : undefined,
      };
    });
  }, [edges, selectedEdgeId]);

  if (claims.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
        <div className="font-serif text-lg text-paper-dim">
          The evidence graph is empty
        </div>
        <div className="max-w-sm text-sm text-paper-faint">
          Load the demo corpus or drop 2–3 PDFs on the left. Claims will stream in
          as Gemma 4 extracts them, then edges appear as Gemini reconciles each
          overlapping result.
        </div>
      </div>
    );
  }

  // Mobile: tighter fit padding + deeper min-zoom so a 3-paper graph actually
  // fits a 375px screen; pinch-zoom replaces the +/- controls.
  const mobile = typeof window !== "undefined" && window.innerWidth < 1024;

  return (
    <ReactFlow
      nodes={nodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: mobile ? 0.05 : 0.24, maxZoom: mobile ? 0.9 : 1.1 }}
      minZoom={mobile ? 0.15 : 0.3}
      maxZoom={1.8}
      proOptions={{ hideAttribution: true }}
      onNodeClick={(_, n) => selectClaim(n.id)}
      onEdgeClick={(_, e) => selectEdge(e.id)}
      onPaneClick={() => {
        selectClaim(null);
        selectEdge(null);
      }}
      nodesConnectable={false}
      edgesFocusable
    >
      <Background variant={BackgroundVariant.Dots} gap={26} size={1} color="#222b32" />
      <Controls showInteractive={false} position="bottom-right" className="!hidden lg:!flex" />
    </ReactFlow>
  );
}
