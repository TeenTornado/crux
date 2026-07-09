# Crux — overnight session notes

State as of this session: **all four overnight tasks complete and verified end-to-end.**
`git status` is clean; each task is a separate commit.

## What got done

### T1 — Routing (closed out)
- `/app` = home/intro (session picker + composer); `/app/[id]` = per-session workspace.
- Direct URL load (`/app/[id]`) hydrates full state from IndexedDB (papers, claims,
  edges, reconciliations, experiments, chat).
- Invalid/unknown id → redirect to `/app` + **"Session not found"** toast.
- Expandable left sidebar (rail ⇄ drawer): chat list, **New chat**, **rename** (pencil
  or double-click) + **delete** on hover, search when >3 chats, Clear all data.
- `Cmd/Ctrl+B` toggles the left sidebar (see key-binding note below).
- Verified with 3 sessions: create → switch → reopen-by-URL all clean, no console errors.

### T2 — Right sidebar tabs (gaps closed)
- Was already mostly done (Context/Ask tabs, collapse-to-rail, persisted collapsed+tab,
  claim-reference pills). Added the missing piece: **counter tiles are clickable** and jump
  the graph to the highest-confidence edge of that verdict. Made the Context/Overview
  scroll so the "honest by design" note never clips on short screens.

### T3 — Persistence hardening
- Chat history persists per session; auto-save after extraction, each reconciliation,
  experiment, and chat turn; writes debounced 500ms.
- IndexedDB write failures now route through a quota-aware handler → throttled **toast**
  ("Storage is full…"), never crashes; the app keeps working in memory.
- **Settings dropdown** in the header (gear): keyboard-shortcut reference + **Clear all data**.
- Verified: send a chat → reload the session URL → chat restored (turn persisted in DB).

### T4 — Bug sweep + responsive
- Walked the full flow via headless Chrome: land → load demo → extract → reconcile →
  click contradiction → **diagnosis** → **generate experiment** → **Ask + streaming** →
  **claim pill → node highlight + claim detail**. All pass. **Zero console errors/warnings.**
- Responsive: 1440 and 1280 are clean. 1024 was cramped; fixed by narrowing the side
  panels in the `lg`→`xl` range (`288/1fr/320` at lg, `320/1fr/400` at xl) so the graph
  keeps usable width. Verified at 1024.

## Decisions / things to know

- **Key bindings:** `Cmd/Ctrl+B` is owned by the **left** sidebar (nav), matching the
  conventional "toggle sidebar." The two tasks both requested Cmd+B, but binding one key
  to both panels would toggle them together (jarring), so the **right** panel (Context/Ask)
  collapses via its ✕/rail button and `Cmd/Ctrl+.`. Both are listed in the header Settings
  → Shortcuts. Change in `AppSidebar.tsx` / `Workspace.tsx` if you prefer otherwise.

## Still rough / concerns (not blockers)

- **Chat latency is variable.** Gemini Flash usually answers in ~2–8s, but can spike to
  15–40s under load or when it fails over to a preview model. Streaming + a "Crux is
  thinking…" state cover it, but it's the least predictable part of a live demo.
- **Uploaded-PDF extraction is quota- and quality-limited** on the free-tier key: multi-
  paper bursts get throttled (only ~1–2 papers extract per burst) and the small model
  names metrics loosely, so uploads may not always form reconciliation edges. The **demo
  corpus is the reliable showcase**; **"Verify live · real Gemma 4 + Gemini"** runs the demo
  papers through real models to prove nothing is faked (slower, ~1–2 min). A paid/higher-
  quota key would make multi-paper uploads reliable with no code change.
- **Numeric extraction is intentionally low-confidence** (44–69 F1 per SciLead/AxCell) —
  values are labeled "reported, verify against source." This is a feature, not a bug.
- **Desktop-first.** ≥1024px works. Below 1024 the side panels hide (graph-only). No
  dedicated mobile layout — out of scope for the demo.
- **Judge Mode** repeatedly `reset()`s the current session on each loop (keeps the same
  session id). If a judge is mid-interaction, toggling Judge Mode will wipe the working
  view; it's meant for an unattended booth loop.
- I did not touch the off-limits modules (extraction/reconciliation/experiment routes,
  `gemini.ts`, `gemma.ts`) except that `gemini.ts` already had `generateStream` added in a
  prior session for chat streaming; no changes this session.

## How to run

```
npm run dev        # http://localhost:3000  → landing;  /app → the tool
```
`GEMINI_API_KEY` is in `.env.local` (gitignored). Without a key the demo still works
(pre-baked); with a key, uploads + "Verify live" call real Gemma 4 + Gemini.
