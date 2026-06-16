# PRD — whollama

> Find the best Ollama model for your hardware, ranked by real benchmarks.

---

## 1. Overview

**whollama** is an open-source TypeScript CLI tool that auto-detects your hardware and recommends the best [Ollama](https://ollama.com) models you can actually run — ranked by real benchmark scores, not just parameter count or VRAM fit.

It is inspired by [whichllm](https://github.com/Andyyyy64/whichllm) but targets the Ollama ecosystem specifically, so every recommendation is immediately actionable via `ollama pull`.

---

## 2. Problem

Running local LLMs via Ollama requires answering two questions that are currently hard to answer together:

1. **What can my hardware run?** — VRAM, RAM, and disk space constrain which model sizes and quantizations are viable.
2. **Which of those is actually the best?** — Parameter count is a poor proxy for quality. A newer 14B model can outperform an older 30B.

Users currently guess, ask forums, or rely on outdated blog posts. whollama answers both questions in a single command.

---

## 3. Goals

- Recommend the best Ollama models for the user's hardware in under 5 seconds
- Use real, multi-source benchmark scores — not self-reported model card numbers
- Keep every recommendation immediately actionable (`ollama pull <model>`)
- Work offline via a curated fallback catalog
- Be scriptable and composable (`--json` output)

---

## 4. Non-Goals

- Not a model runner / chat interface (use `ollama run` for that)
- Not a cloud model recommender (Ollama-only, local inference only)
- Not a benchmark runner (uses existing public benchmark sources)
- No GUI or TUI — pure CLI

---

## 5. Target Users

- Developers and hobbyists running local LLMs via Ollama
- Homelab operators choosing models for self-hosted AI services
- Teams evaluating local models before committing to a stack

---

## 6. Features

### 6.1 Core — Hardware Detection

Auto-detects the following on first run:

| Property | Source |
|---|---|
| GPU vendor + VRAM | NVIDIA (`nvidia-smi`), AMD (`rocm-smi`), Apple Silicon (`system_profiler`) |
| CPU cores | `os.cpus()` |
| Total RAM | `os.totalmem()` |
| Free disk space | `statvfs` / `df` |
| OS | `process.platform` |

Hardware can be overridden manually for simulation/planning:

```
whollama --gpu "RTX 4090" --ram 32
whollama --gpu "M2 Max" --ram 64
```

### 6.2 Core — Model Catalog

Sources (in priority order):

1. **Live scrape** — `ollama.com/library` parsed on each run (with HTTP cache, TTL 24h)
2. **Cached catalog** — persisted to `~/.whollama/catalog.json` after first successful scrape
3. **Curated fallback** — bundled JSON in the package (~50 most popular models), used when offline or scrape fails

Each catalog entry contains:

```ts
{
  name: string           // e.g. "qwen3:14b"
  family: string         // e.g. "qwen3"
  params: number         // in billions, e.g. 14.8
  quant: string          // e.g. "Q4_K_M"
  vram_gb: number        // estimated VRAM required
  ram_gb: number         // estimated RAM required (CPU fallback)
  tags: string[]         // ["tools", "vision", "code", "math"]
  pulls: number          // from ollama.com/library
  updated: string        // ISO date
}
```

### 6.3 Core — Benchmark Scoring

Scores are merged from multiple public sources:

| Source | Type | Weight |
|---|---|---|
| LiveBench | Direct benchmark | High |
| Chatbot Arena ELO | Human preference | High |
| Open LLM Leaderboard v2 | Academic suite | Medium |
| Curated internal scores | Hardcoded fallback | Low |

Score resolution tiers (descending trust):
1. `direct` — exact model name match on a leaderboard
2. `variant` — same base model, different quant/size
3. `family` — same model family, score interpolated by size
4. `curated` — whollama maintainer-assigned score
5. `none` — unscored, ranked by pulls only

Scores are **recency-weighted**: a 2024 model cannot outrank a 2026 model with an outdated score.

### 6.4 Core — Ranking

Each model gets a composite 0–100 score:

```
score = (benchmark_quality × 0.5)
      + (vram_fit × 0.25)
      + (speed_estimate × 0.15)
      + (recency × 0.10)
```

- **benchmark_quality**: merged benchmark score, confidence-discounted by tier
- **vram_fit**: how well the model fits within available VRAM (penalized if it requires offload)
- **speed_estimate**: estimated tokens/sec based on model size, quant, and hardware bandwidth
- **recency**: newer models get a small boost; stale leaderboard scores are demoted

### 6.5 Commands

#### `whollama` (default)
Detect hardware and show top 10 recommended models.

```
whollama
whollama --top 5
whollama --task coding
whollama --task vision
whollama --task math
whollama --json
```

#### `whollama pull`
Interactively select a model from the recommendations and run `ollama pull`.

```
whollama pull
whollama pull qwen3:14b   # pull specific model directly
```

#### `whollama list`
List all models in the catalog that fit current hardware.

```
whollama list
whollama list --task coding
whollama list --all        # include models that don't fit
```

#### `whollama info <model>`
Show detailed info about a specific model: benchmark scores, sources, VRAM estimate, speed estimate.

```
whollama info qwen3:14b
whollama info llama3.2:3b
```

#### `whollama update`
Force refresh the catalog from `ollama.com/library`.

```
whollama update
```

### 6.6 Flags

| Flag | Description |
|---|---|
| `--gpu <spec>` | Override GPU (e.g. `"RTX 4090"`, `"M2 Max"`) |
| `--ram <gb>` | Override total RAM in GB |
| `--vram <gb>` | Override VRAM in GB |
| `--task <type>` | Filter by task: `coding`, `vision`, `math`, `general` |
| `--top <n>` | Show top N results (default: 10) |
| `--json` | Output as JSON (for scripting/pipelines) |
| `--no-color` | Disable colored output |
| `--offline` | Force offline mode, skip scrape |
| `--verbose` | Show scoring breakdown per model |

---

## 7. Output Format

### Default (table)

```
╭─────────────────────────────── Hardware ───────────────────────────────╮
│ GPU: Apple M1 Pro — 16 GB unified  BW: 200 GB/s                        │
│ RAM: 16 GB  •  Disk: 450 GB free                                        │
╰─────────────────────────────────────────────────────────────────────────╯

  Recommended Models (task: general)

  #   Model               Params   Quant     Score   Speed     Tags
  1   qwen3:14b           14.8B    Q4_K_M    87.4    22 t/s    tools
  2   gemma4:12b          12.0B    Q4_K_M    84.1    28 t/s    vision
  3   llama3.2:3b          3.2B    Q8_0      71.2    65 t/s    tools
  ...

  Top pick: qwen3:14b  •  Run: ollama pull qwen3:14b
```

### JSON (`--json`)

```json
{
  "hardware": { "gpu": "Apple M1 Pro", "vram_gb": 16, "ram_gb": 16 },
  "models": [
    {
      "rank": 1,
      "name": "qwen3:14b",
      "params": 14.8,
      "quant": "Q4_K_M",
      "score": 87.4,
      "speed_tps": 22,
      "tags": ["tools"],
      "benchmark_tier": "direct",
      "pull_command": "ollama pull qwen3:14b"
    }
  ]
}
```

---

## 8. Data Storage

All data stored in `~/.whollama/`:

```
~/.whollama/
├── catalog.json       # cached model catalog (TTL 24h)
├── benchmarks.json    # cached benchmark scores (TTL 7d)
└── config.json        # user preferences
```

---

## 9. Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript (ESM) | Maintainer's primary stack |
| Runtime | Node.js ≥18 | Native fetch, no extra deps |
| CLI framework | Commander.js | Lightweight, widely used |
| Table output | cli-table3 | Clean, well-maintained |
| Spinner | ora | Standard |
| HTML parsing | node-html-parser | For ollama.com scrape |
| Build | tsc | Simple, no bundler needed |
| Distribution | npm (`npx whollama`) | Zero-install friction |

---

## 10. Success Metrics

- `npx whollama` cold start < 3s (excluding catalog fetch)
- Top recommendation matches what community considers best for that hardware class
- Works fully offline with curated fallback
- Zero required config — works out of the box

---

## 11. Open Questions

- Should `whollama pull` spawn an interactive selector (like fzf) or use a simple numbered prompt?
- How frequently should benchmark data be refreshed? (proposal: 7 days TTL)
- Should we support Windows natively or document WSL as the supported path?