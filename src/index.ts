#!/usr/bin/env node

import { Command } from 'commander'
import chalk from 'chalk'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { recommendCommand } from './cli/commands/recommend.js'
import { pullCommand } from './cli/commands/pull.js'
import { listCommand } from './cli/commands/list.js'
import { infoCommand } from './cli/commands/info.js'
import { updateCommand } from './cli/commands/update.js'
import { failSpinner } from './cli/spinner.js'

interface PackageJson {
  version?: string
}

const __dirname = dirname(fileURLToPath(import.meta.url))
let pkg: PackageJson = {}
try {
  pkg = JSON.parse(
    readFileSync(resolve(__dirname, '../package.json'), 'utf-8'),
  )
} catch {
  // fallback version
}

const program = new Command()

program
  .name('whollama')
  .description('Find the best Ollama model for your hardware, ranked by real benchmarks')
  .version(pkg.version ?? '0.1.0')
  .option('--no-color', 'Disable colored output')
  .option('--verbose', 'Show detailed logging')
  .option('--offline', 'Force offline mode')
  .hook('preAction', (cmd) => {
    if (cmd.getOptionValue('noColor')) {
      chalk.level = 0
    }
  })

const VALID_TASKS = new Set([
  'coding',
  'vision',
  'math',
  'tools',
  'embedding',
  'general',
])

function parsePositiveInt(value: string): number {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Expected a positive integer, got "${value}"`)
  }
  return n
}

function parseOptionalPositiveInt(value: string): number {
  return parsePositiveInt(value)
}

function validateTask(task: string | undefined): string | undefined {
  if (task === undefined) return undefined
  if (!VALID_TASKS.has(task)) {
    throw new Error(
      `Invalid --task "${task}". Valid: ${[...VALID_TASKS].join(', ')}`,
    )
  }
  return task
}

function validateRamVram(n: number | undefined, flag: string): number | undefined {
  if (n === undefined) return undefined
  if (!Number.isFinite(n) || n <= 0 || n > 4096) {
    throw new Error(`Invalid --${flag} "${n}". Expected 1..4096 GB.`)
  }
  return n
}

// Default command: recommend
program
  .command('recommend', { isDefault: true, hidden: true })
  .description('Recommend the best models for your hardware (default)')
  .option('--top <n>', 'Number of results to show (1-100)', parsePositiveInt, 10)
  .option('--task <type>', 'Filter by task (coding, vision, math, tools, embedding, general)')
  .option('--json', 'Output as JSON')
  .option('--gpu <spec>', 'Override GPU (e.g. "RTX 4090", "M2 Max")')
  .option('--ram <gb>', 'Override RAM in GB', parseOptionalPositiveInt)
  .option('--vram <gb>', 'Override VRAM in GB', parseOptionalPositiveInt)
  .action(async (opts) => {
    try {
      const top = Math.min(opts.top ?? 10, 100)
      await recommendCommand({
        top,
        task: validateTask(opts.task),
        json: opts.json,
        offline: program.getOptionValue('offline'),
        verbose: program.getOptionValue('verbose'),
        gpu: opts.gpu,
        ram: validateRamVram(opts.ram, 'ram'),
        vram: validateRamVram(opts.vram, 'vram'),
      })
    } catch (err) {
      failSpinner('An error occurred')
      console.error(err)
      process.exit(1)
    }
  })

// pull command
program
  .command('pull')
  .description('Pull a model interactively')
  .argument('[model]', 'Model name to pull directly')
  .option('--top <n>', 'Number of results to show (1-100)', parsePositiveInt, 10)
  .option('--task <type>', 'Filter by task (coding, vision, math, tools, embedding, general)')
  .option('--json', 'Output as JSON')
  .option('--gpu <spec>', 'Override GPU')
  .option('--ram <gb>', 'Override RAM in GB', parseOptionalPositiveInt)
  .option('--vram <gb>', 'Override VRAM in GB', parseOptionalPositiveInt)
  .action(async (model: string | undefined, opts) => {
    try {
      await pullCommand({
        model,
        top: Math.min(opts.top ?? 10, 100),
        task: validateTask(opts.task),
        json: opts.json,
        offline: program.getOptionValue('offline'),
        verbose: program.getOptionValue('verbose'),
        gpu: opts.gpu,
        ram: validateRamVram(opts.ram, 'ram'),
        vram: validateRamVram(opts.vram, 'vram'),
      })
    } catch (err) {
      failSpinner('An error occurred')
      console.error(err)
      process.exit(1)
    }
  })

// list command
program
  .command('list')
  .description('List all models that fit your hardware')
  .option('--task <type>', 'Filter by task (coding, vision, math, tools, embedding, general)')
  .option('--all', 'Include models that do not fit')
  .option('--json', 'Output as JSON')
  .option('--gpu <spec>', 'Override GPU')
  .option('--ram <gb>', 'Override RAM in GB', parseOptionalPositiveInt)
  .option('--vram <gb>', 'Override VRAM in GB', parseOptionalPositiveInt)
  .action(async (opts) => {
    try {
      await listCommand({
        task: validateTask(opts.task),
        all: opts.all,
        json: opts.json,
        offline: program.getOptionValue('offline'),
        verbose: program.getOptionValue('verbose'),
        gpu: opts.gpu,
        ram: validateRamVram(opts.ram, 'ram'),
        vram: validateRamVram(opts.vram, 'vram'),
      })
    } catch (err) {
      failSpinner('An error occurred')
      console.error(err)
      process.exit(1)
    }
  })

// info command
program
  .command('info')
  .description('Show detailed info about a model')
  .argument('<model>', 'Model name (e.g. qwen3:14b)')
  .option('--gpu <spec>', 'Override GPU')
  .option('--ram <gb>', 'Override RAM in GB', parseOptionalPositiveInt)
  .option('--vram <gb>', 'Override VRAM in GB', parseOptionalPositiveInt)
  .action(async (model: string, opts) => {
    try {
      if (!model || !model.trim()) throw new Error('Model name is required')
      await infoCommand({
        modelName: model.trim(),
        offline: program.getOptionValue('offline'),
        verbose: program.getOptionValue('verbose'),
        gpu: opts.gpu,
        ram: validateRamVram(opts.ram, 'ram'),
        vram: validateRamVram(opts.vram, 'vram'),
      })
    } catch (err) {
      failSpinner('An error occurred')
      console.error(err)
      process.exit(1)
    }
  })

// update command
program
  .command('update')
  .description('Force refresh catalog and benchmarks')
  .action(async () => {
    try {
      await updateCommand({
        offline: program.getOptionValue('offline'),
        verbose: program.getOptionValue('verbose'),
      })
    } catch (err) {
      failSpinner('An error occurred')
      console.error(err)
      process.exit(1)
    }
  })

program.parse()
