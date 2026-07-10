"use client";

// Lightweight UI prefs in localStorage (sidebar state, active tab).
// Deliberately separate from the IndexedDB data layer.

export interface Prefs {
  sidebarCollapsed: boolean;
  /** Workspace sources (left) panel collapsed to a rail. */
  leftCollapsed: boolean;
  activeTab: "context" | "ask";
  navOpen: boolean;
}

const KEY = "crux:prefs";

const DEFAULTS: Prefs = {
  sidebarCollapsed: false,
  leftCollapsed: false,
  activeTab: "context",
  navOpen: false,
};

export function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

export function savePrefs(patch: Partial<Prefs>) {
  if (typeof window === "undefined") return;
  try {
    const next = { ...loadPrefs(), ...patch };
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore quota / disabled storage */
  }
}
