import type {
  Claim,
  Paper,
  CandidateEdge,
  Reconciliation,
  ExperimentPlan,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Demo corpus: three ML papers that all report SparseViT on ImageNet-1k.
// - Paper A and Paper C use the *same* recipe but disagree by 1.3 pts  → GENUINE
// - Paper A and Paper B differ by 2.6 pts but B trains 3x fewer epochs  → DIVERGENCE
// The numbers, conditions, and provenance are internally consistent so the
// reconciliation reasoning has something real to bite on.
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_PAPERS: Paper[] = [
  {
    paper_id: "paper-a",
    handle: "A",
    title: "Efficient Sparse Attention for Image Classification",
    authors: "Chen, Ravikumar, O’Neill",
    year: 2024,
    venue: "CVPR 2024",
    pages: 11,
  },
  {
    paper_id: "paper-b",
    handle: "B",
    title: "Revisiting Sparse Attention Baselines Under Constrained Budgets",
    authors: "Kumar, Hoffmann, Tan",
    year: 2025,
    venue: "ICLR 2025",
    pages: 9,
  },
  {
    paper_id: "paper-c",
    handle: "C",
    title: "A Reproducibility Study of Sparse Vision Transformers",
    authors: "Okafor, Dubois, Petrova",
    year: 2025,
    venue: "TMLR (Reproducibility Certification)",
    pages: 14,
  },
];

const cond = (
  o: Partial<Claim["conditions"]>
): Claim["conditions"] => ({
  train_test_split: null,
  sample_size: null,
  hyperparameters: null,
  preprocessing: null,
  other: null,
  ...o,
});

export const DEMO_CLAIMS: Claim[] = [
  // ── Paper A ────────────────────────────────────────────────────────────────
  {
    claim_id: "claim-a1",
    paper_id: "paper-a",
    claim_text:
      "SparseViT-B attains 84.2% top-1 accuracy on ImageNet-1k, outperforming the dense ViT-B baseline by 1.1 points at equal FLOPs.",
    task: "Image classification",
    dataset: "ImageNet-1k",
    metric: "Top-1 accuracy",
    result_value: "84.2%",
    result_confidence: "medium",
    conditions: cond({
      train_test_split: "Standard ImageNet-1k train / val (1.28M / 50k)",
      sample_size: "1.28M training images",
      hyperparameters:
        "300 epochs, AdamW, batch 1024, cosine schedule, resolution 224",
      preprocessing: "RandAugment (m=9), Mixup 0.8, CutMix 1.0, label smoothing 0.1",
      other: "Reported on a single seed; EMA of weights",
    }),
    source_span: {
      page: 6,
      text: "Table 2. SparseViT-B reaches 84.2 top-1 on ImageNet-1k (300 ep, 224px), a +1.1 gain over ViT-B at matched FLOPs.",
    },
    extractor: "demo",
  },
  {
    claim_id: "claim-a2",
    paper_id: "paper-a",
    claim_text:
      "On ADE20K semantic segmentation, a SparseViT-B backbone reaches 49.1 mIoU with UperNet.",
    task: "Semantic segmentation",
    dataset: "ADE20K",
    metric: "mIoU",
    result_value: "49.1",
    result_confidence: "medium",
    conditions: cond({
      train_test_split: "ADE20K train / val (20k / 2k)",
      hyperparameters: "UperNet head, 160k iterations, crop 512",
      other: "Single-scale evaluation",
    }),
    source_span: {
      page: 8,
      text: "With a UperNet head, SparseViT-B achieves 49.1 mIoU (single-scale) on ADE20K.",
    },
    extractor: "demo",
  },
  {
    claim_id: "claim-a3",
    paper_id: "paper-a",
    claim_text:
      "SparseViT-B uses 17.4 GFLOPs at 224px, matching ViT-B within 2%.",
    task: "Image classification",
    dataset: "ImageNet-1k",
    metric: "GFLOPs",
    result_value: "17.4 GFLOPs",
    result_confidence: "high",
    conditions: cond({
      hyperparameters: "Resolution 224",
      other: "Theoretical FLOPs at inference",
    }),
    source_span: {
      page: 6,
      text: "SparseViT-B: 17.4 GFLOPs @ 224px.",
    },
    extractor: "demo",
  },

  // ── Paper B ────────────────────────────────────────────────────────────────
  {
    claim_id: "claim-b1",
    paper_id: "paper-b",
    claim_text:
      "Under a constrained 100-epoch budget, SparseViT-B reaches 81.6% top-1 on ImageNet-1k, and we argue prior gains were partly a function of training length.",
    task: "Image classification",
    dataset: "ImageNet-1k",
    metric: "Top-1 accuracy",
    result_value: "81.6%",
    result_confidence: "medium",
    conditions: cond({
      train_test_split: "Standard ImageNet-1k train / val (1.28M / 50k)",
      sample_size: "1.28M training images",
      hyperparameters:
        "100 epochs, AdamW, batch 1024, cosine schedule, resolution 224",
      preprocessing: "Light augmentation: RandAugment (m=5), no Mixup/CutMix",
      other: "Mean of 3 seeds, no EMA",
    }),
    source_span: {
      page: 4,
      text: "At 100 epochs with light augmentation, SparseViT-B obtains 81.6 top-1 (mean of 3 seeds).",
    },
    extractor: "demo",
  },
  {
    claim_id: "claim-b2",
    paper_id: "paper-b",
    claim_text:
      "Training throughput for SparseViT-B is 1,180 images/sec on a single A100.",
    task: "Image classification",
    dataset: "ImageNet-1k",
    metric: "Throughput (img/s)",
    result_value: "1180 img/s",
    result_confidence: "high",
    conditions: cond({
      hyperparameters: "A100 80GB, mixed precision, batch 256",
      other: "Forward+backward",
    }),
    source_span: {
      page: 7,
      text: "We measure 1,180 img/s training throughput on one A100 (bf16).",
    },
    extractor: "demo",
  },

  // ── Paper C ────────────────────────────────────────────────────────────────
  {
    claim_id: "claim-c1",
    paper_id: "paper-c",
    claim_text:
      "Reproducing the original recipe exactly (300 epochs, full augmentation, 224px), we measure 82.9% top-1 for SparseViT-B on ImageNet-1k — 1.3 points below the reported 84.2%.",
    task: "Image classification",
    dataset: "ImageNet-1k",
    metric: "Top-1 accuracy",
    result_value: "82.9%",
    result_confidence: "high",
    conditions: cond({
      train_test_split: "Standard ImageNet-1k train / val (1.28M / 50k)",
      sample_size: "1.28M training images",
      hyperparameters:
        "300 epochs, AdamW, batch 1024, cosine schedule, resolution 224",
      preprocessing: "RandAugment (m=9), Mixup 0.8, CutMix 1.0, label smoothing 0.1",
      other:
        "Mean of 5 seeds (±0.15); authors’ released config; EMA of weights",
    }),
    source_span: {
      page: 9,
      text: "Across 5 seeds we obtain 82.9±0.15 top-1, 1.3 points short of the paper’s 84.2 despite matching the released config.",
    },
    extractor: "demo",
  },
  {
    claim_id: "claim-c2",
    paper_id: "paper-c",
    claim_text:
      "Using the SparseViT-B backbone we reproduce 48.8 mIoU on ADE20K, within noise of the reported 49.1.",
    task: "Semantic segmentation",
    dataset: "ADE20K",
    metric: "mIoU",
    result_value: "48.8",
    result_confidence: "high",
    conditions: cond({
      train_test_split: "ADE20K train / val (20k / 2k)",
      hyperparameters: "UperNet head, 160k iterations, crop 512",
      other: "Single-scale, mean of 3 runs",
    }),
    source_span: {
      page: 11,
      text: "Our ADE20K reproduction yields 48.8 mIoU (single-scale), within run-to-run variance of the reported 49.1.",
    },
    extractor: "demo",
  },
];

// Candidate edges: claims sharing (task, dataset, metric).
export const DEMO_EDGES: CandidateEdge[] = [
  {
    edge_id: "edge-claim-a1-claim-c1",
    source_claim_id: "claim-a1",
    target_claim_id: "claim-c1",
    task: "Image classification",
    dataset: "ImageNet-1k",
    metric: "Top-1 accuracy",
    status: "done",
  },
  {
    edge_id: "edge-claim-a1-claim-b1",
    source_claim_id: "claim-a1",
    target_claim_id: "claim-b1",
    task: "Image classification",
    dataset: "ImageNet-1k",
    metric: "Top-1 accuracy",
    status: "done",
  },
  {
    edge_id: "edge-claim-b1-claim-c1",
    source_claim_id: "claim-b1",
    target_claim_id: "claim-c1",
    task: "Image classification",
    dataset: "ImageNet-1k",
    metric: "Top-1 accuracy",
    status: "done",
  },
  {
    edge_id: "edge-claim-a2-claim-c2",
    source_claim_id: "claim-a2",
    target_claim_id: "claim-c2",
    task: "Semantic segmentation",
    dataset: "ADE20K",
    metric: "mIoU",
    status: "done",
  },
];

export const DEMO_RECONCILIATIONS: Record<string, Reconciliation> = {
  // A vs C — SAME recipe, 1.3 pt gap → genuine contradiction.
  "edge-claim-a1-claim-c1": {
    verdict: "GENUINE_CONTRADICTION",
    confidence: 0.82,
    shared_conditions: [
      "Same dataset & split: ImageNet-1k 1.28M/50k",
      "Same schedule: 300 epochs, AdamW, batch 1024, cosine",
      "Same resolution: 224px",
      "Same augmentation stack: RandAugment m=9, Mixup 0.8, CutMix 1.0",
      "Both use EMA of weights",
    ],
    differing_conditions: [
      "Seeds: A reports a single seed; C reports mean of 5 seeds (±0.15)",
      "C used the authors’ released config verbatim",
    ],
    reasoning:
      "1. Both claims target the identical (task, dataset, metric): SparseViT-B, ImageNet-1k, Top-1.\n" +
      "2. I diff the conditions field-by-field. Split, epoch count (300), optimizer, batch size, resolution (224), and the full augmentation stack all match. Both apply weight EMA.\n" +
      "3. The only material difference is estimation: A reports a single seed; C reports a 5-seed mean of 82.9±0.15. A gap of 1.3 points is ~9× the reported standard deviation, so seed variance alone does not explain it.\n" +
      "4. Because the divergence persists under matched conditions and exceeds the noise band, this is not a context-conditioned divergence — it is a genuine contradiction. The most likely hidden factor is single-seed cherry-picking or an unlogged detail in A (e.g., a longer EMA warmup or test-time preprocessing) not present in the released config.\n" +
      "5. Confidence is 0.82 rather than higher because A does not disclose its seed-selection protocol; the discriminating experiment is a multi-seed re-run of A’s exact config.",
    needs_human_review: false,
  },
  // A vs B — 2.6 pt gap but B trains 3x fewer epochs, weaker aug → divergence.
  "edge-claim-a1-claim-b1": {
    verdict: "CONTEXT_CONDITIONED_DIVERGENCE",
    confidence: 0.9,
    shared_conditions: [
      "Same dataset & split: ImageNet-1k 1.28M/50k",
      "Same architecture: SparseViT-B",
      "Same resolution: 224px, same optimizer family (AdamW, batch 1024)",
    ],
    differing_conditions: [
      "Training length: 300 epochs (A) vs 100 epochs (B) — 3× fewer",
      "Augmentation: full RandAugment+Mixup+CutMix (A) vs light RandAugment only (B)",
      "EMA: A uses weight EMA; B does not",
    ],
    reasoning:
      "1. Same (task, dataset, metric), so the 84.2 vs 81.6 gap is a candidate conflict.\n" +
      "2. Condition diff surfaces three confounds that all push in the same direction: B trains 3× fewer epochs, drops Mixup/CutMix, and disables EMA. Each is independently known to cost 1–2 points on ImageNet ViT training.\n" +
      "3. B’s own framing (‘prior gains were partly a function of training length’) is consistent with this: the paper is deliberately measuring a constrained-budget regime, not contradicting A’s regime.\n" +
      "4. The results are therefore both true under their stated conditions — a context-conditioned divergence, not a contradiction. No experiment is needed to ‘resolve’ them; the gap is explained. Confidence 0.90.",
    needs_human_review: false,
  },
  // B vs C — different budgets → divergence.
  "edge-claim-b1-claim-c1": {
    verdict: "CONTEXT_CONDITIONED_DIVERGENCE",
    confidence: 0.88,
    shared_conditions: [
      "Same dataset & split, same architecture, same 224px resolution",
    ],
    differing_conditions: [
      "Training length: 100 epochs (B) vs 300 epochs (C)",
      "Augmentation: light (B) vs full stack (C)",
      "EMA off (B) vs on (C)",
    ],
    reasoning:
      "B (81.6) and C (82.9) differ by 1.3 points, but B is an explicitly constrained 100-epoch, light-augmentation run while C reproduces the full 300-epoch recipe. The training-budget and augmentation differences fully account for the gap and run in the expected direction. Both are valid within their regimes — divergence, not contradiction.",
    needs_human_review: true,
  },
  // A vs C on ADE20K — within noise → agreement.
  "edge-claim-a2-claim-c2": {
    verdict: "AGREEMENT",
    confidence: 0.94,
    shared_conditions: [
      "Same dataset & split: ADE20K 20k/2k",
      "Same head & schedule: UperNet, 160k iters, crop 512",
      "Same evaluation: single-scale",
    ],
    differing_conditions: ["C averages 3 runs; A reports one run"],
    reasoning:
      "49.1 (A) vs 48.8 (C) mIoU under identical UperNet/160k/512 single-scale protocol. A 0.3 mIoU gap is within typical ADE20K run-to-run variance (±0.3–0.4), and C explicitly notes it is within noise. This is an agreement.",
    needs_human_review: false,
  },
};

export const DEMO_EXPERIMENTS: Record<string, ExperimentPlan> = {
  "edge-claim-a1-claim-c1": {
    edge_id: "edge-claim-a1-claim-c1",
    title: "Multi-seed falsification of SparseViT-B’s reported 84.2% top-1",
    hypothesis_null:
      "H0: The true expected Top-1 of SparseViT-B under the released 300-epoch/224px recipe is ≤ the reproduction mean (82.9%); the reported 84.2% is a single-seed high draw, not a reproducible property of the method.",
    hypothesis_alternative:
      "H1: The true expected Top-1 is ≥ 84.0%; the reproduction is missing an ingredient present in the original (e.g., longer EMA warmup or a preprocessing detail), and restoring it recovers the gap.",
    variables_held_fixed: [
      "Architecture (SparseViT-B, released weights-init & config hash)",
      "Dataset & split (ImageNet-1k 1.28M/50k)",
      "Schedule (300 epochs, AdamW, batch 1024, cosine), resolution 224",
      "Augmentation stack (RandAugment m=9, Mixup 0.8, CutMix 1.0, LS 0.1)",
      "Evaluation protocol (center-crop val, EMA weights)",
    ],
    manipulation:
      "Run the authors’ exact released config across 10 independent seeds. Arm 1: config as-released. Arm 2: config + the two under-specified knobs from Paper A’s appendix (EMA warmup = 5 epochs, test-time resize 256→224 bicubic). Log every seed’s val curve and a config hash for provenance.",
    discriminating_metric:
      "Mean Top-1 over 10 seeds with a 95% CI. Decision rule: if the 95% CI upper bound < 84.0% in both arms, reject H1 (contradiction stands: 84.2% is not reproducible). If Arm 2’s CI covers 84.2% but Arm 1’s does not, the gap is an under-specification bug, not a contradiction.",
    expected_outcome_if_paper_a_correct:
      "Arm 2 recovers 84.0–84.4% and Arm 1 lands near 82.9%, localizing the discrepancy to the two undocumented knobs — Paper A is reproducible once fully specified.",
    expected_outcome_if_paper_b_correct:
      "Both arms cluster at 82.7–83.1% with tight CIs, ~1.3 points under 84.2% — confirming Paper C’s reproduction and marking 84.2% as a single-seed artifact.",
    estimated_conclusiveness: "high",
    estimated_compute_cost:
      "~20 ImageNet-1k training runs (2 arms × 10 seeds), ≈ 300–400 A100-hours total. One week on an 8×A100 node.",
  },
};

// Page-like body text for the source viewer. Each paragraph is tagged with a
// page; the claim source spans appear verbatim so they can be highlighted.
export interface PageBlock {
  page: number;
  heading?: string;
  text: string;
}

export const DEMO_PAPER_BODIES: Record<string, PageBlock[]> = {
  "paper-a": [
    {
      page: 1,
      heading: "Abstract",
      text: "We introduce SparseViT, a vision transformer with learned token sparsity that matches dense attention accuracy at a fraction of the compute. On ImageNet-1k, SparseViT-B improves over the ViT-B baseline while holding FLOPs fixed, and transfers strongly to dense prediction.",
    },
    {
      page: 6,
      heading: "4. ImageNet-1k classification",
      text: "We train for 300 epochs at 224×224 with AdamW, batch size 1024, a cosine schedule, RandAugment (m=9), Mixup 0.8, CutMix 1.0, and label smoothing 0.1, reporting the EMA of weights. Table 2. SparseViT-B reaches 84.2 top-1 on ImageNet-1k (300 ep, 224px), a +1.1 gain over ViT-B at matched FLOPs. SparseViT-B: 17.4 GFLOPs @ 224px.",
    },
    {
      page: 8,
      heading: "5. Transfer to dense prediction",
      text: "We evaluate the backbone on ADE20K semantic segmentation. With a UperNet head, SparseViT-B achieves 49.1 mIoU (single-scale) on ADE20K, competitive with heavier backbones at lower cost.",
    },
  ],
  "paper-b": [
    {
      page: 1,
      heading: "Abstract",
      text: "We revisit sparse-attention vision transformers under constrained training budgets. We find that a large share of previously reported gains is attributable to long schedules and heavy augmentation rather than the sparsity mechanism itself.",
    },
    {
      page: 4,
      heading: "3. Constrained-budget results",
      text: "Under a fixed 100-epoch budget with light augmentation (RandAugment m=5, no Mixup/CutMix, no EMA), we retrain SparseViT-B from scratch. At 100 epochs with light augmentation, SparseViT-B obtains 81.6 top-1 (mean of 3 seeds). This is well below headline numbers trained for 300 epochs.",
    },
    {
      page: 7,
      heading: "5. Efficiency",
      text: "We measure 1,180 img/s training throughput on one A100 (bf16), confirming the method’s runtime advantage independent of accuracy.",
    },
  ],
  "paper-c": [
    {
      page: 1,
      heading: "Abstract",
      text: "This is a reproducibility study of SparseViT. Using the authors’ released configuration, we attempt to reproduce the reported ImageNet-1k and ADE20K results across multiple seeds.",
    },
    {
      page: 9,
      heading: "4.1 ImageNet-1k reproduction",
      text: "We run the released 300-epoch, 224px config verbatim, including RandAugment (m=9), Mixup, CutMix, and weight EMA. Across 5 seeds we obtain 82.9±0.15 top-1, 1.3 points short of the paper’s 84.2 despite matching the released config. The gap exceeds nine standard deviations of our seed distribution.",
    },
    {
      page: 11,
      heading: "4.2 ADE20K reproduction",
      text: "Our ADE20K reproduction yields 48.8 mIoU (single-scale), within run-to-run variance of the reported 49.1. We therefore treat the segmentation result as reproduced.",
    },
  ],
};

export function buildDemoState() {
  return {
    papers: DEMO_PAPERS,
    claims: DEMO_CLAIMS,
    edges: DEMO_EDGES.map((e) => ({
      ...e,
      reconciliation: DEMO_RECONCILIATIONS[e.edge_id],
    })),
    experiments: DEMO_EXPERIMENTS,
  };
}
