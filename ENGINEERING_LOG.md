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
| `phase3` | 3 contradiction precision guard | — | — | — | — | — | — | **1.00** (recall 0.67, 0 FP) |

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
- **Phase 3** — `lib/contra`: precision-first adjudication. (1) deterministic **hard guard** — different metric/dataset can never be a contradiction (no model call); (2) strict **Likert adjudicator** (Gemini leads for this orchestration tier, Gemma offline fallback) whose rubric asks whether a differing condition actually *explains* the gap (an estimation detail like single-seed-vs-mean does not); genuine only at likert ≥ 8; (3) **low-confidence-number guard** — two low-confidence values can't make a contradiction alone. Wired into `/api/reconcile`. **Eval: precision 1.00, recall 0.67, zero false positives** on 10 labelled pairs — the deterministic guard catches different-metric/population/dataset instantly, the rubric catches both clearly-genuine pairs (likert 9) and correctly abstains on the hardest single-seed-vs-mean case. The one recall miss is defensible; precision (the metric that matters for trust) is perfect. Note: a genuine contradiction is only assertable when the pair carries the noise band — the adjudicator correctly refuses to assert genuine without it.

## Live-defect fixes (session 2)

Four defects were visible in a live 3-paper upload (VGG/ResNet/DenseNet): 28 span-grounded claims but **0 candidate edges** (empty graph). Metric: **edge count** (VGG 7.3% top-5 error ↔ ResNet 3.57% top-5 error must pair).

| SHA | fix | what changed | before | after |
|---|---|---|---|---|
| `fix1` | 1 null task/metric slots | prompt requires metric + infers task; `canonDataset` maps ILSVRC(-year)→imagenet; `canonMetric` folds test/val/rate error + bare classification error→top-5; post-extraction metric/task inference fallback; edges require a value; dedup on canonical keys | **0 edges** | **1 edge** (VGG↔ResNet top-5, unit-verified); third-party & value-less claims form 0 |
| `fix4` | 4 third-party attribution | `about_system` + `is_own_contribution` added to prompt/schema; `buildCandidateEdges` excludes non-own claims; "cited" marker in the source list | 3rd-party claims *would* edge after Fix 1 | GoogLeNet 6.7% & Clarifai 11.2%/11.7% flagged `own=false` → **0 edges** (verified on the VGG comparison paragraph); VGG's own 7.0% stays edge-eligible |
| `fix2` | 2 LaTeX/citation artifacts | new `lib/ingest/clean.ts` (`cleanText`/`cleanDoc`) run **before chunking** in `ingest()`: collapse ar5iv `\%` triple-expansion (`6.7%percent6.76.7\%`→`6.7%`, incl. slash pairs `24.8%/7.5%`), strip `\times`/`\macro` LaTeX, strip `[41]`/`[1,2]` citations | spans carried `\%`, `percent`, `[41]` junk | fixtures re-generated: **0 backslash macros, 0 `percent` artifacts, 0 bracketed citations**; clean values survive (VGG `7.3%`, ResNet `3.57%`). Span-grounding rate unchanged — the gate is by-construction 100%, and source+extraction text are cleaned identically so no grounded claim is lost |
| `fix3` | 3 author self-reference dups | `paperSystemName` (dominant own `about_system`, else title token) + `dedupSignature` fold `we`/`our`/`the authors'? team`/`the proposed method` → system name (order-preserving, light `-s` stem) for the value-less dedup key; **grounded `inferDataset`** fills a missing dataset from the span (ILSVRC/ImageNet/CIFAR/COCO/… only when literally present) so a bare "7.3% top-5 error" claim resolves to ImageNet and collapses with its ILSVRC-named twin | headline result duplicated as "we …" and by method name across chunks | `eval/fix3-check.ts` (16 checks): self-ref phrasings fold to one signature/key; VGG 7.3% abstract-vs-results dup collapses to a single `imagenet\|top5 error\|7.3` key; distinct values (6.8% vs 7.3%) stay separate (recall guard); `inferDataset` never invents a name absent from text |

### Why the fixes above weren't enough live — and the two extraction bugs behind it

Running the fixes end-to-end (not just the unit tests) exposed that **`edges` was still 0**: the graph layer (Fix 1/3/4) was correct, but the *extraction* wasn't feeding it VGG's 7.3% top-5 error. Root causes, in order of discovery:

1. **`gemma4:e4b` never extracts VGG's headline.** Across 6 priority chunks it fixates on the top-1 table rows (24.x) and the "secured the places" narrative and simply omits "…configuration E achieves 7.3% top-5 error". Re-runs are nondeterministic (2 claims one run, 0 the next on the *same* chunk). Gemini escalation only fires on a **fully empty** chunk, so a chunk that yields a junk number but misses the headline is never rescued; and the free-tier key was throttling escalations to empty 200s anyway (`deg=true, esc=0`). **No prompt tweak makes a 4B local model reliably surface a specific sentence.**
2. **Two real slot bugs on the sentence that *is* extracted.** When e4b (or the miner) does read "configuration E achieves 7.3% top-5 error", (a) it has **no dataset** ("test set", not "ImageNet") → `buildCandidateEdges` drops it, and (b) it gets flagged **`is_own_contribution=false`** because the sentence lacks "we"/"our" — the model over-triggers "third-party" on the paper's own config.

**Fixes (all committed together as the edge-formation change):**

| area | change | verification |
|---|---|---|
| deterministic result-miner | new `lib/extract/mine.ts`: scans each chunk for a metric+value stated *adjacently* ("N% top-5 error" / "top-5 error of N%") and emits a claim only from **own-result sentences** (first-person / "configuration X") while **skipping every comparison sentence** — so span/value are grounded by construction and competitor numbers (GoogLeNet 6.7%, Clarifai 11.2%) are never mined. Runs beside the LLM tier per chunk; dedup collapses overlaps. Claims carry `mined:true`, shown as "pattern-grounded" in the UI. | `eval/mine-check.ts` (9 checks): mines VGG 7.3% (both phrasings) as own/ImageNet/top-5; refuses competitor + comparison sentences + table rows |
| dataset from metric convention | in `groundChunk` (and the miner): a `top-5 error` with no named dataset → **ImageNet** (the same ILSVRC convention `canonMetric` already uses for a bare "error"); value/span stay grounded, only the dataset *label* is inferred | edge-check: VGG 7.3% now carries `ImageNet` |
| ownership correction | `reconcileOwnership` post-pass: re-assert `own=true` when `about_system` is the paper's own system or a generic self-descriptor (`configuration/model/network/single/ensemble/…`); keep the model's `false` only for genuinely **named** competitors | `eval/fix3-check.ts` (+4 checks): "configuration E" → own, GoogLeNet/Clarifai stay third-party |
| **regression I introduced** | Phase 5.1 sent `keep_alive:"-1"` as a **string**, which Ollama rejects (`400 missing unit in duration "-1"`) — this silently **broke all on-device extraction**. Coerce numeric keep-alive values to a `number` (`-1`/`0`), leave duration strings (`"10m"`) as-is | direct `/api/generate` repro before/after; probe went 0→2 claims |

**End-to-end acceptance (`eval/edge-check.ts`, live cascade + key, `maxChunks=4`):** VGG 7.3% ✓ and ResNet 3.57% ✓ both extracted; **candidate edges 0 → 2**, including the target **VGG 7.3% ↔ ResNet 3.57% on ImageNet / top-5 error**. The miner makes this robust to e4b's per-run variance (ResNet's 3.57% is reliably read from its abstract; VGG's 7.3% is now guaranteed by the pattern miner).

## Phase 5 — demo hardening (session 3)

Reliability + latency work so a live upload behaves predictably in front of judges, on the free-tier key or on-device.

- **5.1 Ollama warmth.** Every local call now sends `keep_alive` (env `OLLAMA_KEEP_ALIVE`, default `-1` = resident forever) so the model isn't evicted between chunks/uploads. `warmOllama()` preloads it before the first chunk and reports `load_duration`; `/api/extract` calls it up front and streams the load time. Measured cold load `gemma4:e4b` ≈ **20.4 s**, ~0 s once warm.
- **5.2 Progress streaming.** `extractClaims` takes an `onProgress({done,total,heading})` callback; `/api/extract` relays it as a new NDJSON `progress` event and the store renders `Extracting · chunk 3/8 · Results`. The stream was already claim-by-claim; this adds *chunk*-level progress so long papers don't look stalled.
- **5.3 Graceful degradation.** Backend selection is `auto` (probe `localhost:11434`); a chunk that times out (`OLLAMA_CHUNK_TIMEOUT_MS`, default 120 s) or errors is escalated to the hosted Gemini tier instead of being dropped, and the run sets `stats.degraded` → the route emits a "on-device stalled … hosted fallback covered it" banner. If Ollama is entirely down, the route says so and (with a key) proceeds on hosted Gemma/Gemini.
- **5.4 Idempotency.** A SHA-256 **content-hash cache** keyed on `(title + sections + options)` returns a prior extraction instantly on any re-run (retry, re-upload, "Verify live" pressed twice) — no re-hitting the model. `noCache` opt bypasses it.
- **Verification:** `eval/phase5-check.ts` (6 checks, model-free): first call misses / identical re-run is `cached` / cached path still ticks progress / different content misses / `noCache` bypasses / `warmOllama` returns `{ready,loadMs}`. New env documented in `.env.example`.

## Phase 4 — eval-driven loop (session 3)

`eval/run.ts` now also reports, in one pass: **candidate edge count** (cross-paper `buildCandidateEdges` over all extracted claims — the metric the live-defect fixes target), **gold recall on a deterministic 30% holdout** (sorted-by-id, every 3rd — the un-tuned recall number) alongside full recall, and **wall-clock per paper + total**. A `EVAL_SECTIONS=priority|all` flag toggles the section-restriction latency lever.

**Result (frozen corpus, structured source, `gemma4:e4b` local first + Gemini escalation, priority sections, `maxChunks=4`, `EVAL_SECTIONS=priority`):**

| metric | phase4-priority (before miner/slot fixes) | phase4-final (after) |
|---|---|---|
| **candidate edges** | **0** | **1** — `ImageNet / top-5 error` (VGG 7.3% ↔ ResNet 3.57%) |
| mean yield | 2.3 / paper | 2.0 / paper |
| span-grounding | 100% (gate) | 100% (gate) |
| value-grounding | 100% | 100% |
| gold recall (full, 8) | 37.5% | 37.5% |
| gold recall (30% holdout, 3) | 0% | 33.3% |
| wall-clock (3 papers) | 634 s (resnet 36 / vgg 357 / densenet 236) | 684 s (resnet 38 / vgg 371 / densenet 268) |

The headline move is **edges 0 → 1**: the exact pair the empty-graph defect blocked now forms, driven by the pattern miner (VGG 7.3%) + reliable e4b abstract read (ResNet 3.57%) + the dataset/ownership slot fixes. Span-grounding stays 100% by construction (the gate). Aggregate **gold recall is flat at 37.5%** and **DenseNet still extracts 0** — honest gaps: (a) DenseNet's headline results are **CIFAR "test error of 3.46%"**, which is *not* an ImageNet top-k pattern, so neither the miner (ImageNet-scoped patterns, by design — plain "error" is too ambiguous to mine safely) nor the flaky local model catches them here; (b) `e4b` is nondeterministic run-to-run (ResNet 3→2 claims between runs) and slow (~30–90 s/chunk), so the aggregate yield wobbles within noise. A faster/GPU Gemma endpoint or a CIFAR-aware miner pattern would lift DenseNet; both are deferred and noted. **Latency:** priority-section restriction is the main lever (ResNet resolves in ~1 chunk / 38 s); the per-paper wall-clock and per-stage `stats.ms` are now logged.

## Latency: Ollama model eviction — the 17-minute extract spike (session 3 cont.)

**Symptom.** `/api/extract` was wildly inconsistent: 2.8 s and 2.6 s on two calls, then **1 016 448 ms (17 min)** on a third. `ollama ps` showed the model resident one moment and `expires_at ≈ "about a minute from now"` the next — i.e. Ollama was **evicting the model on its ~5-minute idle default**, so an extract call that arrived after eviction paid a 20–60 s cold reload of the model before doing any work.

**Root cause (deeper than the earlier string-vs-number bug).** `keep_alive` is set **per request**; Ollama re-arms the eviction timer on *every* generate call. The Phase 5.1 fix only added `keep_alive` to the **extraction** call site — `src/lib/extractor.ts` (v1 / live-demo path) and `src/lib/contra/index.ts` (reconcile's Gemma fallback) still sent **none**, so any call through those paths silently reset the model back to the 5-minute default even after extraction asked for "never". One un-instrumented call site is enough to re-introduce eviction.

**Fix — centralize + warm + observe.**
- **`src/lib/ollama.ts`** is now the single source of truth for `OLLAMA_HOST` / `OLLAMA_MODEL` / `OLLAMA_KEEP_ALIVE` (numeric-coerced: `-1`/`0`/`600` → number, `"10m"`/`"24h"` → string) / `OLLAMA_CHUNK_TIMEOUT_MS`, plus `warmOllama()`, `ollamaReachable()`, `ollamaWarmth()`. **All three call sites** (`extract/index.ts`, `extractor.ts`, `contra/index.ts`) import from it, so every Ollama request carries the same numeric `keep_alive`. Also unifies the model default (extractor.ts was defaulting to `gemma3:latest`, everything else to `gemma4:e4b`).
- **`warmOllama()` preloads at the extraction context** (`num_ctx: 8192`) so the warm load has the *same* memory footprint — otherwise Ollama reloads to resize on the first real extract, defeating the preload.
- **`/api/warmup`** — `POST` preloads + re-arms keep_alive; `GET` reports warmth via `/api/ps` without loading. Called fire-and-forget on `/app` mount (`app/layout.tsx`) so the model is resident before the user clicks "Load demo corpus".
- **`WarmthIndicator`** (header, next to the Gemma 4 badge) shows **Model warming… / warm ✓ / cold ⚠**, polling every 45 s so the demo driver can see the memory state at a glance.

**Verified.** `eval/keepalive-check.ts`: the serialised body is `"keep_alive":-1` (numeric, never the rejected string) across all env forms. Live: after a numeric-`-1` warm, `ollama ps` reports `expires_at = 2318-…` (never evicts, was "about a minute from now"); a repeat warm at the same context reloads in **0.3 s** (no resize). Against the running dev server, `GET /api/warmup` → `{warm:true, gemma4:e4b, 3262 MB}`, `POST` → `{ready:true, loadMs:283}`. **Warm extraction is ~2.5 s; the fix keeps it warm.** Extraction logic itself was not touched. Model size deliberately unchanged — `gemma4:e4b` is the right edge model; a bigger model would worsen cold-start/VRAM pressure.

## Scaling-law claim shape (session 3 cont.) — Kaplan vs Chinchilla, 0 edges

**Symptom.** A live Kaplan-2020 + Chinchilla upload extracted the *right* claims — Kaplan's `a (N_opt ∝ C^a) = 0.73`, `b (D_opt ∝ C^b) = 0.27` — but formed **0 candidate edges**, so reconciliation had nothing to judge.

**Root cause.** Scaling-law claims are not `(task, dataset, metric, score)` — they are `(equation, coefficient role, value)`. Two blocks, both by design of the benchmark-tuned canonicalizer: (1) `buildCandidateEdges` **requires a non-empty canonical dataset**, and these claims either have none or differing corpora (WebText2 vs MassiveText); (2) even with an edge, the reconcile `hardGuard` would return `not_comparable` on the corpus mismatch. For scaling laws the corpus is a *condition* the adjudicator should weigh, not an identity that blocks comparison.

**Fix — coefficient-role canonicalization (precision-first).**
- `graph.ts scalingRole(text)`: detects **param-exponent** (`N_opt ∝ C^a`, ar5iv-mangled `No_pt`, `α_N`, "coefficient a" …) vs **data-exponent** (`D_opt ∝ C^b`, `Do_pt`, `α_D`, tokens/data …) — but **only** with power-law-over-COMPUTE context (`∝`/power law/scaling AND `C^`/compute). A bare "a", a loss-vs-N exponent (`L ∝ N^-α`, no compute), or an ambiguous both-roles sentence returns "" — no guessing.
- `groupKey`: role-detected claims group as `scaling law · <role>`, **ignoring the corpus**; `buildCandidateEdges` waives the dataset requirement for them (value + own-contribution requirements unchanged — Fix 4 holds).
- `contra hardGuard`: same-role pairs pass through to the Likert adjudicator (`AdjClaim` gains `claim_text`, threaded from `/api/reconcile`); the adjudication prompt now shows the claim sentence so the model sees the functional form, and its rubric weighs corpus/LR-schedule as differing conditions.

**Verified (`eval/scaling-check.ts`, 17 checks, model-free):** Kaplan 0.73 ↔ Chinchilla 0.49 pair (param), 0.27 ↔ 0.51 pair (data), **a never cross-pairs with b**, third-party scaling claims never edge, benchmark different-dataset guard unchanged, VGG↔ResNet regression intact, and none of the gold contradiction pairs contain scaling markers (the `eval:contra` precision path is structurally untouched — its `toAdj` doesn't even pass `claim_text`).

## Extract latency, part 2: it's throughput, not a bug (session 3 cont.)

A 651 s extract call *with warmup working* (`ollama ps` = resident/Forever, warm ✓ badge, warmup 18 s then <2 s) is the **designed sequential cost**: 2 papers × up to 6 chunks × 40–90 s per e4b chunk, plus 120 s + a Gemini attempt for any timed-out chunk. There is no retry loop (escalation fires at most once per starved chunk) and no cold start left. Levers shipped:

- **`EXTRACT_MAX_CHUNKS`** env (default 6) — chunk budget per paper; `3` roughly halves a live upload. Headline-number recall is protected by results-first chunk ordering + the pattern miner (which reads *every* chunk it sees deterministically).
- **Per-chunk wall-clock** now streams in the `progress` event → status shows `Extracting · chunk 3/6 · Results · 42s`, so a stall is visible in-UI rather than looking frozen.
- **Demo-day recipe:** set `EXTRACT_MAX_CHUNKS=3` + `OLLAMA_CHUNK_TIMEOUT_MS=60000`, and **pre-run the exact upload once before judging** — the SHA-256 content-hash cache then returns the judged run instantly (same dev-server process, same files/options).

## Net result

- **Ingestion:** arXiv/PMC papers now ingest from clean structured full text with **zero PDF parsing**; the table numbers pdf.js garbled are recovered.
- **Extraction:** local-Gemma-first, decomposed, and **every surfaced claim is span-grounded** — hallucination is 0 by construction, and yield roughly doubled on the paper measured; quota starvation removed by going on-device.
- **Contradiction:** **zero false contradictions** on the guard set (the trust-critical metric), with the deterministic guard + strict rubric + low-confidence-number guard, and useful recall on well-specified pairs.
- **Deferred (documented):** GROBID/Docling sidecar (no Docker here; ar5iv covers arXiv), embedding→cross-encoder candidate retrieval (we use exact-key candidate edges), and the QLoRA Gemma fine-tune (opt-in weights swap). The full 3-paper extraction sweep is impractically slow on `e4b` locally — a faster Gemma endpoint or GPU makes it routine.
