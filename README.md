# whollama

> Find the best Ollama model for your hardware, ranked by real benchmarks.

Auto-detect your GPU/CPU/RAM and get ranked recommendations from the Ollama library — scored by real benchmark data, not just parameter count.

## Quick Start

```bash
npx @tsany/whollama
```

That's it. whollama detects your hardware, fetches the latest model catalog and benchmark scores, and shows you the top recommendations.

## Install

```bash
npm install -g @tsany/whollama   # global install
# or
npx @tsany/whollama              # zero-install, always latest
# or (macOS)
brew tap tsanys/whollama
brew install whollama
```

## Usage

```
whollama                  # Show top 10 recommended models
whollama --top 5          # Show top 5 (1-100)
whollama --task coding    # Filter by task (coding, vision, math, tools, embedding, general)
whollama --json           # JSON output for scripting
whollama --offline        # Force offline mode (bundled catalog + scores)
whollama --explain        # Show the score factors for each recommendation
whollama --verbose        # Show detailed logs
whollama --no-color       # Disable colored output

whollama --gpu "RTX 4090" --ram 32   # Simulate hardware (planning)
whollama --gpu "M2 Max" --vram 32

whollama compare qwen3:14b llama3.2:3b
whollama compare qwen3:14b llama3.2:3b --offline --json

whollama pull             # Interactive model pull (fuzzy filter)
whollama pull qwen3:14b   # Pull a specific model

whollama list             # List all fitting models
whollama list --all       # List all models (including non-fitting)

whollama info qwen3:14b   # Detailed model info

whollama bench            # Benchmark smallest pulled model, calibrate speeds
whollama bench qwen3:14b  # Benchmark a specific pulled model

whollama update           # Force refresh catalog and benchmarks
```

## Features

- **Hardware auto-detection** — Apple Silicon, NVIDIA, AMD, or CPU-only
- **Live catalog** — scrapes ollama.com/library for the latest models
- **Live benchmarks** — LiveBench dated tables, merged with a curated snapshot for full coverage
- **Smart scoring** — composite score factoring benchmark quality, VRAM fit, speed, and recency
- **Download size estimate** — approximate model weight size from parameter count and quantization
- **Disk check** — flags whether a model fits available space, is tight, or is too large
- **Score explanations** — see the exact benchmark, VRAM, speed, and recency contributions
- **Model comparison** — compare two or more named catalog models, including in offline mode
- **Offline mode** — bundled fallback catalog and scores work without internet
- **JSON output** — includes size estimates, disk fit, score factors, and source/cache freshness
- **Zero config** — no API keys, no setup, no accounts

## How It Works

1. **Detect** — GPU, VRAM, RAM, disk, and OS are auto-detected
2. **Fetch** — Model catalog from Ollama + benchmark scores from multiple sources
3. **Score** — Each model is ranked by a weighted composite of benchmark quality, VRAM fit, estimated speed, and recency
4. **Display** — Top recommendations shown in a formatted table, or as JSON

## Output

```
╭─────────────────────────────── Hardware ───────────────────────────────╮
│ GPU: Apple M1 Pro — 16 GB unified  BW: 200 GB/s                        │
│ RAM: 16 GB  •  Disk: 450 GB free                                        │
╰─────────────────────────────────────────────────────────────────────────╯

  Recommended Models (task: general)

  #   Model               Params   Quant    Est. GB    Disk   Score  Speed    Tags
  1   qwen3:14b           14.0B    Q4_K_M   ~7.9 GB   Fits   87.4   ~22 t/s  tools
  2   gemma4:12b          12.0B    Q4_K_M   ~6.8 GB   Fits   84.1   ~28 t/s  vision
  3   llama3.2:3b          3.0B    Q4_K_M   ~1.7 GB   Fits   71.2   ~65 t/s  tools
  ...

  Top pick: qwen3:14b  •  Run: ollama pull qwen3:14b
```

Download size is an estimate from parameter count and quantization, not an exact registry artifact size. Disk status compares that estimate with free space on the Ollama model volume (`OLLAMA_MODELS`, or the default model directory). `Tight` means the model estimate fits but leaves less than a 1 GB or 10% reserve, whichever is larger. Unknown quantizations or unavailable disk data are shown as unknown rather than guessed.

`--explain` prints each recommendation's weighted score contributions. JSON output always includes the same `score_breakdown` values, plus `benchmark_score`, `estimated_download_gb`, and `disk_fit`. `compare` resolves exact catalog names (case and separators are normalized), ranks the requested models, and reports an error for unknown names.

## Why whollama?

Running local LLMs via Ollama requires answering two questions that are hard to answer together:

1. **What can my hardware run?** — VRAM, RAM, and disk constrain viable models
2. **Which of those is actually the best?** — Parameter count is a poor proxy for quality

whollama answers both in a single command.

## Offline & caching

No network? No problem — whollama ships a bundled catalog and benchmark scores:

| Cache file | TTL | Contents |
|---|---|---|
| `~/.whollama/catalog.json` | 24 hours | Scraped Ollama library models |
| `~/.whollama/benchmarks.json` | 7 days | Merged benchmark scores |

`whollama --offline` skips all network requests and uses the cache (or the bundle on first run). Tiny or corrupt caches are ignored automatically and fall back to the next source.

Recommendation JSON includes a top-level `data_sources` object. Cache entries report whether they are fresh or stale and their age in milliseconds; terminal output shows a compact age.

## Speed calibration

Estimates are based on memory bandwidth heuristics. `whollama bench` measures your real tokens/sec on a pulled model (via the local Ollama daemon) and saves a calibration ratio to `~/.whollama/config.json` — future recommendations scale their speed estimates by it. Re-run after hardware or driver changes.

## Requirements & troubleshooting

- **Node.js ≥ 20** (CI-tested on 20 and 22).
- **Ollama** must be installed for `whollama pull` — see [ollama.com](https://ollama.com). Without it, recommendation commands (`default`, `list`, `info`) still work; only `pull` fails with `Failed to pull model`.
- **No models match?** Your hardware filter excluded everything — try `whollama list --all` or simulate with `--gpu "RTX 4090"`.

## License

MIT
