import { describe, it, expect } from 'vitest'
import { validateModelName } from '../src/cli/commands/pull.js'
import { findModel } from '../src/cli/commands/info.js'

describe('validateModelName', () => {
  it('accepts ollama-style names', () => {
    expect(validateModelName('qwen3:14b')).toBe('qwen3:14b')
    expect(validateModelName('llama3.2:3b-instruct-q4_K_M')).toBe('llama3.2:3b-instruct-q4_K_M')
  })
  it('rejects shell metachars / empty / too long', () => {
    expect(() => validateModelName('')).toThrow()
    expect(() => validateModelName('a; rm -rf /')).toThrow()
    expect(() => validateModelName('x$(whoami)')).toThrow()
    expect(() => validateModelName('a'.repeat(129))).toThrow()
  })
})

describe('findModel', () => {
  const models = [{ name: 'qwen3:14b' }, { name: 'qwen3:8b' }, { name: 'llama3.2:3b' }]
  it('exact beats prefix beats substring', () => {
    expect(findModel(models, 'qwen3:8b')).toBe(1)
    expect(findModel(models, 'qwen3')).toBe(0)
    expect(findModel(models, 'llama')).toBe(2)
  })
  it('returns -1 when missing', () => {
    expect(findModel(models, 'nope')).toBe(-1)
  })
})
