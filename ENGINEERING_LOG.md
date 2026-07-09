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

\* Span/value grounding read 100% only because so few claims survive (2, 1, 0 across the three papers) — the sample is too small to be meaningful. The real baseline failures are **near-zero yield (1.0/paper)**, **DenseNet extracted 0 claims (hosted-Gemma quota starvation)**, and **gold recall 37.5%**. Grounding becomes the load-bearing metric once Phase 2 raises yield.

## Observations from the baseline

- **Ingestion**: pdf.js text garbles tables, so headline numeric results (e.g. ResNet 3.57% is in the abstract and was caught, but table-only numbers are lost). Confirms resolve-first (Phase 1) is the biggest lever.
- **Extraction**: one-shot hosted Gemma yields ~1 claim/paper and one paper starved to empty. Phase 2 (Gemma-local-first cascade + decomposition + span gate) targets yield and quota-resilience without letting hallucination rise.
- **Gold recall 37.5%**: the missed gold claims are table/body numbers absent from the parsed text — expected to rise with structured sources (Phase 1) and decomposition (Phase 2).

## Phase log

- **Phase 0** — audit (`docs/AUDIT.md`), eval harness (`/eval`), baseline recorded. No pipeline code changed yet.
