"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { getDB } from "@/lib/db";
import { LandingGraphPreview } from "@/components/landing/LandingGraphPreview";
import { HomeBlocks } from "@/components/HomeBlocks";
import {
  ExtractVisual,
  ReconcileVisual,
  ExperimentVisual,
} from "@/components/landing/MiniVisuals";
import {
  ArrowRight,
  Cpu,
  Cloud,
  Zap,
  Github,
  Check,
  Minus,
  FileSearch,
  GitCompareArrows,
  FlaskConical,
  Star,
  Sparkles,
  ChevronRight,
} from "lucide-react";

const GITHUB_URL = "https://github.com/TeenTornado/crux";

function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export default function Landing() {
  const router = useRouter();
  const [preparing, setPreparing] = useState(false);

  const tryDemo = useCallback(async () => {
    setPreparing(true);
    // Pre-warm IndexedDB while the transition plays.
    try {
      await getDB();
    } catch {
      /* private mode — app degrades gracefully */
    }
    await new Promise((r) => setTimeout(r, 550));
    router.push("/app");
  }, [router]);

  return (
    <div className="min-h-screen">
      <Nav />
      <Hero onTryDemo={tryDemo} />
      <TrustBar />
      <Explainer />
      <Comparison />
      <ClosingCta onTryDemo={tryDemo} />
      <Footer />
      <PrepareOverlay show={preparing} />
    </div>
  );
}

function PrepareOverlay({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-ink/90 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col items-center"
          >
            <div className="mb-5 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-gold-dim/50 bg-gold/10">
                <img src="/Crux_Logo.png" alt="" className="h-full w-full scale-[1.6] object-contain" />
              </div>
              <span className="font-serif text-[17px] font-semibold text-paper">Crux</span>
            </div>
            <div className="mb-4 font-serif text-[16px] text-paper-dim">
              Preparing your research canvas…
            </div>
            <div className="h-1 w-56 overflow-hidden rounded-full bg-ink-600">
              <motion.div
                className="h-full rounded-full bg-gold"
                initial={{ width: "0%" }}
                animate={{ width: "100%" }}
                transition={{ duration: 0.8, ease: "easeInOut" }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-paper/10 bg-ink/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-gold-dim/50 bg-gold/10">
            <img src="/Crux_Logo.png" alt="" className="h-full w-full scale-[1.6] object-contain" />
          </div>
          <span className="font-serif text-[18px] font-semibold tracking-tight text-paper">
            Crux
          </span>
        </div>
        <nav className="hidden items-center gap-7 md:flex">
          <a href="#how" className="text-[13px] text-paper-dim transition-colors hover:text-paper">
            How it works
          </a>
          <a href="#compare" className="text-[13px] text-paper-dim transition-colors hover:text-paper">
            Compare
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-[13px] text-paper-dim transition-colors hover:text-paper"
          >
            <Github size={14} /> GitHub
          </a>
        </nav>
        <Link
          href="/app"
          className="flex min-h-[44px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-ink-500 px-3 py-2 text-[13px] font-medium text-paper transition-colors hover:border-gold-dim/60 hover:bg-gold/5 md:min-h-0 md:py-1.5"
        >
          Open app <ArrowRight size={14} />
        </Link>
      </div>
    </header>
  );
}

function Hero({ onTryDemo }: { onTryDemo: () => void }) {
  return (
    <section className="relative flex min-h-[calc(100dvh-61px)] flex-col items-center justify-center overflow-hidden px-5 py-14">
      {/* Scattered interactive evidence blocks (xl+) — every block → Try the demo */}
      <HomeBlocks onAll={onTryDemo} allHint="try it" />

      {/* Centered hero copy */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 flex max-w-2xl flex-col items-center text-center"
      >
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-ink-500/70 bg-ink-800/60 px-3 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-rust" />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-paper-dim">
            Closes the evidence-to-experiment loop
          </span>
        </div>
        <h1 className="font-serif text-[34px] font-semibold leading-[1.06] tracking-tight text-paper sm:text-[40px] md:text-[58px] md:leading-[1.04]">
          Find the crux of <span className="text-gold-soft">why</span> papers
          disagree.
        </h1>
        <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-paper-dim md:text-[16px]">
          Every tool tells you <em className="text-paper">that</em> papers agree
          or disagree. Crux tells you <em className="text-paper">why</em> — it
          extracts the conditions behind each result, separates a genuine
          contradiction from a context-conditioned divergence, and generates the
          minimal experiment that would settle it.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onTryDemo}
            className="group flex items-center gap-2 rounded-xl bg-gold px-5 py-3 text-[14px] font-semibold text-ink-900 transition-colors hover:bg-gold-soft"
          >
            Try the demo
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </button>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl border border-ink-500 px-5 py-3 text-[14px] font-medium text-paper transition-colors hover:border-paper-faint/60"
          >
            <Github size={15} /> View on GitHub
          </a>
        </div>
        <p className="mt-3 font-mono text-[11px] text-paper-faint">
          No sign-up. One click into the tool.
        </p>
      </motion.div>

      {/* The big box — the animated evidence graph */}
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 0.2 }}
        className="relative z-10 mt-10 w-full max-w-[560px]"
      >
        <LandingGraphPreview />
      </motion.div>
    </section>
  );
}

function TrustBar() {
  const tiers = [
    { icon: <Cpu size={14} />, label: "Gemma 4", sub: "on-device extraction", tone: "#6B8F71" },
    { icon: <Cloud size={14} />, label: "Gemini 3", sub: "reconciliation reasoning", tone: "#C9A227" },
    { icon: <Zap size={14} />, label: "Gemini Flash", sub: "grounded chat", tone: "#8FA6C1" },
  ];
  return (
    <section className="border-y border-paper/10 bg-ink-900/40">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 py-5 md:flex-row md:justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper-faint">
          Powered by Google&apos;s stack
        </span>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {tiers.map((t) => (
            <div
              key={t.label}
              className="flex items-center gap-2 rounded-lg border px-3 py-1.5"
              style={{ borderColor: `${t.tone}40`, background: `${t.tone}0f` }}
            >
              <span style={{ color: t.tone }}>{t.icon}</span>
              <span className="text-[12px] font-medium text-paper">{t.label}</span>
              <span className="font-mono text-[9px] uppercase tracking-wide text-paper-faint">
                {t.sub}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Explainer() {
  const steps = [
    {
      n: "01",
      icon: <FileSearch size={16} />,
      title: "Extract",
      tone: "#6B8F71",
      body: "Gemma 4 reads each paper on-device and emits structured claims — task, dataset, metric, result, and the conditions around it — with a source span. Numbers are marked reported, not verified.",
      visual: <ExtractVisual />,
    },
    {
      n: "02",
      icon: <GitCompareArrows size={16} />,
      title: "Reconcile",
      tone: "#C9A227",
      body: "For any two claims on the same benchmark, Gemini diffs the conditions and classifies: genuine contradiction, context-conditioned divergence, or agreement — with a calibrated confidence and a reasoning trace you can read.",
      visual: <ReconcileVisual />,
    },
    {
      n: "03",
      icon: <FlaskConical size={16} />,
      title: "Experiment",
      tone: "#C1440E",
      body: "For a genuine contradiction, Crux generates a POPPER-style falsification plan — explicit hypotheses, variables held fixed, the discriminating ablation, a decision rule, and the compute it would take.",
      visual: <ExperimentVisual />,
    },
  ];
  return (
    <section id="how" className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <Reveal className="text-center">
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-paper-faint">
          How it works
        </div>
        <h2 className="mx-auto max-w-2xl font-serif text-[30px] font-semibold leading-tight tracking-tight text-paper md:text-[36px]">
          From a stack of PDFs to a runnable experiment — in three steps.
        </h2>
        <p className="mx-auto mt-3 max-w-lg text-[14px] leading-relaxed text-paper-faint">
          Each step is a real model call. The panels below are the actual output
          shapes you&apos;ll see in the tool.
        </p>
      </Reveal>

      <div className="relative mt-12 grid gap-5 md:grid-cols-3">
        {steps.map((s, i) => (
          <Reveal key={s.title} delay={i * 0.1} className="relative">
            <div
              style={{ ["--tone" as string]: s.tone }}
              className="group flex h-full flex-col overflow-hidden rounded-2xl border border-ink-500/60 bg-ink-800/40 p-5 transition-all duration-300 hover:-translate-y-1 hover:border-[color:var(--tone)]/50 hover:bg-ink-800/70 hover:shadow-[0_28px_60px_-32px_var(--tone)]"
            >
              <div
                className="absolute inset-x-0 top-0 h-[3px] opacity-70"
                style={{ background: `linear-gradient(90deg, ${s.tone}, transparent)` }}
              />
              <div className="mb-4 flex items-center gap-3">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110"
                  style={{ background: `${s.tone}1a`, color: s.tone, boxShadow: `inset 0 0 0 1px ${s.tone}44` }}
                >
                  {s.icon}
                </span>
                <div>
                  <div className="font-mono text-[9.5px] uppercase tracking-[0.16em] text-paper-faint">
                    Step {s.n}
                  </div>
                  <div className="font-serif text-[19px] font-semibold text-paper">
                    {s.title}
                  </div>
                </div>
              </div>
              <p className="mb-5 text-[13px] leading-relaxed text-paper-dim">{s.body}</p>
              <div className="mt-auto">{s.visual}</div>
            </div>

            {/* flow chevron between steps (desktop) */}
            {i < steps.length - 1 && (
              <div className="absolute -right-[15px] top-1/2 z-10 hidden -translate-y-1/2 md:block">
                <div className="flex h-6 w-6 items-center justify-center rounded-full border border-ink-500 bg-ink-900 text-paper-faint">
                  <ChevronRight size={13} />
                </div>
              </div>
            )}
          </Reveal>
        ))}
      </div>
    </section>
  );
}

function Comparison() {
  const rows = [
    ["Extract structured claims", true, true, false, true],
    ["Flag agreement / disagreement", true, false, true, true],
    ["Diagnose why results conflict", false, false, false, true],
    ["Genuine vs. context-conditioned", false, false, false, true],
    ["Generate a resolving experiment", false, false, false, true],
    ["On-device / private extraction", false, false, false, true],
  ] as const;
  const cols = ["Elicit", "Consensus", "scite", "Crux"];
  return (
    <section id="compare" className="border-t border-paper/10 bg-ink-900/30">
      <div className="mx-auto max-w-5xl px-5 py-16 md:py-24">
        <Reveal className="text-center">
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-paper-faint">
            How it&apos;s different
          </div>
          <h2 className="mx-auto max-w-2xl font-serif text-[30px] font-semibold leading-tight tracking-tight text-paper md:text-[36px]">
            Others tell you <em className="text-paper-dim">that</em>. Crux tells you{" "}
            <span className="text-gold-soft">why</span> — and what to run next.
          </h2>
        </Reveal>

        <Reveal delay={0.1}>
          {/* Mobile: 5 columns can't fit 375px — scroll the table inside the card */}
          <div className="mt-10 overflow-x-auto rounded-2xl border border-ink-500/60 bg-ink-800/20">
            <table className="w-full min-w-[560px] border-collapse text-left">
              <thead>
                <tr>
                  <th className="px-4 py-3.5 text-[11px] font-medium uppercase tracking-wide text-paper-faint">
                    Capability
                  </th>
                  {cols.map((c) => {
                    const isCrux = c === "Crux";
                    return (
                      <th
                        key={c}
                        className={`px-4 py-3.5 text-center text-[12.5px] font-semibold ${
                          isCrux
                            ? "border-x border-gold-dim/30 bg-gold/[0.08] text-gold-soft"
                            : "text-paper-faint"
                        }`}
                      >
                        <span className="inline-flex items-center gap-1">
                          {isCrux && <Star size={12} className="fill-gold-soft text-gold-soft" />}
                          {c}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, ...vals], i) => (
                  <tr
                    key={label as string}
                    className="border-t border-paper/[0.06] transition-colors hover:bg-ink-800/40"
                  >
                    <td className="px-4 py-3 text-[13px] text-paper-dim">{label}</td>
                    {vals.map((v, j) => {
                      const isCrux = j === 3;
                      return (
                        <td
                          key={j}
                          className={`px-4 py-3 text-center ${
                            isCrux ? "border-x border-gold-dim/20 bg-gold/[0.05]" : ""
                          }`}
                        >
                          <div className="flex justify-center">
                            {v ? (
                              <span
                                className={`flex h-5 w-5 items-center justify-center rounded-full ${
                                  isCrux ? "bg-gold/20 text-gold-soft" : "bg-sage/10 text-sage-soft/80"
                                }`}
                              >
                                <Check size={13} />
                              </span>
                            ) : (
                              <Minus size={14} className="text-ink-500" />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                <tr className="border-t border-gold-dim/30">
                  <td className="px-4 py-2.5 text-[11px] text-paper-faint">
                    Does all six
                  </td>
                  {[false, false, false, true].map((only, j) => (
                    <td
                      key={j}
                      className={`px-4 py-2.5 text-center font-mono text-[10px] uppercase tracking-wide ${
                        j === 3
                          ? "border-x border-gold-dim/20 bg-gold/[0.05] text-gold-soft"
                          : "text-paper-faint"
                      }`}
                    >
                      {only ? "only Crux" : "—"}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-center font-mono text-[10.5px] leading-relaxed text-paper-faint">
            Positioning based on public product capabilities. Crux is honest about the
            numeric-extraction bottleneck (44–69 F1 in SciLead/AxCell) and treats result
            values as human-verifiable.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function ClosingCta({ onTryDemo }: { onTryDemo: () => void }) {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
      <Reveal>
        <div className="relative overflow-hidden rounded-3xl border border-ink-500/60 bg-ink-800/40 px-5 py-12 text-center md:px-6 md:py-16">
          {/* glow */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(600px 240px at 50% 0%, rgba(201,162,39,0.10), transparent 70%)",
            }}
          />
          <div className="relative">
            <div className="mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-gold-dim/50 bg-gold/10">
              <Sparkles size={18} className="text-gold-soft" />
            </div>
            <h2 className="mx-auto max-w-2xl font-serif text-[32px] font-semibold leading-tight tracking-tight text-paper md:text-[44px]">
              See the contradiction surface in under 30 seconds.
            </h2>
            <p className="mx-auto mt-4 max-w-md text-[15px] leading-relaxed text-paper-dim">
              Load three real ML papers, watch the graph build, and get the experiment
              that settles the disagreement.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <button
                onClick={onTryDemo}
                className="group flex items-center gap-2 rounded-xl bg-gold px-6 py-3.5 text-[15px] font-semibold text-ink-900 transition-colors hover:bg-gold-soft"
              >
                Try the demo
                <ArrowRight size={17} className="transition-transform group-hover:translate-x-0.5" />
              </button>
              <a
                href="#how"
                className="text-[13px] font-medium text-paper-dim transition-colors hover:text-paper"
              >
                or see how it works ↑
              </a>
            </div>
            <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-paper-faint">
              No sign-up · runs on Gemma 4 + Gemini 3
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-paper/10 bg-ink-900/30">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-col gap-8 md:flex-row md:justify-between">
          <div className="max-w-xs">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-gold-dim/50 bg-gold/10">
                <img src="/Crux_Logo.png" alt="" className="h-full w-full scale-[1.6] object-contain" />
              </div>
              <span className="font-serif text-[17px] font-semibold text-paper">Crux</span>
            </div>
            <p className="mt-3 text-[12.5px] leading-relaxed text-paper-faint">
              Find the crux of why papers disagree — and the experiment that settles it.
            </p>
          </div>

          <div className="flex gap-14">
            <div>
              <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.18em] text-paper-faint">
                Product
              </div>
              <ul className="space-y-2 text-[13px]">
                <li><a href="#how" className="text-paper-dim transition-colors hover:text-paper">How it works</a></li>
                <li><a href="#compare" className="text-paper-dim transition-colors hover:text-paper">Compare</a></li>
                <li><Link href="/app" className="text-paper-dim transition-colors hover:text-paper">Open app</Link></li>
              </ul>
            </div>
            <div>
              <div className="mb-3 font-mono text-[9.5px] uppercase tracking-[0.18em] text-paper-faint">
                Resources
              </div>
              <ul className="space-y-2 text-[13px]">
                <li>
                  <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-paper-dim transition-colors hover:text-paper">
                    <Github size={13} /> GitHub
                  </a>
                </li>
                <li><a href="#how" className="text-paper-dim transition-colors hover:text-paper">Demo walkthrough</a></li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-paper/[0.06] pt-6 md:flex-row">
          <span className="text-[11px] text-paper-faint">
            Built for the Google DeepMind Bangalore Hackathon
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-paper-faint">
            On-device Gemma 4 · Gemini 3 · honest by design
          </span>
        </div>
      </div>
    </footer>
  );
}
