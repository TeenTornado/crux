"use client";

import { Handle, Position, type NodeProps } from "@xyflow/react";
import { HandleChip, ConfidencePill } from "./ui";
import { paperTint } from "@/lib/theme";
import { ShieldCheck } from "lucide-react";

export interface ClaimNodeData {
  handle: string;
  metric: string;
  dataset: string;
  result: string;
  confidence: "low" | "medium" | "high";
  selected: boolean;
  dimmed: boolean;
  onDevice: boolean;
  [key: string]: unknown;
}

export function ClaimNode({ data }: NodeProps) {
  const d = data as ClaimNodeData;
  const tint = paperTint(d.handle);
  return (
    <div
      className={`group w-[224px] rounded-xl border bg-ink-800/95 px-3 py-2.5 backdrop-blur transition-all duration-300 ${
        d.selected
          ? "border-gold/70 shadow-[0_0_0_1px_rgba(201,162,39,0.5),0_10px_30px_-12px_rgba(201,162,39,0.4)]"
          : "border-ink-500/70 hover:border-paper-faint/50"
      } ${d.dimmed ? "opacity-35" : "opacity-100"}`}
    >
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
      <div className="mb-1.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <HandleChip handle={d.handle} />
          <span className="font-mono text-[10px] uppercase tracking-wider text-paper-faint">
            {d.dataset}
          </span>
        </div>
        {d.onDevice && (
          <ShieldCheck size={12} className="text-sage-soft/80" />
        )}
      </div>
      <div className="font-serif text-[13px] leading-tight text-paper">
        {d.metric}
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span
          className="font-mono text-[15px] font-semibold"
          style={{ color: tint }}
        >
          {d.result || "—"}
        </span>
        <ConfidencePill level={d.confidence} />
      </div>
    </div>
  );
}
