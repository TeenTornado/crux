"use client";

import { useEffect } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import { ShieldCheck, ArrowRight, FlaskConical } from "lucide-react";

interface Props {
  onPrefill?: (text: string) => void;
  onLoadDemo?: () => void;
  /** When set, every block runs this instead (used on the landing → Try demo). */
  onAll?: () => void;
  allHint?: string;
}

/**
 * Decorative-but-interactive blocks scattered in the home margins. Each drifts,
 * parallaxes to the cursor, lifts on hover, and either opens the demo or seeds
 * the composer with a matching question. Shown only where there's room (xl+).
 */
export function HomeBlocks({ onPrefill, onLoadDemo, onAll, allHint }: Props) {
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 55, damping: 18, mass: 0.6 });
  const sy = useSpring(my, { stiffness: 55, damping: 18, mass: 0.6 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mx.set((e.clientX / window.innerWidth - 0.5) * 2);
      my.set((e.clientY / window.innerHeight - 0.5) * 2);
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [mx, my]);

  const noop = () => {};
  const act = (fn: () => void) => onAll ?? fn;
  const hint = (h: string) => allHint ?? h;

  return (
    <div className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden xl:block">
      <Block pos={{ top: "15%", left: "3.5%" }} rotate={-5} depth={16} delay={0.15} sx={sx} sy={sy} hint={hint("open demo")} onClick={act(onLoadDemo ?? noop)}>
        <MiniGraph />
      </Block>

      <Block pos={{ top: "50%", left: "5.5%" }} rotate={3} depth={22} delay={0.3} sx={sx} sy={sy} hint={hint("ask why")} onClick={act(() => onPrefill?.("Why do roughly half of published ML results fail to replicate?"))}>
        <StatCard />
      </Block>

      <Block pos={{ bottom: "13%", left: "8%" }} rotate={-3} depth={12} delay={0.45} sx={sx} sy={sy} hint={hint("open demo")} onClick={act(onLoadDemo ?? noop)}>
        <ClaimCard />
      </Block>

      <Block pos={{ top: "18%", right: "4%" }} rotate={4} depth={18} delay={0.22} sx={sx} sy={sy} hint={hint("find it")} onClick={act(() => onPrefill?.("Show me the strongest contradiction and how to resolve it."))}>
        <VerdictCard />
      </Block>

      <Block pos={{ top: "52%", right: "5.5%" }} rotate={-4} depth={26} delay={0.36} sx={sx} sy={sy} hint={hint("reconcile")} onClick={act(onLoadDemo ?? noop)}>
        <VersusCard />
      </Block>

      <Block pos={{ bottom: "15%", right: "7%" }} rotate={5} depth={14} delay={0.5} sx={sx} sy={sy} hint={hint("design one")} onClick={act(() => onPrefill?.("What experiment would resolve the top contradiction?"))}>
        <ExperimentCard />
      </Block>
    </div>
  );
}

function Block({
  children,
  pos,
  rotate,
  depth,
  delay,
  sx,
  sy,
  hint,
  onClick,
}: {
  children: React.ReactNode;
  pos: React.CSSProperties;
  rotate: number;
  depth: number;
  delay: number;
  sx: MotionValue<number>;
  sy: MotionValue<number>;
  hint: string;
  onClick: () => void;
}) {
  const x = useTransform(sx, (v) => v * depth);
  const y = useTransform(sy, (v) => v * depth);
  return (
    <motion.div className="pointer-events-auto absolute" style={{ ...pos, x, y, rotate }}>
      <motion.button
        onClick={onClick}
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1, y: [0, -7, 0] }}
        transition={{
          opacity: { delay, duration: 0.6 },
          scale: { delay, duration: 0.6, ease: "easeOut" },
          y: { duration: 6 + depth / 10, repeat: Infinity, ease: "easeInOut", delay },
        }}
        whileHover={{ scale: 1.06, rotate: 0 }}
        className="group/blk relative block rounded-2xl border border-ink-500/70 bg-ink-800/70 p-3 text-left shadow-[0_18px_50px_-26px_rgba(0,0,0,0.8)] backdrop-blur transition-colors hover:border-gold-dim/50"
      >
        {children}
        <span className="pointer-events-none absolute -bottom-2.5 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full border border-gold-dim/50 bg-ink-900 px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-gold-soft opacity-0 transition-opacity group-hover/blk:opacity-100">
          {hint} <ArrowRight size={9} />
        </span>
      </motion.button>
    </motion.div>
  );
}

// ── Block contents ───────────────────────────────────────────────────────────

function MiniGraph() {
  return (
    <div className="w-[168px]">
      <div className="mb-1.5 font-mono text-[8.5px] uppercase tracking-[0.16em] text-paper-faint">
        evidence graph
      </div>
      <svg viewBox="0 0 168 66" className="w-full">
        <line x1="30" y1="18" x2="132" y2="30" stroke="#C1440E" strokeWidth="2" />
        <line x1="30" y1="18" x2="46" y2="52" stroke="#C9A227" strokeWidth="1.5" opacity="0.8" />
        <line x1="46" y1="52" x2="132" y2="30" stroke="#6B8F71" strokeWidth="1.5" opacity="0.8" />
        <motion.circle
          cx="81" cy="24" r="4" fill="none" stroke="#C1440E"
          animate={{ r: [4, 13, 4], opacity: [0.8, 0, 0.8] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
        {[
          [30, 18, "#C9A227"],
          [46, 52, "#6B8F71"],
          [132, 30, "#8FA6C1"],
        ].map(([cx, cy, c], i) => (
          <circle key={i} cx={cx as number} cy={cy as number} r="5" fill="#161b20" stroke={c as string} strokeWidth="1.4" />
        ))}
      </svg>
    </div>
  );
}

function StatCard() {
  return (
    <div className="w-[150px]">
      <div className="font-serif text-[30px] leading-none text-gold-soft">≈50%</div>
      <div className="mt-1.5 text-[10.5px] leading-tight text-paper-dim">
        of published ML results <span className="text-paper">fail to replicate</span>
      </div>
    </div>
  );
}

function ClaimCard() {
  return (
    <div className="w-[168px]">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-[8.5px] uppercase tracking-wide text-paper-faint">
          ImageNet-1k · Top-1
        </span>
      </div>
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[19px] font-semibold text-gold-soft">84.2%</span>
        <span className="font-mono text-[8px] uppercase text-paper-faint">reported</span>
      </div>
      <span className="mt-2 inline-flex items-center gap-1 rounded bg-sage-dim/15 px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wide text-sage-soft">
        <ShieldCheck size={9} /> Gemma 4
      </span>
    </div>
  );
}

function VerdictCard() {
  return (
    <div className="w-[176px]">
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-wide text-rust-soft"
        style={{ background: "rgba(193,68,14,0.12)", boxShadow: "inset 0 0 0 1px rgba(193,68,14,0.45)" }}
      >
        <span className="h-1 w-1 rounded-full bg-rust" /> genuine contradiction
      </span>
      <div className="mt-2 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink-600">
          <div className="h-full rounded-full bg-rust" style={{ width: "82%" }} />
        </div>
        <span className="font-mono text-[9px] text-paper-dim">0.82</span>
      </div>
      <div className="mt-1.5 text-[10px] leading-tight text-paper-faint">
        same recipe · results differ 9σ
      </div>
    </div>
  );
}

function VersusCard() {
  return (
    <div className="flex w-[178px] items-center gap-2">
      <Pill handle="A" value="84.2" tint="#C9A227" />
      <div className="flex flex-col items-center">
        <span className="font-mono text-[8px] uppercase text-paper-faint">vs</span>
        <div className="my-0.5 h-4 w-px bg-rust/60" />
      </div>
      <Pill handle="C" value="82.9" tint="#8FA6C1" />
    </div>
  );
}

function Pill({ handle, value, tint }: { handle: string; value: string; tint: string }) {
  return (
    <div className="flex-1 rounded-lg border border-ink-600 bg-ink-900/50 px-2 py-1.5 text-center">
      <span
        className="inline-flex h-4 w-4 items-center justify-center rounded font-mono text-[9px] font-semibold"
        style={{ color: tint, background: `${tint}22` }}
      >
        {handle}
      </span>
      <div className="mt-1 font-mono text-[14px] font-semibold text-paper">{value}</div>
    </div>
  );
}

function ExperimentCard() {
  return (
    <div className="w-[166px]">
      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-wide text-rust-soft">
        <FlaskConical size={10} /> POPPER plan
      </div>
      <div className="space-y-1">
        <div className="flex gap-1.5">
          <span className="font-mono text-[9px] font-semibold text-rust-soft">H₀</span>
          <span className="text-[9.5px] leading-tight text-paper-faint">84.2% not reproducible</span>
        </div>
        <div className="flex gap-1.5">
          <span className="font-mono text-[9px] font-semibold text-rust-soft">H₁</span>
          <span className="text-[9.5px] leading-tight text-paper-faint">recover with EMA warmup</span>
        </div>
      </div>
    </div>
  );
}
