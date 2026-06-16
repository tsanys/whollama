# TASKS — whollama

Implementation checklist. Work top-to-bottom. Each task is self-contained and testable.

Status legend: `[ ]` todo · `[x]` done · `[-]` skipped/deferred

---

## Phase 0 — Project Setup

- [x] **T-001** Initialize npm package
  - `npm init` with name `whollama`, version `0.1.0`, type `module`
  - Add `bin.whollama` pointing to `./dist/index.js`
  - Set `engines.node` to `>=18`

- [x] **T-002** Configure TypeScript
  - `tsconfig.json` with `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`
  - `outDir: ./dist`, `rootDir: ./src`, `strict: true`

- [x] **T-003** Install dependencies
  - Runtime: `commander`, `chalk`, `cli-table3`, `ora`, `node-html-parser`, `execa`
  - Dev: `typescript`, `tsx`, `@types/node`

- [x] **T-004** Create project directory structure
  - All directories as defined in ARCHITECTURE.md
  - Empty `index.ts` entry point

- [x] **T-005** Add npm scripts
  - `build`: `tsc`
  - `dev`: `tsx src/index.ts`
  - `prepublishOnly`: `npm run build`

- [x] **T-006** Create `.npmignore`
  - Exclude: `src/`, `docs/`, `*.ts`, `tsconfig.json`, `.github/`
  - Include: `dist/`, `data/`

- [x] **T-007** Write `README.md`
  - Quick install + usage example
  - Feature list
  - Screenshot placeholder

---

## Phase 1 — Hardware Detection

- [x] **T-011** Define `HardwareInfo` interface (`src/hardware/types.ts`)

- [x] **T-012** Apple Silicon detection (`src/hardware/apple.ts`)
  - Run: `system_profiler SPHardwareDataType -json`
  - Extract: chip name, memory GB
  - Run: `system_profiler SPDisplaysDataType -json` for GPU cores
  - Hardcode bandwidth lookup table by chip (M1=68, M1 Pro=200, M1 Max=400, M2=100, M2 Pro=200, M2 Max=400, M3 Pro=150, M3 Max=300, M4=120, M4 Pro=273)
  - Return `vendor: 'apple'`, `unified: true`

- [x] **T-013** NVIDIA detection (`src/hardware/nvidia.ts`)
  - Run: `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits`
  - Parse VRAM in MB → GB
  - Hardcode bandwidth lookup table for common GPUs (RTX 3070=448, 3080=760, 3090=936, 4070=504, 4080=717, 4090=1008 GB/s)

- [x] **T-014** AMD detection (`src/hardware/amd.ts`)
  - Run: `rocm-smi --showmeminfo vram --json`
  - Parse VRAM total
  - Bandwidth lookup table for common AMD GPUs

- [x] **T-015** CPU + RAM detection (`src/hardware/cpu.ts`)
  - Use `os.cpus()` for model + core count
  - Use `os.totalmem()` for RAM in GB

- [x] **T-016** Disk space detection (`src/hardware/disk.ts`)
  - Run: `df -k $HOME` on Linux/macOS, `wmic` on Windows
  - Parse free GB

- [x] **T-017** Main `detectHardware()` function (`src/hardware/index.ts`)
  - Try Apple → try NVIDIA → try AMD → fallback CPU-only
  - Merge with CPU + RAM + disk
  - Accept optional overrides: `{ gpu?, vram?, ram? }`
  - Export as default

- [x] **T-018** Manual override support
  - Parse `--gpu <spec>` string and match to known GPU lookup table
  - Parse `--ram <gb>` and `--vram <gb>` as direct overrides

---

## Phase 2 — Model Catalog

- [x] **T-021** Define `OllamaModel` interface (`src/catalog/types.ts`)

- [x] **T-022** Create bundled curated catalog (`data/catalog.json`)
  - Include ~50 most popular Ollama models
  - Fields: name, family, params_b, quant, vram_required_gb, ram_required_gb, tags, pulls, updated_at
  - Must include at minimum: llama3.2, qwen3, gemma4, phi4, mistral, deepseek-r1, gemma3, llava, nomic-embed-text, codellama, dolphin, neural-chat, starling, orca-mini, vicuna

- [x] **T-023** Scraper (`src/catalog/scraper.ts`)
  - Fetch `https://ollama.com/library?sort=popular` (paginate if needed)
  - Parse HTML: model name, description, tags (Tools/Vision/Code), pulls count, last updated, size labels (7B, 14B, etc.)
  - For each model, also fetch `https://ollama.com/library/<name>/tags` to get quant variants
  - Return `OllamaModel[]`
  - Handle network errors silently — throw only if totally unrecoverable

- [x] **T-024** Cache layer (`src/catalog/cache.ts`)
  - `readCache()` → parse `~/.whollama/catalog.json`, check age vs TTL (24h)
  - `writeCache(models)` → write to `~/.whollama/catalog.json` with timestamp

- [x] **T-025** Fallback loader (`src/catalog/fallback.ts`)
  - Read and parse `data/catalog.json` bundled with package
  - Mark each model with `source: 'curated'`

- [x] **T-026** Main `getCatalog()` function (`src/catalog/index.ts`)
  - Implement resolution order from ARCHITECTURE.md
  - Accept `{ offline?: boolean, forceRefresh?: boolean }` options
  - Return `OllamaModel[]`

---

## Phase 3 — Benchmark Scores

- [x] **T-031** Define `BenchmarkScore`, `ScoreTier` interfaces (`src/benchmarks/types.ts`)

- [x] **T-032** Create bundled curated benchmark scores (`data/benchmarks.json`)
  - Cover all models in `data/catalog.json`
  - Include normalized 0–100 score + source breakdown

- [x] **T-033** LiveBench fetcher (`src/benchmarks/livebench.ts`)
  - Fetch latest results from LiveBench public data
  - Normalize scores to 0–100
  - Return `Map<string, number>`

- [x] **T-034** Chatbot Arena ELO fetcher (`src/benchmarks/arena.ts`)
  - Fetch ELO scores from LMSYS public leaderboard data
  - Normalize ELO range to 0–100
  - Return `Map<string, number>`

- [x] **T-035** Open LLM Leaderboard fetcher (`src/benchmarks/openllm.ts`)
  - Fetch from Hugging Face Open LLM Leaderboard v2 dataset API
  - Normalize to 0–100
  - Return `Map<string, number>`

- [x] **T-036** Score resolver (`src/benchmarks/resolver.ts`)
  - `resolveScore(modelName, allScores)` → `BenchmarkScore`
  - Implement 5-tier resolution: direct → variant → family → curated → none
  - Normalize model name before matching (lowercase, strip quant suffix, replace `-` with spaces)

- [x] **T-037** Benchmark cache layer (`src/benchmarks/cache.ts`)
  - Same pattern as catalog cache — TTL 7 days

- [x] **T-038** Main `getBenchmarkScores()` function (`src/benchmarks/index.ts`)
  - Fetch all three sources concurrently (`Promise.allSettled`)
  - Merge scores (average if multiple sources cover same model)
  - Write to cache on success
  - Fall through to cache → bundled fallback on failure

---

## Phase 4 — Scorer

- [x] **T-041** VRAM estimation (`src/scorer/vram.ts`)
  - `estimateVram(params_b, quant)` → GB
  - Use formula from ARCHITECTURE.md
  - `getVramFit(model, hardware)` → `'full' | 'partial' | 'cpu-only'`
  - Partial = model fits in RAM but not VRAM (CPU offload)

- [x] **T-042** Speed estimation (`src/scorer/speed.ts`)
  - `estimateSpeed(model, hardware)` → tokens/sec
  - Use bandwidth formula from ARCHITECTURE.md
  - Handle MoE models (active params only for speed)
  - Apply efficiency factor by vendor

- [x] **T-043** Recency weighting (`src/scorer/recency.ts`)
  - `recencyMultiplier(updatedAt)` → 0.8–1.0
  - Models older than 18 months get 0.8×
  - Linear scale between 0 and 18 months

- [x] **T-044** Composite scorer (`src/scorer/composite.ts`)
  - `scoreModel(model, benchmark, hardware)` → `ScoredModel`
  - Apply formula from PRD Section 6.4
  - Attach `rank`, `speed_tps`, `vram_fit`, `pull_command`

- [x] **T-045** Main `scoreModels()` function (`src/scorer/index.ts`)
  - Filter models by VRAM/RAM fit
  - Apply task tag filter if provided
  - Score all candidates
  - Sort descending by composite score
  - Return top N (default 10)

---

## Phase 5 — CLI Commands

- [x] **T-051** Storage utils (`src/utils/storage.ts`)
  - `getWhollamaDir()` → `~/.whollama/` (create if not exists)
  - `readJson<T>(filename)` → T | null
  - `writeJson(filename, data)` → void

- [x] **T-052** Fetch util (`src/utils/fetch.ts`)
  - Wrapper around native `fetch` with timeout (10s default) and retry (2 attempts)
  - Returns `null` on failure instead of throwing

- [x] **T-053** Display module (`src/cli/display.ts`)
  - `renderTable(results, hardware)` — renders hardware box + ranked table
  - `renderJson(results, hardware)` — JSON.stringify to stdout
  - `renderModelInfo(model, score)` — detail view for `info` command
  - Use chalk for color, cli-table3 for table

- [x] **T-054** `recommend` command (`src/cli/commands/recommend.ts`)
  - Orchestrate: detectHardware → getCatalog → getBenchmarkScores → scoreModels → display
  - Show spinner during each async step
  - Accept all flags from PRD Section 6.6

- [x] **T-055** `pull` command (`src/cli/commands/pull.ts`)
  - Run `recommend` first to get ranked list
  - Show numbered list, prompt user to enter a number
  - Run `execa('ollama', ['pull', selectedModel.name])` with stdio inherited
  - Or accept model name directly: `whollama pull qwen3:14b`

- [x] **T-056** `list` command (`src/cli/commands/list.ts`)
  - Like `recommend` but shows all fitting models (not just top 10)
  - `--all` flag shows even models that don't fit with a warning indicator

- [x] **T-057** `info` command (`src/cli/commands/info.ts`)
  - Lookup model by name in catalog
  - Resolve benchmark score
  - Display: params, quant options, VRAM estimate, speed estimate, benchmark breakdown, score tier

- [x] **T-058** `update` command (`src/cli/commands/update.ts`)
  - Force `getCatalog({ forceRefresh: true })`
  - Force `getBenchmarkScores({ forceRefresh: true })`
  - Show counts of models fetched

- [x] **T-059** Entry point (`src/index.ts`)
  - Wire all commands with Commander.js
  - Add `--version` from `package.json`
  - Add global flags: `--no-color`, `--verbose`, `--offline`
  - Set default command to `recommend`

---

## Phase 6 — Polish & Publishing

- [x] **T-061** Add shebang to compiled output
  - `#!/usr/bin/env node` at top of `dist/index.js`
  - Handled via `esbuild` banner or post-build script

- [x] **T-062** Add `postbuild` script to `chmod +x dist/index.js`

- [x] **T-063** Test cold-start on clean machine (no Ollama required)

- [x] **T-064** Test offline mode (`--offline` flag, no network)

- [x] **T-065** Test GPU simulation (`--gpu "RTX 4090"`)

- [x] **T-066** Test JSON output piping (`whollama --json | jq`)

- [x] **T-067** Publish to npm
  - `npm publish --access public`
  - Verify `npx whollama` works

- [x] **T-068** Write GitHub Actions CI
  - Lint + type-check on push
  - Auto-publish to npm on tag

---

## Deferred / Future

- [ ] Windows native support (currently documented as WSL)
- [ ] `whollama bench` — run a quick local benchmark to calibrate speed estimates
- [ ] Model tag auto-detection from model card (instead of hardcode)
- [ ] fzf-style interactive selector for `whollama pull`
- [ ] Homebrew formula