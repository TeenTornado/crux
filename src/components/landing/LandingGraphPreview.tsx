"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

// A self-contained, looping mock of the evidence graph:
// 0 empty → 1 nodes stream in → 2 edges draw grey → 3 verdicts resolve
// (rust contradiction, gold divergences) → 4 experiment surfaces → loop.

const NODES = [
  { id: "A", x: 96, y: 78, label: "Paper A", value: "84.2%", tint: "#C9A227" },
  { id: "B", x: 96, y: 262, label: "Paper B", value: "81.6%", tint: "#6B8F71" },
  { id: "C", x: 404, y: 170, label: "Paper C", value: "82.9%", tint: "#8FA6C1" },
];

const EDGES = [
  { from: "A", to: "C", kind: "contradiction", color: "#C1440E" },
  { from: "A", to: "B", kind: "divergence", color: "#C9A227" },
  { from: "B", to: "C", kind: "divergence", color: "#C9A227" },
];

const pt = (id: string) => NODES.find((n) => n.id === id)!;

export function LandingGraphPreview() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const durations = [900, 1400, 1500, 2600, 1800]; // per-step dwell
    const t = setTimeout(() => setStep((s) => (s + 1) % 5), durations[step]);
    return () => clearTimeout(t);
  }, [step]);

  const nodesVisible = step >= 1;
  const edgesDrawn = step >= 2;
  const resolved = step >= 3;
  const experiment = step >= 4;

  return (
    <div className="relative w-full overflow-hidden rounded-2xl border border-ink-500/70 bg-ink-800/60 p-1 shadow-[0_40px_120px_-40px_rgba(0,0,0,0.8)]">
      {/* window chrome */}
      <div className="flex items-center gap-1.5 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rust/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-gold/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-sage/70" />
        <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.2em] text-paper-faint">
          crux · evidence graph
        </span>
        <span className="ml-auto font-mono text-[10px] text-paper-faint">
          {stepLabel(step)}
        </span>
      </div>

      <div className="relative rounded-xl bg-[#10151a]">
        <svg viewBox="0 0 500 340" className="h-[300px] w-full sm:h-[360px]">
          {/* dotted background */}
          <defs>
            <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
              <circle cx="1" cy="1" r="1" fill="#222b32" />
            </pattern>
          </defs>
          <rect width="500" height="340" fill="url(#dots)" />

          {/* edges */}
          {EDGES.map((e) => {
            const a = pt(e.from);
            const b = pt(e.to);
            const isContra = e.kind === "contradiction";
            const stroke = resolved ? e.color : "#37424C";
            return (
              <g key={`${e.from}${e.to}`}>
                <motion.line
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  stroke={stroke}
                  strokeWidth={resolved && isContra ? 3 : 2}
                  strokeLinecap="round"
                  strokeDasharray={edgesDrawn && !resolved ? "5 5" : undefined}
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{
                    pathLength: edgesDrawn ? 1 : 0,
                    opacity: edgesDrawn ? (resolved ? 0.95 : 0.5) : 0,
                    stroke,
                    strokeWidth: resolved && isContra ? 3 : 2,
                  }}
                  transition={{ duration: 0.6, ease: "easeInOut" }}
                />
                {/* pulse ring on the contradiction edge as it resolves */}
                {isContra && resolved && (
                  <motion.circle
                    cx={(a.x + b.x) / 2}
                    cy={(a.y + b.y) / 2}
                    r={6}
                    fill="none"
                    stroke={e.color}
                    initial={{ r: 4, opacity: 0.8 }}
                    animate={{ r: 22, opacity: 0 }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
                {/* verdict tag on contradiction edge */}
                {isContra && resolved && (
                  <motion.g
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                  >
                    <rect
                      x={(a.x + b.x) / 2 - 52}
                      y={(a.y + b.y) / 2 - 30}
                      width="104"
                      height="20"
                      rx="10"
                      fill="#1d1410"
                      stroke="#C1440E"
                      strokeOpacity="0.5"
                    />
                    <text
                      x={(a.x + b.x) / 2}
                      y={(a.y + b.y) / 2 - 16}
                      textAnchor="middle"
                      fill="#D9622C"
                      fontSize="10"
                      fontFamily="var(--font-mono)"
                      letterSpacing="1"
                    >
                      CONTRADICTION
                    </text>
                  </motion.g>
                )}
              </g>
            );
          })}

          {/* nodes */}
          {NODES.map((n, i) => (
            <motion.g
              key={n.id}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{
                opacity: nodesVisible ? 1 : 0,
                scale: nodesVisible ? 1 : 0.6,
              }}
              transition={{ duration: 0.5, delay: nodesVisible ? i * 0.18 : 0 }}
              style={{ transformOrigin: `${n.x}px ${n.y}px` }}
            >
              <rect
                x={n.x - 62}
                y={n.y - 26}
                width="124"
                height="52"
                rx="12"
                fill="#161b20"
                stroke={n.tint}
                strokeOpacity="0.5"
              />
              <circle cx={n.x - 44} cy={n.y - 8} r="7" fill={`${n.tint}30`} stroke={n.tint} strokeOpacity="0.7" />
              <text x={n.x - 44} y={n.y - 4.5} textAnchor="middle" fill={n.tint} fontSize="9" fontFamily="var(--font-mono)" fontWeight="600">
                {n.id}
              </text>
              <text x={n.x - 30} y={n.y - 4} fill="#8A8577" fontSize="9" fontFamily="var(--font-mono)" letterSpacing="0.5">
                ImageNet
              </text>
              <text x={n.x - 44} y={n.y + 16} fill="#EDE6D6" fontSize="15" fontFamily="var(--font-mono)" fontWeight="600">
                {n.value}
              </text>
              {/* on-device dot */}
              <circle cx={n.x + 50} cy={n.y - 12} r="3" fill="#6B8F71" />
            </motion.g>
          ))}
        </svg>

        {/* streaming caption */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
          <StatusChip step={step} />
          {experiment && (
            <motion.div
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1.5 rounded-lg border border-rust-dim/60 bg-rust/10 px-2.5 py-1"
            >
              <span className="font-mono text-[10px] uppercase tracking-wide text-rust-soft">
                Experiment generated
              </span>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatusChip({ step }: { step: number }) {
  const map = [
    { t: "Ready", c: "#8A8577" },
    { t: "Gemma 4 extracting on-device…", c: "#6B8F71" },
    { t: "Building candidate edges…", c: "#8A8577" },
    { t: "Gemini diagnosing conditions…", c: "#C9A227" },
    { t: "1 contradiction · 2 divergences", c: "#D9622C" },
  ];
  const m = map[step];
  return (
    <div className="flex items-center gap-2 rounded-lg border border-ink-500/70 bg-ink-900/80 px-2.5 py-1 backdrop-blur">
      <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: m.c }} />
      <span className="font-mono text-[10px] text-paper-dim">{m.t}</span>
    </div>
  );
}

function stepLabel(step: number) {
  return `${step + 1}/5`;
}
