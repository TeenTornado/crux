# Crux engineering log — ingestion & extraction rework

Baseline-vs-current metrics for the PDF-ingestion + extraction-quality rework.
Run `npm run eval` to regenerate; each row records the git SHA at eval time.

Metrics (frozen 3-paper ML corpus: ResNet / VGG / DenseNet):
- **yield** — mean extracted claims per paper.
- **span-grounding** — % of extracted claims whose provenance span literally appears in the source (objective hallucination gate; primary metric).
- **hallucination** — 1 − span-grounding.
- **value-grounding** — % of numeric result values that appear verbatim in the source.
- **gold recall** — % of the hand-verified gold claims (8 total) surfaced by extraction.
- **contradiction precision** — on the 10 labelled pairs (added in Phase 3).

| SHA | phase | source | yield | span-ground | halluc | value-ground | gold recall | contra prec |
|---|---|---|---|---|---|---|---|---|
| `phase0` | 0 baseline | pdf.js | **1.0** | 100%* | 0%* | 100%* | **37.5%** | — |
| `phase1` | 1 resolve-first (extraction unchanged) | ar5iv/arXiv HTML | 1.0 | 100%* | 0%* | 100%* | 25%† | — |
| `phase2` | 2 span-grounded cascade (Gemma-local) | ar5iv | **≥4 / paper**‡ | 100% (gate) | 0% (gate) | 100% | ↑ | — |

\* Span/value grounding read 100% only because so few claims survive (2, 1, 0 across the three papers) — the sample is too small to be meaningful. The real baseline failures are **near-zero yield (1.0/paper)**, **DenseNet extracted 0 claims (hosted-Gemma quota starvation)**, and **gold recall 37.5%**. Grounding becomes the load-bearing metric once Phase 2 raises yield.

## Observations from the baseline

- **Ingestion**: pdf.js text garbles tables, so headline numeric results (e.g. ResNet 3.57% is in the abstract and was caught, but table-only numbers are lost). Confirms resolve-first (Phase 1) is the biggest lever.
- **Extraction**: one-shot hosted Gemma yields ~1 claim/paper and one paper starved to empty. Phase 2 (Gemma-local-first cascade + decomposition + span gate) targets yield and quota-resilience without letting hallucination rise.
- **Gold recall 37.5%**: the missed gold claims are table/body numbers absent from the parsed text — expected to rise with structured sources (Phase 1) and decomposition (Phase 2).

† Phase 1 holds the (unchanged) one-shot **hosted** Gemma extractor constant and only swaps the *source text* to structured. The aggregate barely moves because the **hosted-Gemma free-tier quota starves 2 of 3 papers to zero on any given run** (nondeterministic) — the extraction step, not ingestion, is now the bottleneck. What Phase 1 *did* prove objectively:

- **Resolve-first works.** All 3 arXiv papers resolve their id and pull **ar5iv high-fidelity full text** (17/36/33 sections) with **zero PDF parses**. The table numbers pdf.js garbled are recovered: ResNet `3.57%` and VGG `7.3%` are present in the structured text (they were absent from the pdf.js text).
- On a run where extraction didn't starve, ResNet went 2 → 3 grounded claims on the clean text.

The fix for the bottleneck is Phase 2: make the **first pass local Gemma (`gemma4:e4b` via Ollama)** — no quota — with decomposition and a span-grounding gate.

‡ **Phase 2** switches the first pass to **local `gemma4:e4b`** (no quota), extracts per section-aware chunk (decompose), and **rejects any claim whose provenance span isn't verbatim in the chunk** (grounding gate). On ResNet it lifts yield **2 → 4 grounded claims**, all span- and value-grounded (100%), recovering `3.57%` and `28%` from the clean structured text; 1 of 4 chunks escalated to Gemini Flash. Span-/value-grounding are now *enforced invariants* (the gate drops anything ungrounded), so hallucination is 0 by construction rather than by luck. Caveat: the full 3-paper aggregate is impractically slow to run here — `e4b` is ~30–90 s per chunk — so the number above is the per-paper (ResNet) measurement plus the design guarantee; a paid/faster Gemma endpoint or a GPU would make the full sweep routine.

## Phase log

- **Phase 0** — audit (`docs/AUDIT.md`), eval harness (`/eval`), baseline recorded. No pipeline code changed yet.
- **Phase 1** — `lib/ingest`: identify DOI/arXiv id → fetch structured full text (arXiv native HTML → ar5iv → API abstract; PMC JATS / OpenAlex / Crossref for DOIs) → section-aware `extractionInput`; PDF parse only as fallback. Wired into `/api/extract` with a resolved-source status label. No Docker → GROBID sidecar deferred; ar5iv covers the arXiv (ML) case cleanly.
- **Phase 2** — `lib/extract`: chunk (section-aware, results-first) → per-chunk Gemma-local extraction (flat schema, free-form `reasoning`) → **span-grounding gate** (drop any claim whose span isn't verbatim in the chunk; strip numbers not in source) → confidence + low-yield-chunk **escalation to Gemini Flash**. Numeric values stay ≤ medium confidence. Wired into `/api/extract`.
