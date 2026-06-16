import * as os from 'os'
import type { HardwareCpu } from './types.js'

export function detectCpu(): HardwareCpu {
  const cpus = os.cpus()
  const cores = cpus.length
  const model = cpus[0]?.model ?? 'Unknown'

  return { model, cores }
}

export function detectRam(): number {
  // os.totalmem() returns bytes -> GB
  return parseFloat((os.totalmem() / (1024 * 1024 * 1024)).toFixed(1))
}
