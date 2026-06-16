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
```

## Usage

```
whollama                  # Show top 10 recommended models
whollama --top 5          # Show top 5
whollama --task coding    # Filter by task (coding, vision, math, general)
whollama --json           # JSON output for scripting
whollama --offline        # Force offline mode
whollama --verbose        # Show scoring breakdown

whollama pull             # Interactive model pull
whollama pull qwen3:14b   # Pull a specific model

whollama list             # List all fitting models
whollama list --all       # List all models (including non-fitting)

whollama info qwen3:14b   # Detailed model info

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

## License

MIT
