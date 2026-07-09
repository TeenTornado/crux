# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Crux is an "Evidence-to-Experiment Assistant": it ingests papers, extracts structured claims into a visual evidence graph, diagnoses *why* two papers disagree (genuine contradiction vs. context-conditioned divergence), and generates POPPER-style experiments to resolve them. Next.js 15 + TypeScript, editorial dark UI. Built for the Google DeepMind Bangalore Hackathon.

## Commands

```bash
npm run dev            # dev server on :3000 — loads .env.local automatically
npm run build          # production build (see gotcha below)
npm run lint           # next lint
npm run eval           # extraction eval (baseline) — writes eval/results/<label>.json
npm run eval:contra    # contradiction-precision eval on eval/gold/contradictions.jsonl
npm run eval:fixtures  # regenerate frozen parsed-text fixtures from sample-papers/
```

There is **no unit-test framework** (no jest/vitest). Verification is the `/eval` harness (tsx scripts) plus headless-Chrome UI checks. Eval variants via env:

```bash
EVAL_SOURCE=structured EVAL_EXTRACTOR=v2 EVAL_MAXCHUNKS=4 npm run eval phase2
# EVAL_SOURCE=pdf|structured  EVAL_EXTRACTOR=v1(one-shot)|v2(span-grounded cascade)
```

**Gotcha — never run `next build` while `npm run dev` is running.** It clobbers the dev server's `.next` cache and silently breaks CSS/chunks. Always stop dev first (`pkill -f "next dev"`), build, then restart dev with a fresh `rm -rf .next`.

## Model tiering (the core identity — preserve it)

Three tiers, all routed through `src/lib/gemini.ts` (a REST client with per-call **model-fallback chains** and SSE streaming, not an SDK). `MODELS` there defines the chains; all are env-overridable in `.env.local`.

- **Gemma 4 → extraction (the on-device story).** Local `gemma4:e4b` via Ollama is the *first pass*; hosted `gemma-4-31b-it` and Gemini Flash are fallbacks. Gemma-local is auto-detected by probing `localhost:11434` in `src/lib/extract` and `src/lib/contra` — independent of the `OLLAMA_HOST` env var.
- **Gemini 3 Flash → reconciliation + experiment** (`gemini-3-flash-preview`, the "thinking"/orchestration tier).
- **Gemini Flash → grounded chat** (`gemini-flash-latest`).

Without a key the app still runs fully in **demo mode**. The free-tier key throttles bursts (returns empty 200s) — this shaped several design choices (per-paper spacing, empty-response fallback, Gemma-local-first extraction).

## The pipeline (evidence-to-experiment loop)

Understanding these five stages requires reading across `src/lib` — they are the product:

1. **Ingest** (`src/lib/ingest/`) — **resolve-first**: identify a DOI/arXiv id (`identify.ts`) and pull clean *structured full text* (`sources.ts`: arXiv HTML → ar5iv → API abstract; PMC JATS / OpenAlex / Crossref for DOIs). Only parse the PDF (`src/lib/pdf.ts`, unpdf) as a fallback. `ingest()` returns a `StructuredDoc`; `extractionInput()` builds the results-first text slice. This exists because pdf.js-class parsing garbles tables and reading order.
2. **Extract** (`src/lib/extract/`) — decomposed, **span-grounded** cascade. Section-aware chunks (priority: Abstract/Results/Discussion by default, `sections:"all"` to include Methods) → per-chunk Gemma extraction (flat schema, free-form `reasoning`) **plus a deterministic pattern result-miner (`mine.ts`)** that catches headline numbers the small local model misses ("N% top-5 error" in own-result sentences only; competitor/comparison sentences are refused, so it can't leak third-party numbers) → **grounding gate (`ground.ts`)**: every claim's `provenance_span` must be verbatim in the chunk or it is dropped, numbers absent from the source are stripped. Empty chunks escalate to Gemini Flash; timed-out chunks degrade to hosted. `reconcileOwnership` re-asserts own results the model over-flagged as third-party; a SHA-256 content-hash cache makes re-runs idempotent. Produces the app's `Claim[]`.
3. **Graph** (`src/lib/graph.ts`) — group cross-paper claims by *canonicalized* `(task, dataset, metric)` (`canonDataset`/`canonMetric` fold naming variants) into candidate edges.
4. **Reconcile** (`src/lib/contra/` + `/api/reconcile`) — **precision-first**. Deterministic `hardGuard` (different metric/dataset can never be a contradiction, no model call) → strict Likert adjudicator whose rubric asks whether a differing condition actually *explains* the gap → low-confidence-number guard. Verdict ∈ `GENUINE_CONTRADICTION | CONTEXT_CONDITIONED_DIVERGENCE | AGREEMENT`.
5. **Experiment** (`/api/experiment`) — POPPER-style plan (H₀/H₁, held-fixed variables, ablation, decision rule) for genuine contradictions only.

API routes (`src/app/api/{extract,reconcile,experiment,chat}`) are all `runtime = "nodejs"`. `extract` streams NDJSON claim-by-claim; `chat` streams SSE tokens.

## Honesty invariants (do not violate — they are the pitch)

- **Numeric result values are low-confidence by design** (SciLead/AxCell: 44–69 F1). They are labeled "reported, verify against source"; a low-confidence number must **never trigger a contradiction on its own**.
- **Span grounding is non-negotiable**: an extracted claim with no verbatim provenance span is a hallucination and gets dropped.
- **Reconciliation is precision-tuned**: a false contradiction is far costlier than a miss. Keep `eval:contra` precision ≥ 0.80 with zero false positives on the "apparent-not-real" pairs.

## Frontend architecture

- **State**: a single Zustand store (`src/lib/store.ts`) is the source of truth. `src/lib/actions.ts` orchestrates the pipeline against it (`runExtraction`, `runReconciliation`, `runExperiment`, `sendChat`, `runJudgeMode`, `runLiveDemo`) — components stay thin.
- **Routing**: `/` = marketing landing; `/app` = home/intro (composer + session picker); `/app/[id]` = per-session workspace hydrated from IndexedDB. A shared `src/app/app/layout.tsx` renders the collapsible `AppSidebar` (chat list) + `Toaster`. Invalid `/app/[id]` → redirect to `/app` with a toast.
- **Persistence**: IndexedDB via `idb` (`src/lib/db.ts` + `persistence.ts`) — sessions/chats/workflows/experiments, **debounced 500ms**; localStorage (`prefs.ts`) for UI prefs only. Quota errors surface a toast (`src/lib/toast.ts`), never crash. No auth, no server DB.
- **Three-panel workspace** (`Workspace.tsx`): sources (left) · React Flow evidence graph (`EvidenceGraph.tsx`, verdict-colored edges) · right sidebar with **Context** (`DetailPanel`) and **Ask** (`Conversation`, streamed markdown) tabs.

## The demo is curated and client-side — critical distinction

`src/lib/demoData.ts` holds three pre-baked SparseViT/ImageNet papers with one genuine contradiction and two divergences. **"Load demo corpus" does NOT hit the live extraction/reconcile pipeline** — it streams the curated claims and uses pre-baked reconciliations/experiments client-side (instant, deterministic) so judging never depends on API latency. **"Verify live" (and real uploads) run the actual pipeline.** When changing extraction/reconciliation, the demo path is unaffected; test uploads/`Verify live` to exercise real code. **Judge Mode** auto-plays the curated flow on a ~90s loop and repeatedly `reset()`s the current session.

## Design language

Editorial dark palette (Tailwind tokens in `tailwind.config.ts`): ink `#14181C`, paper `#EDE6D6`, rust `#C1440E` (contradiction), sage `#6B8F71` (agreement), gold `#C9A227` (divergence/accent). Serif for display, Inter for body, JetBrains Mono for structured data. Motion is purposeful (edges resolve, claims stream). Don't restyle or add generic-SaaS chrome.

## Eval + engineering discipline

`/eval` is a tsx harness (excluded from the Next build via `tsconfig.json`) with a frozen `corpus/`, hand-verified `gold/`, and deterministic `metrics.ts` (**span-grounding rate is the primary, gold-free metric**). Work on ingestion/extraction quality should measure a baseline first and log baseline-vs-current in `ENGINEERING_LOG.md` (see it and `docs/AUDIT.md` for the current state and deferred items: GROBID sidecar needs Docker; QLoRA fine-tune is opt-in).
