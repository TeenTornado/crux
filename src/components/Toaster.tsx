"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { subscribeToasts, dismissToast, type Toast } from "@/lib/toast";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

const META: Record<Toast["type"], { icon: React.ReactNode; color: string }> = {
  info: { icon: <Info size={14} />, color: "#C9A227" },
  error: { icon: <AlertTriangle size={14} />, color: "#C1440E" },
  success: { icon: <CheckCircle2 size={14} />, color: "#6B8F71" },
};

export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => subscribeToasts(setToasts), []);

  return (
    <div className="pointer-events-none fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 z-[200] flex w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 flex-col items-center gap-2">
      <AnimatePresence>
        {toasts.map((t) => {
          const m = META[t.type];
          return (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 12, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.2 }}
              className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-ink-500 bg-ink-800/98 py-2 pl-3 pr-2 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.7)] backdrop-blur"
            >
              <span style={{ color: m.color }}>{m.icon}</span>
              <span className="text-[12.5px] text-paper">{t.message}</span>
              <button
                onClick={() => dismissToast(t.id)}
                className="text-paper-faint transition-colors hover:text-paper"
              >
                <X size={13} />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
