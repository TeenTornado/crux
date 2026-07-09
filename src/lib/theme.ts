import type { Verdict, Confidence } from "./types";

export const VERDICT_META: Record<
  Verdict,
  { label: string; short: string; color: string; soft: string; bg: string; ring: string }
> = {
  GENUINE_CONTRADICTION: {
    label: "Genuine contradiction",
    short: "Contradiction",
    color: "#C1440E",
    soft: "#D9622C",
    bg: "rgba(193,68,14,0.12)",
    ring: "rgba(193,68,14,0.45)",
  },
  CONTEXT_CONDITIONED_DIVERGENCE: {
    label: "Context-conditioned divergence",
    short: "Divergence",
    color: "#C9A227",
    soft: "#E0BE4A",
    bg: "rgba(201,162,39,0.12)",
    ring: "rgba(201,162,39,0.45)",
  },
  AGREEMENT: {
    label: "Agreement",
    short: "Agreement",
    color: "#6B8F71",
    soft: "#87AB8D",
    bg: "rgba(107,143,113,0.12)",
    ring: "rgba(107,143,113,0.45)",
  },
};

export const CONFIDENCE_META: Record<Confidence, { label: string; color: string }> = {
  high: { label: "High", color: "#6B8F71" },
  medium: { label: "Medium", color: "#C9A227" },
  low: { label: "Low", color: "#C1440E" },
};

export function paperTint(handle: string): string {
  const map: Record<string, string> = {
    A: "#C9A227",
    B: "#6B8F71",
    C: "#8FA6C1",
    D: "#C08FB5",
    E: "#C1440E",
  };
  return map[handle] || "#C7BFAE";
}
