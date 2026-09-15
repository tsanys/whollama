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
whollama --verbose        # Show scoring breakdown
whollama --no-color       # Disable colored output

whollama --gpu "RTX 4090" --ram 32   # Simulate hardware (planning)
whollama --gpu "M2 Max" --vram 32

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
- **Multi-source benchmarks** — LiveBench, Chatbot Arena ELO, Open LLM Leaderboard
- **Smart scoring** — composite score factoring benchmark quality, VRAM fit, speed, and recency
- **Offline mode** — bundled fallback catalog and scores work without internet
- **JSON output** — pipe-friendly for scripts and automation
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

  #   Model               Params   Quant     Score   Speed     Tags
  1   qwen3:14b           14.8B    Q4_K_M    87.4    22 t/s    tools
  2   gemma4:12b          12.0B    Q4_K_M    84.1    28 t/s    vision
  3   llama3.2:3b          3.2B    Q8_0      71.2    65 t/s    tools
  ...

  Top pick: qwen3:14b  •  Run: ollama pull qwen3:14b
```

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

## Speed calibration

Estimates are based on memory bandwidth heuristics. `whollama bench` measures your real tokens/sec on a pulled model (via the local Ollama daemon) and saves a calibration ratio to `~/.whollama/config.json` — future recommendations scale their speed estimates by it. Re-run after hardware or driver changes.

## Requirements & troubleshooting

- **Node.js ≥ 20** (CI-tested on 20 and 22).
- **Ollama** must be installed for `whollama pull` — see [ollama.com](https://ollama.com). Without it, recommendation commands (`default`, `list`, `info`) still work; only `pull` fails with `Failed to pull model`.
- **No models match?** Your hardware filter excluded everything — try `whollama list --all` or simulate with `--gpu "RTX 4090"`.

## License

MIT
