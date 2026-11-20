import * as os from 'os'
import { execa } from 'execa'
import * as fs from 'fs/promises'
import { dirname, resolve } from 'path'

async function findExistingPath(path: string): Promise<string | null> {
  let candidate = resolve(path)
  while (true) {
    try {
      await fs.stat(candidate)
      return candidate
    } catch {
      const parent = dirname(candidate)
      if (parent === candidate) return null
      candidate = parent
    }
  }
}

export async function detectDiskFreeGb(): Promise<number | null> {
  const modelPath =
    process.env.OLLAMA_MODELS?.trim() || resolve(os.homedir(), '.ollama', 'models')
  const diskPath = await findExistingPath(modelPath)
  if (!diskPath) return null

  // Try Node native statfs (available on macOS/Linux)
  try {
    const stats = await fs.statfs(diskPath)
    const freeBytes = Number(stats.bsize) * Number(stats.bavail)
    return parseFloat((freeBytes / (1024 * 1024 * 1024)).toFixed(1))
  } catch {
    // fall through to df
  }

  // Fallback: df -k on macOS/Linux
  try {
    const { stdout } = await execa('df', ['-k', diskPath], {
      timeout: 5000,
    })
    // Output: Filesystem  1024-blocks  Used  Available  Capacity  Mounted on
    // /dev/disk1s1  488245284  ...  450000000  ...  /
    const lines = stdout.trim().split('\n')
    if (lines.length < 2) return null
    const parts = lines[1].split(/\s+/)
    const availableKb = parseInt(parts[3], 10)
    if (isNaN(availableKb)) return null
    return parseFloat((availableKb / (1024 * 1024)).toFixed(1))
  } catch {
    return null
  }
}
