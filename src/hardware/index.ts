import * as os from 'os'
import type { HardwareInfo, HardwareOverride } from './types.js'
import { detectAppleGpu } from './apple.js'
import { detectNvidiaGpu } from './nvidia.js'
import { detectAmdGpu } from './amd.js'
import { detectCpu, detectRam } from './cpu.js'
import { detectDiskFreeGb } from './disk.js'

// Combined lookup for manual GPU override matching
const GPU_OVERRIDE_LOOKUP: Record<string, { bandwidth: number; vendor: 'apple' | 'nvidia' | 'amd' }> = {
  // NVIDIA
  'RTX 4090': { bandwidth: 1008, vendor: 'nvidia' },
  'RTX 4080': { bandwidth: 717, vendor: 'nvidia' },
  'RTX 4070': { bandwidth: 504, vendor: 'nvidia' },
  'RTX 3090': { bandwidth: 936, vendor: 'nvidia' },
  'RTX 3080': { bandwidth: 760, vendor: 'nvidia' },
  'RTX 3070': { bandwidth: 448, vendor: 'nvidia' },
  'RTX 3060': { bandwidth: 360, vendor: 'nvidia' },
  // Apple Silicon
  'M1 Ultra': { bandwidth: 800, vendor: 'apple' },
  'M1 Max': { bandwidth: 400, vendor: 'apple' },
  'M1 Pro': { bandwidth: 200, vendor: 'apple' },
  M1: { bandwidth: 68, vendor: 'apple' },
  'M2 Ultra': { bandwidth: 800, vendor: 'apple' },
  'M2 Max': { bandwidth: 400, vendor: 'apple' },
  'M2 Pro': { bandwidth: 200, vendor: 'apple' },
  M2: { bandwidth: 100, vendor: 'apple' },
  'M3 Max': { bandwidth: 300, vendor: 'apple' },
  'M3 Pro': { bandwidth: 150, vendor: 'apple' },
  M3: { bandwidth: 100, vendor: 'apple' },
  'M4 Max': { bandwidth: 546, vendor: 'apple' },
  'M4 Pro': { bandwidth: 273, vendor: 'apple' },
  M4: { bandwidth: 120, vendor: 'apple' },
  // AMD
  'RX 7900 XTX': { bandwidth: 960, vendor: 'amd' },
  'RX 7900 XT': { bandwidth: 800, vendor: 'amd' },
  'RX 7800 XT': { bandwidth: 624, vendor: 'amd' },
}

function lookupGpuOverride(spec: string): { name: string; vendor: 'apple' | 'nvidia' | 'amd'; bandwidth_gbps: number } | null {
  const keys = Object.keys(GPU_OVERRIDE_LOOKUP).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (spec.toLowerCase().includes(key.toLowerCase())) {
      const match = GPU_OVERRIDE_LOOKUP[key]
      return { name: key, vendor: match.vendor, bandwidth_gbps: match.bandwidth }
    }
  }

  // Try to extract vendor from the spec
  let vendor: 'nvidia' | 'amd' | 'apple' = 'nvidia'
  const lowerSpec = spec.toLowerCase()
  if (lowerSpec.includes('rx') || lowerSpec.includes('amd') || lowerSpec.includes('radeon')) {
    vendor = 'amd'
  } else if (lowerSpec.includes('m') && /\bm\d\b/.test(lowerSpec)) {
    vendor = 'apple'
  }

  return { name: spec, vendor, bandwidth_gbps: 200 }
}

export async function detectHardware(overrides?: HardwareOverride): Promise<HardwareInfo> {
  // Run GPU detection and disk detection in parallel
  const [gpuResult, diskResult] = await Promise.allSettled([
    detectGpu(overrides),
    detectDiskFreeGb(),
  ])

  const gpu = gpuResult.status === 'fulfilled' ? gpuResult.value : { name: 'CPU', vendor: 'cpu-only' as const, vram_gb: 0, bandwidth_gbps: 50, unified: false }
  const diskFreeGb = diskResult.status === 'fulfilled' ? diskResult.value : 100

  const cpu = detectCpu()
  const ramGb = overrides?.ram ?? detectRam()

  // For Apple Silicon, vram_gb = ram_gb (unified memory)
  let vramGb = overrides?.vram ?? gpu.vram_gb
  if (gpu.vendor === 'apple' && overrides?.vram === undefined) {
    vramGb = ramGb
  }

  return {
    gpu: { ...gpu, vram_gb: vramGb },
    cpu,
    ram_gb: ramGb,
    disk_free_gb: diskFreeGb,
    os: process.platform as HardwareInfo['os'],
  }
}

async function detectGpu(overrides?: HardwareOverride): Promise<HardwareInfo['gpu']> {
  // Apply GPU name override
  if (overrides?.gpu) {
    const match = lookupGpuOverride(overrides.gpu)
    const vramGb = overrides?.vram ?? 16
    return {
      name: match?.name ?? overrides.gpu,
      vendor: match?.vendor ?? 'nvidia',
      vram_gb: vramGb,
      bandwidth_gbps: match?.bandwidth_gbps ?? 200,
      unified: match?.vendor === 'apple',
    }
  }

  // Try Apple → NVIDIA → AMD → CPU-only
  const apple = await detectAppleGpu()
  if (apple) return apple

  const nvidia = await detectNvidiaGpu()
  if (nvidia) return nvidia

  const amd = await detectAmdGpu()
  if (amd) return amd

  return {
    name: 'CPU',
    vendor: 'cpu-only',
    vram_gb: 0,
    bandwidth_gbps: 50,
    unified: false,
  }
}
