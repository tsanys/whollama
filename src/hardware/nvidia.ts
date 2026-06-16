import { execa } from 'execa'
import type { HardwareGpu } from './types.js'

const BANDWIDTH_LOOKUP: Record<string, number> = {
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

function getBandwidth(gpuName: string): number {
  const keys = Object.keys(BANDWIDTH_LOOKUP).sort(
    (a, b) => b.length - a.length,
  )
  for (const key of keys) {
    if (gpuName.includes(key)) return BANDWIDTH_LOOKUP[key]
  }
  return 200 // conservative fallback
}

export async function detectNvidiaGpu(): Promise<HardwareGpu | null> {
  try {
    const { stdout } = await execa(
      'nvidia-smi',
      ['--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
      { timeout: 10000 },
    )

    const line = stdout.trim()
    if (!line) return null

    // Format: "NVIDIA GeForce RTX 4090, 24576"
    const [nameRaw, vramMbRaw] = line.split(',').map((s: string) => s.trim())
    const vramMb = parseInt(vramMbRaw, 10)

    if (!nameRaw || isNaN(vramMb)) return null

    const name = nameRaw.replace(/^NVIDIA\s+/i, '')
    const vramGb = vramMb / 1024

    return {
      name,
      vendor: 'nvidia',
      vram_gb: vramGb,
      bandwidth_gbps: getBandwidth(name),
      unified: false,
    }
  } catch {
    return null
  }
}
