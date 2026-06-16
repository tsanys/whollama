#!/usr/bin/env node

import { Command } from 'commander'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { recommendCommand } from './cli/commands/recommend.js'
import { pullCommand } from './cli/commands/pull.js'
import { listCommand } from './cli/commands/list.js'
import { infoCommand } from './cli/commands/info.js'
import { updateCommand } from './cli/commands/update.js'
import { startSpinner, stopSpinner, failSpinner } from './cli/spinner.js'

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

// Default command: recommend
program
  .command('recommend', { isDefault: true, hidden: true })
  .description('Recommend the best models for your hardware (default)')
  .option('--top <n>', 'Number of results to show', parseInt, 10)
  .option('--task <type>', 'Filter by task (coding, vision, math, general)')
  .option('--json', 'Output as JSON')
  .option('--gpu <spec>', 'Override GPU (e.g. "RTX 4090", "M2 Max")')
  .option('--ram <gb>', 'Override RAM in GB', parseInt)
  .option('--vram <gb>', 'Override VRAM in GB', parseInt)
  .action(async (opts) => {
    try {
      await recommendCommand({
        top: opts.top,
        task: opts.task,
        json: opts.json,
        offline: program.getOptionValue('offline'),
        verbose: program.getOptionValue('verbose'),
        gpu: opts.gpu,
        ram: opts.ram,
        vram: opts.vram,
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
  .option('--top <n>', 'Number of results to show', parseInt, 10)
  .option('--task <type>', 'Filter by task')
  .option('--json', 'Output as JSON')
  .option('--gpu <spec>', 'Override GPU')
  .option('--ram <gb>', 'Override RAM in GB', parseInt)
  .option('--vram <gb>', 'Override VRAM in GB', parseInt)
  .action(async (model: string | undefined, opts) => {
    try {
      await pullCommand({
        model,
        top: opts.top,
        task: opts.task,
        json: opts.json,
        offline: program.getOptionValue('offline'),
        verbose: program.getOptionValue('verbose'),
        gpu: opts.gpu,
        ram: opts.ram,
        vram: opts.vram,
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
  .option('--task <type>', 'Filter by task')
  .option('--all', 'Include models that do not fit')
  .option('--json', 'Output as JSON')
  .option('--gpu <spec>', 'Override GPU')
  .option('--ram <gb>', 'Override RAM in GB', parseInt)
  .option('--vram <gb>', 'Override VRAM in GB', parseInt)
  .action(async (opts) => {
    try {
      await listCommand({
        task: opts.task,
        all: opts.all,
        json: opts.json,
        offline: program.getOptionValue('offline'),
        verbose: program.getOptionValue('verbose'),
        gpu: opts.gpu,
        ram: opts.ram,
        vram: opts.vram,
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
  .action(async (model: string) => {
    try {
      await infoCommand({
        modelName: model,
        offline: program.getOptionValue('offline'),
        verbose: program.getOptionValue('verbose'),
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
