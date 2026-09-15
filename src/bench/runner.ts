import { safeFetch } from '../utils/fetch.js'
import { readJson, writeJson } from '../utils/storage.js'

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434'
const BENCH_PROMPT = 'Explain gravity in one sentence.'
const BENCH_NUM_PREDICT = 64

export interface BenchResult {
  model: string
  measured_tps: number
  eval_count: number
  eval_duration_s: number
  wall_s: number
}

export interface SpeedCalibration {
  vendor: string
  ratio: number
  measured_tps: number
  estimated_tps: number
  model: string
  at: string
}

interface UserConfig {
  speedCalibration?: SpeedCalibration
}

/** Measured tokens/sec from eval_count/eval_duration (Ollama reports ns). */
export function tpsFromEval(evalCount: number, evalDurationNs: number): number {
  if (!Number.isFinite(evalCount) || !Number.isFinite(evalDurationNs)) return 0
  if (evalCount <= 0 || evalDurationNs <= 0) return 0
  return Math.round((evalCount / evalDurationNs) * 1e9)
}

/** Calibration ratio, clamped so one noisy sample can't wreck scoring. */
export function calibrationRatio(measuredTps: number, estimatedTps: number): number {
  if (!Number.isFinite(measuredTps) || !Number.isFinite(estimatedTps)) return 1
  if (measuredTps <= 0 || estimatedTps <= 0) return 1
  const raw = measuredTps / estimatedTps
  return Math.min(4, Math.max(0.25, Math.round(raw * 100) / 100))
}

export async function listLocalModels(): Promise<string[]> {
  const res = await safeFetch(`${OLLAMA_HOST}/api/tags`, {
    timeout: 5000,
    retries: 0,
    accept: 'application/json',
  })
  if (!res) return []
  try {
    const data = (await res.json()) as { models?: Array<{ name?: string }> }
    if (!Array.isArray(data.models)) return []
    return data.models
      .map((m) => m?.name)
      .filter((n): n is string => typeof n === 'string' && n.length > 0)
  } catch {
    return []
  }
}

export async function runBench(
  model: string,
  options: { numPredict?: number; timeoutMs?: number } = {},
): Promise<BenchResult> {
  const numPredict = options.numPredict ?? BENCH_NUM_PREDICT
  const timeoutMs = options.timeoutMs ?? 120_000
  const started = Date.now()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let res: Response
  try {
    res = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: BENCH_PROMPT,
        stream: false,
        options: { num_predict: numPredict },
      }),
    })
  } catch (err) {
    clearTimeout(timer)
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`bench timed out after ${timeoutMs / 1000}s`, { cause: err })
    }
    throw new Error('ollama request failed (is `ollama serve` running?)', { cause: err })
  }
  clearTimeout(timer)
  if (!res.ok) {
    throw new Error(`ollama generate failed: HTTP ${res.status}`)
  }
  let data: { eval_count?: number; eval_duration?: number; error?: string }
  try {
    data = (await res.json()) as typeof data
  } catch (err) {
    throw new Error('failed to parse bench result', { cause: err })
  }
  if (typeof data.error === 'string' && data.error) {
    throw new Error(`ollama error: ${data.error}`)
  }
  const wall_s = (Date.now() - started) / 1000
  const eval_count = data.eval_count ?? 0
  const eval_duration_s = (data.eval_duration ?? 0) / 1e9
  return {
    model,
    measured_tps: tpsFromEval(eval_count, data.eval_duration ?? 0),
    eval_count,
    eval_duration_s: Math.round(eval_duration_s * 100) / 100,
    wall_s: Math.round(wall_s * 100) / 100,
  }
}

export async function readCalibration(): Promise<SpeedCalibration | null> {
  const cfg = await readJson<UserConfig>('config.json')
  return cfg?.speedCalibration ?? null
}

export async function writeCalibration(cal: SpeedCalibration): Promise<void> {
  const existing = (await readJson<UserConfig>('config.json')) ?? {}
  await writeJson('config.json', { ...existing, speedCalibration: cal })
}
