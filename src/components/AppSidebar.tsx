"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  listSessions,
  deleteSession,
  renameSession,
  clearAll,
  type Session,
} from "@/lib/db";
import { loadPrefs, savePrefs } from "@/lib/prefs";
import { useStore } from "@/lib/store";
import {
  PanelLeft,
  Plus,
  MessageSquare,
  Cpu,
  Trash2,
  Pencil,
  Search,
  PanelLeftClose,
} from "lucide-react";

export function AppSidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const currentId =
    pathname && pathname.startsWith("/app/") ? pathname.split("/")[2] : null;
  // Re-list whenever the session's persisted state likely changed.
  const chatLen = useStore((s) => s.chat.length);
  const phase = useStore((s) => s.phase);
  const sessionName = useStore((s) => s.sessionName);
  const [open, setOpen] = useState(false);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [q, setQ] = useState("");

  const refresh = useCallback(() => {
    listSessions().then(setSessions).catch(() => {});
  }, []);

  useEffect(() => {
    setOpen(loadPrefs().navOpen);
  }, []);
  // Refresh on route change, phase transitions (extract/reconcile persisted),
  // chat turns, renames, and whenever the drawer is opened.
  useEffect(() => {
    refresh();
  }, [pathname, chatLen, phase, sessionName, open, refresh]);

  // ⌘B / Ctrl+B toggles the left nav (see NOTES.md for the key-binding rationale).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setOpen((v) => {
          savePrefs({ navOpen: !v });
          return !v;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const toggle = () =>
    setOpen((v) => {
      savePrefs({ navOpen: !v });
      return !v;
    });

  const goNew = () => {
    router.push("/app");
    setOpen(false);
  };
  const openChat = (id: string) => {
    router.push(`/app/${id}`);
    setOpen(false);
  };

  const filtered = q
    ? sessions.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()))
    : sessions;

  return (
    <div className="relative z-40 h-full shrink-0">
      {/* Rail */}
      <div className="flex h-full w-[58px] flex-col items-center border-r border-paper/10 py-3">
        <Link
          href="/"
          className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg border border-gold-dim/50 bg-gold/10 transition-colors hover:bg-gold/20"
          title="Crux home"
        >
          <span className="font-serif text-[15px] font-semibold text-gold-soft">C</span>
        </Link>
        <RailBtn icon={<PanelLeft size={17} />} onClick={toggle} active={open} title="Toggle sidebar (⌘B)" />
        <RailBtn icon={<Plus size={18} />} onClick={goNew} title="New chat" />
        <RailBtn icon={<MessageSquare size={16} />} onClick={toggle} title="Chats" />
        <div className="flex-1" />
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full border border-ink-500 bg-ink-800 text-paper-faint"
          title="Local-only · nothing leaves this device"
        >
          <Cpu size={14} />
        </div>
      </div>

      {/* Expandable drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-y-0 left-[58px] right-0 z-30 bg-ink-900/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={toggle}
            />
            <motion.aside
              className="absolute left-[58px] top-0 z-40 flex h-full w-[272px] flex-col border-r border-paper/10 bg-ink-800 shadow-[24px_0_60px_-30px_rgba(0,0,0,0.7)]"
              initial={{ x: -18, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -18, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <div className="flex items-center justify-between px-3 py-3">
                <span className="font-serif text-[16px] font-semibold text-paper">Crux</span>
                <button
                  onClick={toggle}
                  className="text-paper-faint transition-colors hover:text-paper"
                  title="Collapse (⌘\)"
                >
                  <PanelLeftClose size={16} />
                </button>
              </div>

              <div className="px-3">
                <button
                  onClick={goNew}
                  className="flex w-full items-center gap-2 rounded-lg border border-ink-500 bg-ink-900/50 px-3 py-2 text-[13px] font-medium text-paper transition-colors hover:border-gold-dim/50"
                >
                  <Plus size={15} className="text-gold-soft" /> New chat
                </button>
              </div>

              {sessions.length > 3 && (
                <div className="px-3 pt-2">
                  <div className="flex items-center gap-2 rounded-lg border border-ink-600 bg-ink-900/50 px-2.5 py-1.5 focus-within:border-gold-dim/60">
                    <Search size={13} className="text-paper-faint" />
                    <input
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      placeholder="Search chats"
                      className="flex-1 bg-transparent text-[12px] text-paper placeholder:text-paper-faint focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                <div className="px-1 pb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-paper-faint">
                  Recents
                </div>
                {filtered.length === 0 && (
                  <div className="px-2 py-6 text-center text-[12px] text-paper-faint">
                    {sessions.length === 0 ? "No chats yet." : "No matches."}
                  </div>
                )}
                {filtered.map((s) => (
                  <ChatRow
                    key={s.id}
                    session={s}
                    active={s.id === currentId}
                    onOpen={() => openChat(s.id)}
                    onRenamed={(name) =>
                      setSessions((prev) =>
                        prev.map((x) => (x.id === s.id ? { ...x, name } : x))
                      )
                    }
                    onDelete={async () => {
                      await deleteSession(s.id);
                      setSessions((prev) => prev.filter((x) => x.id !== s.id));
                      if (s.id === currentId) router.push("/app");
                    }}
                  />
                ))}
              </div>

              {sessions.length > 0 && (
                <div className="border-t border-paper/10 px-3 py-2">
                  <button
                    onClick={async () => {
                      await clearAll();
                      setSessions([]);
                      router.push("/app");
                    }}
                    className="flex items-center gap-1.5 font-mono text-[10px] text-paper-faint transition-colors hover:text-rust-soft"
                  >
                    <Trash2 size={11} /> Clear all data
                  </button>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function RailBtn({
  icon,
  onClick,
  active,
  title,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`my-0.5 flex h-11 w-11 lg:h-9 lg:w-9 items-center justify-center rounded-lg transition-colors ${
        active ? "bg-ink-700 text-paper" : "text-paper-faint hover:bg-ink-800 hover:text-paper"
      }`}
    >
      {icon}
    </button>
  );
}

function ChatRow({
  session,
  active,
  onOpen,
  onRenamed,
  onDelete,
}: {
  session: Session;
  active: boolean;
  onOpen: () => void;
  onRenamed: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(session.name);
  const contradictions = session.edges.filter(
    (e) => e.reconciliation?.verdict === "GENUINE_CONTRADICTION"
  ).length;

  const commit = async () => {
    const n = name.trim() || session.name;
    await renameSession(session.id, n);
    onRenamed(n);
    setEditing(false);
  };

  return (
    <div
      className={`group relative mb-0.5 rounded-lg transition-colors ${
        active ? "bg-ink-700" : "hover:bg-ink-800"
      }`}
    >
      {editing ? (
        <div className="px-2.5 py-2">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") setEditing(false);
            }}
            onBlur={commit}
            className="w-full rounded border border-ink-500 bg-ink-900 px-1.5 py-0.5 text-[12px] text-paper focus:outline-none"
          />
        </div>
      ) : (
        <button onClick={onOpen} onDoubleClick={() => setEditing(true)} className="block w-full px-2.5 py-2 text-left">
          <div className="flex items-center gap-2">
            {contradictions > 0 && (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rust" />
            )}
            <span className="truncate pr-10 text-[12.5px] text-paper-dim group-hover:text-paper">
              {session.name}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[9.5px] text-paper-faint">
            {relativeTime(session.updated_at)} · {session.papers.length} papers
          </div>
        </button>
      )}
      {!editing && (
        <div className="absolute right-1.5 top-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setName(session.name);
              setEditing(true);
            }}
            className="rounded p-1 text-paper-faint hover:text-paper"
            title="Rename chat"
          >
            <Pencil size={12} />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="rounded p-1 text-paper-faint hover:text-rust-soft"
            title="Delete chat"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );
}

function relativeTime(ts: number): string {
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
