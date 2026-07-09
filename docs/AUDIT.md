# Crux pipeline audit (Phase 0.1)

Snapshot of the ingestion / extraction / contradiction paths **before** the
resolve-first + span-grounding rework, with every failure mode found by reading.

## File map

| Stage | Files | Notes |
|---|---|---|
| Upload / route | `src/app/api/extract/route.ts` | multipart PDFs or demo flags; streams NDJSON claims |
| PDF parse | `src/lib/pdf.ts` | `unpdf` (pdf.js/pdfjs-dist under the hood), per-page text, `guessTitle`, `priorityText`, `findPageForSpan` |
| Extraction | `src/lib/extractor.ts`, `src/lib/prompts.ts` | one-shot claim extraction; hosted Gemma (`gemma-4-31b-it`) or local Gemma via Ollama |
| Model calls | `src/lib/gemini.ts` | REST client, model-fallback chains, SSE streaming (`generateStream`) |
| Graph / edges | `src/lib/graph.ts` | groups claims by canonicalized `(task,dataset,metric)` into candidate edges |
| Contradiction | `src/app/api/reconcile/route.ts`, `src/lib/heuristics.ts` | Gemini condition-diff verdict; offline heuristic fallback |
| Experiment | `src/app/api/experiment/route.ts` | POPPER-style plan for genuine contradictions |
| Persistence | `src/lib/db.ts`, `persistence.ts`, `prefs.ts` | IndexedDB (idb), 500ms debounced auto-save |

## Ingestion — current behaviour

`/api/extract` (live path): `parsePdf(buf)` → `text = fullText.slice(0,6000) + "…" + priorityText(parsed)` → `extractClaimsForPaper`. Per-paper 1.8s spacing to respect the free-tier quota.

- **No identifier resolution.** DOI / arXiv id are never detected; every paper is parsed as a PDF even when clean structured full text exists (arXiv, PMC).
- **pdf.js-class parsing only.** `unpdf` gives raw per-page text with **no reading-order recovery** (two-column papers interleave), **no table structure**, and header/footer/line-number noise is not stripped. (Matches the brief's "pdf.js output significantly inferior".)
- **Title heuristic** (`guessTitle`) picks the first plausible line — often wrong for published PDFs with publisher furniture (we've seen "Published as a conference paper at ICLR 2015").
- `priorityText` anchors on "results/experiments/table" windows; for garbled tables this yields low-signal text.

## Extraction — current behaviour

`extractClaimsForPaper` → **one-shot** `extractionPrompt` asking for a JSON array of `(claim_text, task, dataset, metric, result_value, result_confidence, conditions, source_span)`.

- **No span grounding.** `source_span.text` is a model-emitted "quote" that is **never verified** to be a substring of the parsed text → the primary hallucination vector. `source_span.page` frequently defaults to 1.
- **No decomposition / decontextualization.** Claims are emitted whole; pronouns and cross-sentence references are not resolved, which weakens downstream contradiction matching.
- **No self-consistency / confidence cascade.** `result_confidence` is a model-asserted string; there is no N-sample agreement signal and no low-confidence → Gemini escalation. Escalation today is all-or-nothing (whole batch) and only on hard failure.
- **Quota fragility.** Hosted `gemma-4-31b-it` on the free tier returns empty 200s under burst; a 3× backoff retry mitigates but multi-paper uploads still starve (only ~1–2 of N papers extract per burst).
- **Schema shape drift.** `normalizeClaims` already defends against bare-array / `{claims:[]}` / single-object outputs — evidence the small model is inconsistent.
- **Numeric handling is correct-by-design:** `result_value` verbatim, confidence defaults to `medium`. Keep this.

## Contradiction — current behaviour

`buildCandidateEdges` groups cross-paper claims sharing canonical `(task,dataset,metric)`; `/api/reconcile` runs a Gemini condition-diff → `GENUINE_CONTRADICTION | CONTEXT_CONDITIONED_DIVERGENCE | AGREEMENT` + confidence + reasoning.

- **No retrieval cascade.** Pairing is exact-key only (after light canonicalization); there is no embedding recall → cross-encoder rerank → NLI. Metric-naming variance blocks real overlaps.
- **No precision instrumentation.** Contradiction precision is never measured; there is no labelled "apparent-not-real" guard set.
- **Reasons are coarse.** Only three verdicts; no explicit `different_population / different_metric / not_comparable` enumeration, and no Likert threshold to filter trivial conflicts.
- **Numeric-only risk.** The reconciler can be swayed by a single low-confidence extracted number; the brief says a low-confidence number must never trigger a contradiction alone.

## Top failure modes (ranked by leverage)

1. **Always parses PDFs** even for arXiv/PMC — biggest reliability loss. → Phase 1 resolve-first.
2. **No span grounding** — hallucinated quotes/numbers pass through silently. → Phase 2 grounding gate.
3. **One-shot small-model extraction** — low yield, inconsistent shapes. → Phase 2 decompose + cascade.
4. **Free-tier quota starvation** on hosted Gemma bursts. → Phase 2 Gemma-local-first cascade + spacing.
5. **Contradiction precision unmeasured / untuned** — false contradictions erode trust. → Phase 3 precision guard.
6. **Two-column / table / header-footer noise** unhandled by unpdf. → Phase 1 (structured sources sidestep it; GROBID would fix the parse path but needs Docker, unavailable here).

## Environment constraints (measured this session)

- Ollama **up** with `gemma4:e4b` → Gemma-local first pass is viable.
- arXiv / OpenAlex / Crossref reachable (200); PMC id-converter reachable (redirects). SciFact tarball downloadable.
- **No Docker** → GROBID/Docling sidecar cannot be stood up here; resolve-first + `unpdf` fallback is the pragmatic default (also the brief's recommended default for a laptop demo).
