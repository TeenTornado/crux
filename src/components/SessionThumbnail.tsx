"use client";

import type { Session } from "@/lib/db";
import { VERDICT_META } from "@/lib/theme";

/** Deterministic mini-graph snapshot of a session's evidence graph. */
export function SessionThumbnail({ session }: { session: Session }) {
  const W = 210;
  const H = 84;
  const claims = session.claims;
  // Position nodes on a circle for a compact, legible snapshot.
  const n = Math.min(claims.length, 8);
  const nodes = Array.from({ length: n }, (_, i) => {
    const angle = (i / Math.max(1, n)) * Math.PI * 2 - Math.PI / 2;
    return {
      id: claims[i]?.claim_id,
      x: W / 2 + Math.cos(angle) * 62,
      y: H / 2 + Math.sin(angle) * 26,
    };
  });
  const nodeById = new Map(nodes.map((nd) => [nd.id, nd]));

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block bg-[#10151a]">
      <defs>
        <pattern id={`d-${session.id}`} width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.8" fill="#1c242b" />
        </pattern>
      </defs>
      <rect width={W} height={H} fill={`url(#d-${session.id})`} />
      {session.edges.map((e, i) => {
        const a = nodeById.get(e.source_claim_id);
        const b = nodeById.get(e.target_claim_id);
        if (!a || !b) return null;
        const v = e.reconciliation?.verdict;
        const color = v ? VERDICT_META[v].color : "#37424C";
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={color}
            strokeWidth={v === "GENUINE_CONTRADICTION" ? 1.8 : 1.2}
            opacity={v ? 0.9 : 0.4}
          />
        );
      })}
      {nodes.map((nd, i) => (
        <circle key={i} cx={nd.x} cy={nd.y} r="3.4" fill="#161b20" stroke="#6B8F71" strokeOpacity="0.6" strokeWidth="1" />
      ))}
      {claims.length === 0 && (
        <text x={W / 2} y={H / 2 + 3} textAnchor="middle" fill="#8A8577" fontSize="10" fontFamily="var(--font-mono)">
          empty session
        </text>
      )}
    </svg>
  );
}
