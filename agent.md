# AGENT.md — whollama

Instructions for the AI agent implementing this project. Read this before writing any code.

---

## Project Summary

**whollama** is a TypeScript CLI tool (npm package) that detects local hardware and recommends the best Ollama models to run, ranked by real benchmark scores.

- Entry: `npx whollama`
- Docs: See `PRD.md` (what), `ARCHITECTURE.md` (how), `TASKS.md` (checklist)
- Stack: TypeScript ESM, Node.js ≥18, Commander.js, no bundler

---

## Critical Rules

### 1. Always read docs first
Before writing any code, read the relevant section of `ARCHITECTURE.md`. The interfaces defined there are the source of truth. Do not invent new interfaces without checking first.

### 2. Work one task at a time
Follow `TASKS.md` in order. Complete one task fully before moving to the next. Mark tasks `[x]` when done.

### 3. No throwing to the user
Network failures, detection failures, and missing data must be handled gracefully. Fall through to the next source. Only crash with a clear error message if there is truly no fallback. See ARCHITECTURE.md "Error Handling Philosophy".

### 4. Module boundaries are strict
- `src/hardware/` — only hardware detection, no catalog or scoring logic
- `src/catalog/` — only model catalog management, no scoring
- `src/benchmarks/` — only benchmark data, no scoring
- `src/scorer/` — reads hardware + catalog + benchmarks, outputs scored models
- `src/cli/` — only presentation and user interaction, no business logic
- `src/utils/` — pure utilities, no domain logic

No module should import from a module outside its allowed dependencies:

```
cli → scorer → (hardware, catalog, benchmarks)
cli → utils
scorer → utils
catalog → utils
benchmarks → utils
hardware → utils
```

### 5. All file I/O goes through `src/utils/storage.ts`
Never call `fs.readFile` / `fs.writeFile` directly in other modules. Use `readJson` / `writeJson` from storage utils.

### 6. All network calls go through `src/utils/fetch.ts`
Never call native `fetch` directly. Use the wrapper that handles timeout + retry + null-on-failure.

### 7. ESM only
The project uses `"type": "module"`. All imports must include `.js` extension (TypeScript ESM convention). No CommonJS `require()`.

```ts
// correct
import { detectHardware } from './hardware/index.js'

// wrong
const hw = require('./hardware')
import { detectHardware } from './hardware'
```

---

## Coding Conventions

### TypeScript
- Strict mode is on. No `any`. Use `unknown` and narrow.
- Prefer `interface` over `type` for object shapes.
- All exported functions must have explicit return types.
- Use `const` everywhere. `let` only when reassignment is needed.

### Async
- Use `async/await` throughout. No raw `.then()` chains.
- Use `Promise.allSettled` (not `Promise.all`) when fetching multiple sources so one failure doesn't abort others.

### Error handling
```ts
// Good — silent fallback
try {
  const data = await fetchSomething()
  return data
} catch {
  return null
}

// Good — explicit degradation with verbose log
try {
  return await scrapeOllama()
} catch (err) {
  logger.verbose('Scrape failed, falling back to cache:', err)
  return null
}
```

### Naming
- Files: `kebab-case.ts`
- Types/Interfaces: `PascalCase`
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- CLI flags: `--kebab-case`

---

## Hardware Detection Notes

### Apple Silicon
Use `system_profiler SPHardwareDataType -json` — it returns chip name like `"Apple M1 Pro"`.
Bandwidth is **not** reported by system_profiler. Use the hardcoded lookup table in `src/hardware/apple.ts`.

Unified memory means the GPU and CPU share RAM. Set `vram_gb = ram_gb` and `unified = true`.

Apple Silicon memory bandwidth lookup:
```
M1: 68, M1 Pro (10c): 200, M1 Max: 400, M1 Ultra: 800
M2: 100, M2 Pro: 200, M2 Max: 400, M2 Ultra: 800
M3: 100, M3 Pro: 150, M3 Max: 300
M4: 120, M4 Pro: 273, M4 Max: 546
```

### NVIDIA
`nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits`
Returns memory in MB — divide by 1024 for GB.

### AMD
`rocm-smi --showmeminfo vram --json` — check if `rocm-smi` exists before calling.

### Fallback
If no GPU detected, set `vendor: 'cpu-only'`, `vram_gb: 0`, `bandwidth_gbps: 50` (typical DDR4 bandwidth).

---

## Catalog Scraping Notes

Ollama has **no public API** for browsing the library. You must scrape HTML.

Target URL: `https://ollama.com/library?sort=popular`

The page is server-rendered HTML. Parse with `node-html-parser`.

Expected HTML structure (may change — if it breaks, fall back to cache):
```html
<li>
  <a href="/library/qwen3">
    <h2>qwen3</h2>
    <p><!-- description --></p>
    <span><!-- "14B" size labels --></span>
    <span><!-- "1.2M pulls" --></span>
    <span><!-- "4 weeks ago" --></span>
  </a>
</li>
```

For individual model tags (quantizations), fetch `https://ollama.com/library/<name>/tags`.

**Important:** Be a good citizen. Add a `User-Agent: whollama/0.1.0` header. Do not scrape faster than 1 request/second. The TTL is 24h — do not hammer their servers.

---

## Benchmark Score Notes

### LiveBench
- URL: `https://livebench.ai/` (check for public JSON data endpoint)
- Scores are task-specific — average them for a single composite
- Normalize to 0–100 against the known range

### Chatbot Arena ELO
- URL: Check `https://lmarena.ai/` or HuggingFace datasets for latest ELO dump
- ELO range is roughly 800–1400 for current models
- Normalize: `(elo - 800) / (1400 - 800) × 100`

### Open LLM Leaderboard v2
- URL: HuggingFace datasets API — `open-llm-leaderboard/results`
- Take the average score across all benchmarks in the suite

### Score Resolution
Model names on leaderboards use different conventions than Ollama names.
Normalize before matching:
```ts
normalize('Qwen/Qwen3-14B-Instruct') → 'qwen3 14b'
normalize('qwen3:14b') → 'qwen3 14b'
```
Strip: `'/'`, `':'`, `'-'`, `'_'`, quantization suffixes (Q4_K_M etc), `'Instruct'`, `'Chat'`, `'it'` suffixes.

---

## VRAM Estimation

```ts
const QUANT_BITS: Record<string, number> = {
  'Q2_K': 2.6, 'Q3_K_S': 3.0, 'Q3_K_M': 3.35, 'Q3_K_L': 3.6,
  'Q4_0': 4.0, 'Q4_K_S': 4.37, 'Q4_K_M': 4.5,
  'Q5_0': 5.0, 'Q5_K_S': 5.34, 'Q5_K_M': 5.5,
  'Q6_K': 6.56, 'Q8_0': 8.5, 'F16': 16.0, 'F32': 32.0
}

const OVERHEAD = 1.15  // KV cache + activations + framework

function estimateVramGb(params_b: number, quant: string): number {
  const bitsPerParam = QUANT_BITS[quant] ?? 4.5
  return (params_b * 1e9 * (bitsPerParam / 8) * OVERHEAD) / 1e9
}
```

---

## Display Guidelines

### Hardware box
Always show at top. Use chalk blue border.

### Table columns
`#` | `Model` | `Params` | `Quant` | `Score` | `Speed` | `Tags`

- Score: show as `87.4` (one decimal)
- Speed: show as `22 t/s` — add `~` prefix to indicate it's an estimate
- Tags: show as short comma-separated list: `tools, vision`
- Models that require CPU offload: show `⚠` next to VRAM

### Confidence notes
Always show at bottom:
- If top two scores within 1 point: `"Note: top candidates are very close — scores are within margin of error"`
- Show benchmark data date: `"Benchmark snapshot: YYYY-MM-DD"`
- Show catalog source: `"live"` / `"cache"` / `"curated fallback"`

### JSON output
When `--json` is set, suppress ALL non-JSON output (no spinners, no table, no notes). Pure JSON to stdout. Errors to stderr.

---

## Testing Approach

No test framework required for v0.1. Instead, test manually:

1. **Hardware detection**: `npx tsx src/index.ts -- --verbose`
2. **Offline mode**: disconnect network, run `whollama --offline`
3. **GPU simulation**: `whollama --gpu "RTX 4090" --ram 32`
4. **JSON piping**: `whollama --json | jq '.models[0].pull_command'`
5. **Task filter**: `whollama --task coding`
6. **Pull flow**: `whollama pull` → select a model → verify `ollama pull` runs

---

## Common Pitfalls

- **`system_profiler` is slow** (~1.5s). Run hardware detection in parallel with catalog fetch.
- **ollama.com HTML structure** will change. Wrap the scraper in try/catch and fall back to cache.
- **ELO normalization range** will shift as new models enter. Use dynamic min/max normalization over the fetched dataset rather than hardcoded bounds.
- **MoE models** (like Qwen3-30B-A3B) report total params but use only active params for speed. Check if model name or description contains "MoE" or "A\d+B" pattern.
- **Apple unified memory**: do not treat it as VRAM cap. The model can use up to ~75% of total RAM. Anything over that risks swapping and terrible performance.

---

## Definition of Done

A feature is done when:
1. It compiles with `tsc` (zero errors)
2. It runs without crashing on the test cases above
3. The corresponding `TASKS.md` entry is marked `[x]`
4. No `any` types in the implementation