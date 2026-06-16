# ARCHITECTURE — whollama

## Overview

whollama is a single-package TypeScript CLI tool. No server, no database, no daemon. Everything runs in a single `node` process and state is stored as JSON files in `~/.whollama/`.

---

## Directory Structure

```
whollama/
├── src/
│   ├── index.ts               # Entry point — wires Commander.js commands
│   ├── cli/
│   │   ├── commands/
│   │   │   ├── recommend.ts   # Default command — detect + rank + display
│   │   │   ├── pull.ts        # Interactive pull selector
│   │   │   ├── list.ts        # List all fitting models
│   │   │   ├── info.ts        # Detailed model info
│   │   │   └── update.ts      # Force refresh catalog
│   │   ├── display.ts         # Table renderer, JSON printer
│   │   └── spinner.ts         # ora wrapper
│   ├── hardware/
│   │   ├── index.ts           # Exports detectHardware()
│   │   ├── apple.ts           # Apple Silicon via system_profiler
│   │   ├── nvidia.ts          # NVIDIA via nvidia-smi
│   │   ├── amd.ts             # AMD via rocm-smi
│   │   ├── cpu.ts             # CPU + RAM via os module
│   │   ├── disk.ts            # Free disk space
│   │   └── types.ts           # HardwareInfo interface
│   ├── catalog/
│   │   ├── index.ts           # Exports getCatalog()
│   │   ├── scraper.ts         # Scrape ollama.com/library
│   │   ├── cache.ts           # Read/write ~/.whollama/catalog.json
│   │   ├── fallback.ts        # Load bundled curated catalog
│   │   └── types.ts           # OllamaModel interface
│   ├── benchmarks/
│   │   ├── index.ts           # Exports getBenchmarkScores()
│   │   ├── livebench.ts       # Fetch/parse LiveBench scores
│   │   ├── arena.ts           # Fetch/parse Chatbot Arena ELO
│   │   ├── openllm.ts         # Fetch/parse Open LLM Leaderboard
│   │   ├── resolver.ts        # Match model names → scores (fuzzy)
│   │   ├── cache.ts           # Read/write ~/.whollama/benchmarks.json
│   │   └── types.ts           # BenchmarkScore, ScoreTier interfaces
│   ├── scorer/
│   │   ├── index.ts           # Exports scoreModels()
│   │   ├── vram.ts            # VRAM fit estimation
│   │   ├── speed.ts           # tokens/sec estimation
│   │   ├── recency.ts         # Recency weighting
│   │   └── composite.ts       # Final composite score formula
│   └── utils/
│       ├── storage.ts         # ~/.whollama/ path helpers, read/write JSON
│       ├── fetch.ts           # Fetch with timeout + retry
│       └── logger.ts          # Verbose logging utility
├── data/
│   ├── catalog.json           # Bundled curated catalog (~50 models)
│   └── benchmarks.json        # Bundled curated benchmark scores
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── TASKS.md
│   └── AGENT.md
├── package.json
├── tsconfig.json
├── .npmignore
└── README.md
```

---

## Data Flow

```
whollama (CLI invoked)
        │
        ▼
  Parse CLI flags
  (Commander.js)
        │
        ▼
  ┌─────────────────────────────────────────┐
  │           recommend command             │
  └─────────────────────────────────────────┘
        │
        ├──► detectHardware()
        │         ├── try: apple.ts / nvidia.ts / amd.ts
        │         ├── always: cpu.ts, disk.ts
        │         └── returns: HardwareInfo
        │
        ├──► getCatalog()
        │         ├── try: scrape ollama.com/library
        │         │         └── on success: write cache
        │         ├── fallback: read ~/.whollama/catalog.json (if fresh)
        │         └── fallback: load data/catalog.json (bundled)
        │
        ├──► getBenchmarkScores()
        │         ├── try: fetch LiveBench + Arena ELO + Open LLM
        │         │         └── on success: write cache
        │         ├── fallback: read ~/.whollama/benchmarks.json
        │         └── fallback: load data/benchmarks.json (bundled)
        │
        ├──► scoreModels(catalog, benchmarks, hardware, filters)
        │         ├── filter: models that fit in VRAM/RAM
        │         ├── filter: task tags (if --task given)
        │         ├── for each model:
        │         │     ├── resolve benchmark score (resolver.ts)
        │         │     ├── estimate VRAM fit
        │         │     ├── estimate speed (t/s)
        │         │     ├── apply recency weight
        │         │     └── compute composite score
        │         └── sort descending, return top N
        │
        └──► display(results, flags)
                  ├── --json: JSON.stringify to stdout
                  └── default: render table via cli-table3
```

---

## Key Interfaces

### `HardwareInfo`
```ts
interface HardwareInfo {
  gpu: {
    name: string
    vendor: 'apple' | 'nvidia' | 'amd' | 'cpu-only'
    vram_gb: number
    bandwidth_gbps: number
    unified: boolean       // true for Apple Silicon
  }
  cpu: {
    model: string
    cores: number
  }
  ram_gb: number
  disk_free_gb: number
  os: 'darwin' | 'linux' | 'win32'
}
```

### `OllamaModel`
```ts
interface OllamaModel {
  name: string           // "qwen3:14b"
  family: string         // "qwen3"
  params_b: number       // 14.8
  quant: string          // "Q4_K_M"
  vram_required_gb: number
  ram_required_gb: number
  tags: ModelTag[]       // "tools" | "vision" | "code" | "math" | "embedding"
  pulls: number
  updated_at: string     // ISO date
  source: 'live' | 'cache' | 'curated'
}
```

### `BenchmarkScore`
```ts
interface BenchmarkScore {
  model_id: string
  score: number          // 0-100 normalized
  tier: 'direct' | 'variant' | 'family' | 'curated' | 'none'
  sources: {
    livebench?: number
    arena_elo?: number
    open_llm?: number
  }
  last_updated: string
}
```

### `ScoredModel`
```ts
interface ScoredModel extends OllamaModel {
  rank: number
  composite_score: number
  speed_tps: number
  vram_fit: 'full' | 'partial' | 'cpu-only'
  benchmark_tier: BenchmarkScore['tier']
  pull_command: string
}
```

---

## Catalog Hybrid Strategy

```
getCatalog() resolution order:

1. Check ~/.whollama/catalog.json
   └── if exists AND age < 24h → use it (FRESH CACHE)

2. Attempt live scrape of ollama.com/library
   └── if success → write to ~/.whollama/catalog.json → use it

3. Check ~/.whollama/catalog.json (regardless of age)
   └── if exists → use it (STALE CACHE — better than nothing)

4. Load data/catalog.json (BUNDLED FALLBACK)
   └── always available, ships with npm package
```

---

## Benchmark Score Resolution

The scorer fuzzy-matches model names to benchmark entries using this priority:

```
Input: "qwen3:14b"

Step 1 — direct match:    "qwen3:14b"             in benchmarks? → use it
Step 2 — variant match:   "qwen3-14b", "Qwen3-14B" etc (normalized)?
Step 3 — family + size:   family="qwen3", params=14.8B → interpolate
Step 4 — curated:         check data/benchmarks.json for family entry
Step 5 — none:            score = 0, rank by pulls only
```

---

## VRAM Estimation Formula

Based on community-validated heuristics:

```
vram_bytes = params_b × quant_bits_per_param × 1.15 (overhead factor)

quant_bits:
  Q2_K   → 2.6 bits
  Q3_K_M → 3.35 bits
  Q4_K_M → 4.5 bits
  Q5_K_M → 5.5 bits
  Q6_K   → 6.56 bits
  Q8_0   → 8.5 bits
  F16    → 16 bits
  F32    → 32 bits
```

For Apple Silicon (unified memory), `vram_gb = ram_gb`. Model can use up to 75% of unified memory safely.

---

## Speed Estimation Formula

Rough estimate based on memory bandwidth and model active weights:

```
active_params = params_b  (dense models)
active_params = moe_active_b  (MoE models, if known)

bytes_per_param = quant_bits / 8
model_bytes = active_params × 1e9 × bytes_per_param

tokens_per_sec = bandwidth_gbps × 1e9 / model_bytes
tokens_per_sec × = efficiency_factor  (0.7 for CPU, 0.85 for GPU)
```

This is a ballpark, displayed with appropriate caveats in `--verbose` mode.

---

## Cache & Storage

All files in `~/.whollama/`:

| File | TTL | Description |
|---|---|---|
| `catalog.json` | 24 hours | Scraped Ollama library models |
| `benchmarks.json` | 7 days | Merged benchmark scores |
| `config.json` | — | User preferences (no TTL) |

Storage helpers live in `src/utils/storage.ts`. All reads/writes go through this module — no other file touches the filesystem directly.

---

## Error Handling Philosophy

- **Network failures are silent** — fall through to next catalog/benchmark source without crashing
- **Hardware detection failures** — if GPU detection fails, assume CPU-only and continue
- **Missing benchmark scores** — models without scores are still shown, ranked by pulls, with a `(no benchmark data)` note
- **No throws to user** — all errors are caught, logged in `--verbose` mode, and gracefully degraded

---

## Distribution

```
npm publish → npmjs.com/package/whollama

Usage:
  npx whollama              # zero-install, always latest
  npm install -g whollama   # global install
```

The `data/` directory (curated catalog + benchmarks) is included in the npm package via `files` in `package.json`. The `docs/` and `src/` are excluded from the published package via `.npmignore`.