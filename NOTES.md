# Crux — overnight session notes

## Session: Fri 10 Jul (overnight) — Track 1 gap-closing + UI (Builds 1–4)

All four builds shipped, each a separate commit (author: Sreeram Kumar V R), pushed to `origin/main`. Working tree clean. **Boot with `npm run dev`** (dev server stopped so your own start doesn't hit a busy port).

### What shipped

| Build | Commit | Smoke result |
|---|---|---|
| 1 — `RECONCILE_BACKEND=local` + engine badge on verdicts | `86fc3a8` | `eval/localmode-check.ts`: adjudication fully on-device (`gemma:gemma4:e4b`), **zero non-localhost fetches** under a fetch guard simulating dead WiFi; hard-guard path unaffected |
| 2 — experiment generation via local Gemma | `b4b5eb6` | `eval/localexp-check.ts`: actual route handler, POPPER plan on-device in **22.3s** (H0/H1/manipulation/discriminating metric all present), zero cloud fetches; timeout/malformed falls to the honest `template` label |
| 3 — local retry with expanded boundary | `974574f` | `eval/retry-check.ts`: starved chunk fires exactly one local retry, streams `Retrying chunk 1/1 (Results)…` then the honest `deferred` status, zero hallucinated claims, fully local. **Real bug found & fixed**: `++done` sat inside `onProgress?.()`, whose args are skipped when no callback is passed — chunk numbering could stall |
| 4 — header cleanup, collapsible left sidebar, mobile | `5a7271b` | tsc clean; dev compiles + serves; headless-Chrome shots at 1440/1024/423 of `/app` |

Env added to `.env.local` (active — dev server was restarted and re-verified):

```
EXTRACT_MAX_CHUNKS=3
OLLAMA_CHUNK_TIMEOUT_MS=60000
RECONCILE_BACKEND=local
```

### Dress rehearsal — PASSED (one honest caveat)

Against the freshly restarted dev server with the env above:

1. `POST /api/warmup` → `{ready:true, warm:true, gemma4:e4b, 9521MB}` — full extraction-context footprint resident, never-evict.
2. `POST /api/reconcile` (Kaplan a=0.73 vs Chinchilla a=0.50) → **`engine: gemma:gemma4:e4b`**, 19.2s, verdict `CONTEXT_CONDITIONED_DIVERGENCE` (e4b credits the LR-schedule condition — defensible; Gemini previously said genuine. Model's call, honestly labeled).
3. `POST /api/experiment` → **`engine: gemma:gemma4:e4b`**, 22.0s, full POPPER plan ("Impact of LR Scheduling Strategy on Parameter Scaling Exponent (a)").

**Caveat:** I did not physically toggle WiFi — cutting the network would sever my own session mid-run. Equivalent proof: all three paths run under a fetch guard that **throws on any non-127.0.0.1 host** (zero blocked fetches), plus the live-route rehearsal above. **Your 30-second morning check: WiFi off → open the Kaplan/Chinchilla session → Re-run reconciliation → expect the on-device badges.** New-PDF ingestion offline falls back to raw PDF parse (resolve-first needs network) — pre-run the demo once online, as planned.

### Build 4 details (hard rules respected)

- **4A** Three tier badges → one `Stack · Gemma 4 + Gemini` pill (click-popover with all three roles). New chat / Judge Mode / Reset moved into the ⋯ overflow menu (pulses gold while Judge Mode is live; the in-workspace gold banner still shows). ⌘[ added to the shortcuts list.
- **4B** Sources panel collapses to a 44px rail (◀ in its header; ▶ + vertical label in the rail), same grid transition as the right panel, **⌘[** toggle, persisted in localStorage prefs.
- **4C** Status row compacted: `3 papers · 7 claims` + one combined `Gemma 4 · warm ✓ · 0.3s` pill (Demo label dropped — the header subtitle carries it).
- **4D** <1024px: graph full-width; sources/context open as overlay drawers (86vw ≤360px) over a tap-to-close scrim via two 44×44 floating buttons; Stack pill hidden <640px.
- Untouched per hard rules: Agent State panel content, Evidence overview / Honest-by-design copy, graph node styling, demo data, extraction/reconciliation logic.

### Not finished / for your morning pass

1. **4E full visual check in a real browser.** Headless Chrome has no IndexedDB session, so only `/app` (intro) could be screenshotted at 1440/1024/423 — all render, new header elements don't overflow. The **workspace** at the three widths needs your browser (~2 min): header, both collapses, drawers, graph readability, then Kaplan/Chinchilla load + reconcile.
2. **Intro-screen composer overflows at 423px** (hypothesis text + Upload PDFs chip clip right). Pre-existing; hard rules said don't touch the intro screen. ~10-min fix if wanted.
3. e4b calls Kaplan-vs-Chinchilla a **divergence** (LR schedule explains the gap) where Gemini said genuine. If the demo needs the word "contradiction" on that edge: unset `RECONCILE_BACKEND` for Gemini reconcile, or present the divergence verdict honestly — arguably the better science.
4. ESLint isn't configured (interactive setup prompt) — tsc is the gate; all green.

### Session end state

- `git status` clean · `main` = `origin/main` @ `5a7271b`
- All eval checks green: localmode, localexp, retry, scaling-e2e, scaling-check, mine, fix1, fix3, keepalive, phase5, clean-unit
- Dev server stopped (boot: `npm run dev`) · model warm, `keep_alive:-1`

---

## Session: earlier overnight (T1–T4 routing/sidebar/persistence/bug-sweep)

State as of that session: **all four overnight tasks complete and verified end-to-end.**
`git status` clean; each task a separate commit.

### What got done

#### T1 — Routing (closed out)
- `/app` = home/intro (session picker + composer); `/app/[id]` = per-session workspace.
- Direct URL load (`/app/[id]`) hydrates full state from IndexedDB (papers, claims,
  edges, reconciliations, experiments, chat).
- Invalid/unknown id → redirect to `/app` + **"Session not found"** toast.
- Expandable left sidebar (rail ⇄ drawer): chat list, **New chat**, **rename** (pencil
  or double-click) + **delete** on hover, search when >3 chats, Clear all data.
- `Cmd/Ctrl+B` toggles the left sidebar (see key-binding note below).
- Verified with 3 sessions: create → switch → reopen-by-URL all clean, no console errors.

#### T2 — Right sidebar tabs (gaps closed)
- Was already mostly done (Context/Ask tabs, collapse-to-rail, persisted collapsed+tab,
  claim-reference pills). Added the missing piece: **counter tiles are clickable** and jump
  the graph to the highest-confidence edge of that verdict. Made the Context/Overview
  scroll so the "honest by design" note never clips on short screens.

#### T3 — Persistence hardening
- Chat history persists per session; auto-save after extraction, each reconciliation,
  experiment, and chat turn; writes debounced 500ms.
- IndexedDB write failures now route through a quota-aware handler → throttled **toast**
  ("Storage is full…"), never crashes; the app keeps working in memory.
- **Settings dropdown** in the header (gear): keyboard-shortcut reference + **Clear all data**.
- Verified: send a chat → reload the session URL → chat restored (turn persisted in DB).

#### T4 — Bug sweep + responsive
- Walked the full flow via headless Chrome: land → load demo → extract → reconcile →
  click contradiction → **diagnosis** → **generate experiment** → **Ask + streaming** →
  **claim pill → node highlight + claim detail**. All pass. **Zero console errors/warnings.**
- Responsive: 1440 and 1280 are clean. 1024 was cramped; fixed by narrowing the side
  panels in the `lg`→`xl` range (`288/1fr/320` at lg, `320/1fr/400` at xl) so the graph
  keeps usable width. Verified at 1024.

### Decisions / things to know

- **Key bindings:** `Cmd/Ctrl+B` is owned by the **left** sidebar (nav), matching the
  conventional "toggle sidebar." The two tasks both requested Cmd+B, but binding one key
  to both panels would toggle them together (jarring), so the **right** panel (Context/Ask)
  collapses via its ✕/rail button and `Cmd/Ctrl+.`. Both are listed in the header menu
  → Shortcuts. (`⌘[` now toggles the workspace **sources** panel.) Change in
  `AppSidebar.tsx` / `Workspace.tsx` if you prefer otherwise.

### Still rough / concerns (not blockers)

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
- **Judge Mode** repeatedly `reset()`s the current session on each loop (keeps the same
  session id). If a judge is mid-interaction, toggling Judge Mode will wipe the working
  view; it's meant for an unattended booth loop.

### How to run

```
npm run dev        # http://localhost:3000  → landing;  /app → the tool
```
`GEMINI_API_KEY` is in `.env.local` (gitignored). Without a key the demo still works
(pre-baked); with a key, uploads + "Verify live" call real Gemma 4 + Gemini.
