import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

const DEFAULT_DIR = path.join(os.homedir(), '.whollama')

function whollamaDir(): string {
  // Overridable for tests so they never touch the real cache dir.
  return process.env.WHOLLAMA_DIR ?? DEFAULT_DIR
}

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch {
    // directory exists or can't be created — continue
  }
}

export function getWhollamaDir(): string {
  return whollamaDir()
}

export async function readJson<T>(filename: string): Promise<T | null> {
  try {
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return null
    }
    const filePath = path.join(whollamaDir(), filename)
    const data = await fs.readFile(filePath, 'utf-8')
    const parsed = JSON.parse(data) as T
    if (parsed === null || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

export async function writeJson(
  filename: string,
  data: unknown,
): Promise<void> {
  try {
    if (filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
      return
    }
    await ensureDir(whollamaDir())
    const filePath = path.join(whollamaDir(), filename)
    // Atomic write: tmp + rename (never leave half-written cache)
    const tmpPath = `${filePath}.${process.pid}.tmp`
    await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), {
      encoding: 'utf-8',
      mode: 0o600,
    })
    await fs.rename(tmpPath, filePath)
  } catch {
    // Cache writes must never crash the CLI (offline philosophy)
  }
}

export async function getFileAge(filename: string): Promise<number | null> {
  try {
    const filePath = path.join(whollamaDir(), filename)
    const stat = await fs.stat(filePath)
    return Date.now() - stat.mtimeMs
  } catch {
    return null
  }
}
