"use client";

// Tiny pub/sub toast system — no dependency, no context provider gymnastics.

export type ToastType = "info" | "error" | "success";
export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

type Listener = (toasts: Toast[]) => void;

let toasts: Toast[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l(toasts);
}

export function subscribeToasts(fn: Listener): () => void {
  listeners.add(fn);
  fn(toasts);
  return () => listeners.delete(fn);
}

export function toast(message: string, type: ToastType = "info", ttl = 3200) {
  const id =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `t-${Date.now()}-${Math.random()}`;
  toasts = [...toasts, { id, message, type }];
  emit();
  setTimeout(() => dismissToast(id), ttl);
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}
