# Sample papers — famous contradictory pairs

Each folder is one famous disagreement in ML. **Drag both PDFs from a folder into Crux** and watch it extract, pair, and adjudicate. Ranked by how well Crux's current claim shapes (benchmark tuples + scaling-law coefficients) cover the pair — start at 01.

| # | Folder | The famous fight | Expectation in Crux |
|---|---|---|---|
| 01 | `scaling-laws-kaplan-vs-chinchilla` | Kaplan 2020: params should scale as `N ∝ C^0.73`. Chinchilla 2022: no — `a ≈ 0.50`, models are undertrained | ⭐ **The flagship — battle-tested.** ~6 edges via coefficient-role pairing; contradiction on both exponents; agent auto-designs the experiment |
| 02 | `imagenet-depth-vgg-vs-resnet` | VGG: depth via 3×3 stacks → 7.3% top-5. ResNet: residuals unlock 152 layers → 3.57% | ⭐ **Proven in the eval harness.** Top-5 error pair on ImageNet; expect a divergence (depth/architecture conditions explain the gap) |
| 03 | `vit-vs-convnext` | ViT: pure transformers beat CNNs at scale. ConvNeXt: a modernized ConvNet matches them | Good odds — both report ImageNet top-1 accuracy (miner covers accuracy phrasing). Expect pairs; verdicts likely divergence (pre-training data/scale conditions) |
| 04 | `bert-vs-roberta` | RoBERTa's thesis is literally "BERT was significantly undertrained" — same architecture, same benchmarks, better numbers | Plausible — shared GLUE/SQuAD numbers may pair if the extractor emits matching metric names. Untested; a good live-discovery demo |
| 05 | `lottery-ticket-vs-pruning` | Lottery Ticket: sparse winning subnetworks need the original init. Rethinking Pruning: random re-init does just as well | Stretch — claims are accuracy-at-sparsity on CIFAR/ImageNet; CIFAR phrasing isn't in the miner yet, so pairing depends on the LLM extraction. Expect claims, maybe few edges |
| 06 | `emergent-abilities-vs-mirage` | Wei et al.: LLMs show sharp emergent abilities. Schaeffer et al.: the "emergence" is an artifact of the metric | Stretch — the contradiction is *about metric choice itself*, mostly figures not shared numeric tuples. Expect grounded claims; edges unlikely. Honest to say so if asked |

## How to test (per folder)

1. Open a **new session** (clean thread), set the header mode pill (**Local** for the on-device story, **Auto** for best extraction)
2. Drag the folder's PDFs onto the drop zone
3. Watch the Ask tab's agent run card: sense → decide → check → ⚡ act
4. Expectations above are honest, not promises — engine badges and span viewers show exactly what happened

Timing on local e4b: ~2–5 min per pair at `EXTRACT_MAX_CHUNKS=3`. The loose `vgg.pdf` / `resnet.pdf` / `densenet.pdf` in this directory belong to the frozen eval corpus (`eval/corpus/manifest.json`) — don't move them.
