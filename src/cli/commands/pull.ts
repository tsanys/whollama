import { execa } from 'execa'
import { recommendCommand } from './recommend.js'
import { selectInteractive } from '../selector.js'
import type { ScoredModel } from '../../scorer/types.js'

export interface PullOptions {
  model?: string
  top?: number
  task?: string
  json?: boolean
  offline?: boolean
  verbose?: boolean
  gpu?: string
  ram?: number
  vram?: number
}

export function validateModelName(model: string): string {
  const trimmed = model.trim()
  if (!trimmed) throw new Error('Model name is required')
  // Allow only ollama-style names: letters, numbers, . _ - : / (no shell metachars, no ANSI)
  if (!/^[A-Za-z0-9._\-:/]+$/.test(trimmed) || trimmed.length > 128) {
    throw new Error(`Invalid model name "${model}"`)
  }
  return trimmed
}

export async function pullCommand(options: PullOptions): Promise<void> {
  // If a model name is provided directly, validate then pull it
  if (options.model) {
    const safeModel = validateModelName(options.model)
    console.log(`Pulling ${safeModel}...`)
    try {
      await execa('ollama', ['pull', safeModel], {
        stdio: 'inherit',
      })
    } catch (err) {
      console.error('Failed to pull model:', err)
      process.exit(1)
    }
    return
  }

  // Otherwise run recommend first to get ranked list
  const results = await recommendCommand(options)

  if (results.length === 0) {
    console.error('No models available to pull.')
    process.exit(1)
  }

  const selected = await selectInteractive(
    results.slice(0, 20).map((m: ScoredModel) => ({
      value: m,
      label: `${m.name.padEnd(24)} score: ${m.composite_score.toFixed(1)}  ${m.pull_command}`,
    })),
    'Select a model to pull',
  )

  if (!selected) {
    console.log('Cancelled.')
    return
  }

  console.log(`\nPulling ${selected.name}...`)
  try {
    await execa('ollama', ['pull', selected.name], { stdio: 'inherit' })
  } catch (err) {
    console.error('Failed to pull model:', err)
    process.exit(1)
  }
}
