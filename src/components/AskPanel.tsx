"use client";

import { useStore } from "@/lib/store";
import { Conversation } from "./Conversation";
import { Maximize2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export function AskPanel() {
  const papers = useStore((s) => s.papers);
  const claims = useStore((s) => s.claims);
  const sessionName = useStore((s) => s.sessionName);
  const setExpanded = useStore((s) => s.setChatExpanded);

  return (
    <div className="flex h-full flex-col">
      {/* Session context strip */}
      <div className="flex items-center justify-between border-b border-paper/10 px-4 py-2.5">
        <div className="min-w-0">
          <div className="truncate font-mono text-[10px] uppercase tracking-wide text-paper-faint">
            Chatting about
          </div>
          <div className="flex items-center gap-2">
            <span className="truncate font-serif text-[13px] text-paper">
              {sessionName}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-paper-faint">
              · {papers.length} papers · {claims.length} claims
            </span>
          </div>
        </div>
        <button
          onClick={() => setExpanded(true)}
          className="ml-2 shrink-0 text-paper-faint transition-colors hover:text-paper"
          title="Expand conversation"
        >
          <Maximize2 size={14} />
        </button>
      </div>

      <div className="min-h-0 flex-1">
        <Conversation variant="panel" />
      </div>
    </div>
  );
}

/** Full-screen centered conversation (Claude-style focus view). */
export function ConversationOverlay() {
  const expanded = useStore((s) => s.chatExpanded);
  const setExpanded = useStore((s) => s.setChatExpanded);
  const sessionName = useStore((s) => s.sessionName);
  const papers = useStore((s) => s.papers);
  const claims = useStore((s) => s.claims);

  return (
    <AnimatePresence>
      {expanded && (
        <motion.div
          className="fixed inset-0 z-[70] flex flex-col bg-ink"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="flex items-center justify-between border-b border-paper/10 px-5 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-gold-dim/50 bg-gold/10">
                <img src="/Crux_Logo.png" alt="" className="h-full w-full scale-[1.6] object-contain" />
              </div>
              <div>
                <div className="font-serif text-[14px] text-paper">{sessionName}</div>
                <div className="font-mono text-[10px] text-paper-faint">
                  {papers.length} papers · {claims.length} claims · conversation
                </div>
              </div>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-ink-500 px-2.5 py-1.5 text-[12px] text-paper-dim transition-colors hover:border-paper-faint/60 hover:text-paper sm:min-h-0"
            >
              <X size={14} /> Close
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <Conversation variant="full" />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
