import * as os from 'os'
import { execa } from 'execa'
import * as fs from 'fs/promises'

export async function detectDiskFreeGb(): Promise<number> {
  // Try Node 18+ native statfs first (macOS/Linux)
  if (typeof fs.statfs === 'function') {
    try {
      const stats = await fs.statfs(os.homedir())
      // bsize * bavail = free bytes
      const freeBytes = Number(stats.bsize) * Number(stats.bavail)
      return parseFloat((freeBytes / (1024 * 1024 * 1024)).toFixed(1))
    } catch {
      // fall through to df
    }
  }

  // Fallback: df -k on macOS/Linux
  try {
    const { stdout } = await execa('df', ['-k', os.homedir()], {
      timeout: 5000,
    })
    // Output: Filesystem  1024-blocks  Used  Available  Capacity  Mounted on
    // /dev/disk1s1  488245284  ...  450000000  ...  /
    const lines = stdout.trim().split('\n')
    if (lines.length < 2) return 100
    const parts = lines[1].split(/\s+/)
    const availableKb = parseInt(parts[3], 10)
    if (isNaN(availableKb)) return 100
    return parseFloat((availableKb / (1024 * 1024)).toFixed(1))
  } catch {
    return 100 // conservative default
  }
}
