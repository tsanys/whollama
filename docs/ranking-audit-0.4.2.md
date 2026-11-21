# Offline ranking audit: 0.4.1 to 0.4.2

## Method

Compared the two release scorers using the unchanged 0.4.2 bundled catalog and
benchmark data, no network or user cache, a fixed 2026-11-21 UTC clock, and a
24 GB RTX 4090, 64 GB RAM profile. `showAll: true` includes models that do not
fit on the GPU; this is an audit of all 93 catalog entries, not the default
recommendation list. The same data and hardware are supplied to both versions.

To reproduce, build this checkout, then build tag `v0.4.1` in a separate
directory using its dependencies and run:

```sh
node scripts/audit-ranking.mjs /path/to/built-v0.4.1
```

The script reports membership, scores, and tier changes as JSON. It compares
the old scoring implementation against the current build; later changes to the
current scorer can change the results. It does not simulate an online refresh
or migrate a real user's cache.

## Findings

- 62 of 93 models changed resolved benchmark tier. Records without a dated
  LiveBench provenance are marked `legacy-unverified` and treated as curated;
  the curated tier has a 0.5 confidence multiplier versus 1.0 for direct.
  When a historical record has a LiveBench field, 0.4.2 also selects that
  field instead of the older mixed-source score.
- Top 10 departures: `deepseek-coder-v2:16b` (rank 6 to 11, score 84.9 to
  66.4) and `gemma4:27b` (8 to 31, 84.4 to 63.4). Both moved from direct to
  curated confidence, which explains the score reductions.
- Top 10 entrants: `qwen3-vl:8b` (56 to 6, score unchanged at 67.3) and
  `phi4-reasoning:14b` (57 to 7, unchanged at 67.0). They rose because other
  models lost direct-tier confidence, not because their scores increased.
- Top 25 lost those two models plus `qwen3:30b`, `qwen3:32b`, `gemma3:27b`,
  `deepseek-r1:32b`, `mistral:small`, `qwen2.5:32b`, and `codestral:22b`.
  Entries were the two top-10 entrants plus `ministral-3:14b`, `qwen3-vl:4b`,
  `ministral-3:8b`, `gemma3n:e4b`, `llava:13b`, and
  `llama3.2:11b-vision`.
- The largest absolute rank rise was 50 positions for each top-10 entrant.
  Among the largest drops, `qwen3:32b`, `deepseek-r1:32b`, and `qwen2.5:32b`
  each fell 33 positions after direct-to-curated reclassification.
- The largest composite-score reduction was `qwen3:235b`, 63.5 to 40.3.
  It is included only because `showAll` includes CPU-only models.
- Some small variants previously inherited family scores. For example,
  `qwen3:0.6b` changed from family score 62.8 to its curated score 41.0.
  This reflects the resolver's changed priority when historical direct scores
  are placed in the curated map.

These movements follow the implementation's confidence policy, but the audit
does not prove that the policy is optimal. LiveBench refresh results, different
hardware, user caches, model matching beyond this catalog, and ranking quality
against ground truth require separate evaluation.
