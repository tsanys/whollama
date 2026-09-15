import { execa } from 'execa'
import type { HardwareGpu } from './types.js'

const BANDWIDTH_LOOKUP: Record<string, number> = {
  // Blackwell (verified against NVIDIA spec sheets, GB/s)
  'RTX 5090': 1792,
  'RTX 5080': 960,
  'RTX 5070 Ti': 896,
  'RTX 5070': 672,
  'RTX 5060 Ti': 448,
  'RTX 5060': 448,
  'RTX 4080 SUPER': 736,
  'RTX 6000': 960,
  'L40S': 864,
  'H100': 3350,
  'H200': 4800,
  'B200': 8000,
  'RTX 4090': 1008,
  'RTX 4080': 717,
  'RTX 4070': 504,
  'RTX 3090': 936,
  'RTX 3080': 760,
  'RTX 3070': 448,
  'RTX 3060': 360,
  'RTX 2080': 448,
  'RTX 2070': 448,
  'RTX 2060': 336,
  'RTX 1080': 320,
  'RTX 1070': 256,
  'A100': 1555,
  'A6000': 768,
  'A5000': 640,
  'A4000': 448,
  'V100': 900,
  'T4': 320,
}

export function getNvidiaBandwidth(gpuName: string): number {
  return getBandwidth(gpuName)
}

function getBandwidth(gpuName: string): number {
  const keys = Object.keys(BANDWIDTH_LOOKUP).sort(
    (a, b) => b.length - a.length,
  )
  for (const key of keys) {
    if (gpuName.includes(key)) return BANDWIDTH_LOOKUP[key]
  }
  return 200 // conservative fallback
}

export interface NvidiaSmiGpu {
  name: string
  vramMb: number
}

/** Parse `nvidia-smi --query-gpu=name,memory.total --format=csv,noheader,nounits` (one GPU per line). */
export function parseNvidiaSmi(stdout: string): NvidiaSmiGpu[] {
  const gpus: NvidiaSmiGpu[] = []
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    // lastIndexOf: GPU names themselves may contain commas
    const idx = trimmed.lastIndexOf(',')
    if (idx === -1) continue
    const nameRaw = trimmed.slice(0, idx).trim()
    const vramMb = parseInt(trimmed.slice(idx + 1).trim(), 10)
    if (!nameRaw || isNaN(vramMb)) continue
    gpus.push({ name: nameRaw.replace(/^NVIDIA\s+/i, ''), vramMb })
  }
  return gpus
}

/**
 * Pick the scoring GPU: most VRAM wins. VRAM is the binding constraint for
 * local inference and Ollama does not stripe one model across GPUs, so
 * capacities are intentionally NOT summed.
 */
export function selectPrimaryGpu(gpus: NvidiaSmiGpu[]): NvidiaSmiGpu & { count: number } | null {
  if (gpus.length === 0) return null
  let best = gpus[0]
  for (const g of gpus) {
    if (g.vramMb > best.vramMb) best = g
  }
  return { ...best, count: gpus.length }
}

export async function detectNvidiaGpu(): Promise<HardwareGpu | null> {
  try {
    const { stdout } = await execa(
      'nvidia-smi',
      ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
      { timeout: 10000 },
    )

    const selected = selectPrimaryGpu(parseNvidiaSmi(stdout))
    if (!selected) return null

    // Format: "NVIDIA GeForce RTX 4090, 24576"
    const vramGb = selected.vramMb / 1024
    const name = selected.count > 1 ? `${selected.count}× ${selected.name}` : selected.name

    return {
      name,
      vendor: 'nvidia',
      vram_gb: vramGb,
      bandwidth_gbps: getBandwidth(selected.name),
      unified: false,
    }
  } catch {
    return null
  }
}
