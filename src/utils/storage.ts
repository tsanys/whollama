import * as fs from 'fs/promises'
import * as path from 'path'
import * as os from 'os'

const WHOLAMA_DIR = path.join(os.homedir(), '.whollama')

async function ensureDir(dir: string): Promise<void> {
  try {
    await fs.mkdir(dir, { recursive: true })
  } catch {
    // directory exists or can't be created — continue
  }
}

export function getWhollamaDir(): string {
  return WHOLAMA_DIR
}

export async function readJson<T>(filename: string): Promise<T | null> {
  try {
    const filePath = path.join(WHOLAMA_DIR, filename)
    const data = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(data) as T
  } catch {
    return null
  }
}

export async function writeJson(
  filename: string,
  data: unknown,
): Promise<void> {
  await ensureDir(WHOLAMA_DIR)
  const filePath = path.join(WHOLAMA_DIR, filename)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
}

export async function getFileAge(filename: string): Promise<number | null> {
  try {
    const filePath = path.join(WHOLAMA_DIR, filename)
    const stat = await fs.stat(filePath)
    return Date.now() - stat.mtimeMs
  } catch {
    return null
  }
}
