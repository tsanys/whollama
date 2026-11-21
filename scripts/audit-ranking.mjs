import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import path from 'node:path'
import process from 'node:process'
import console from 'node:console'

const oldRoot = process.argv[2]
if (!oldRoot) throw new Error('Usage: node scripts/audit-ranking.mjs <built-v0.4.1-directory>')
const root = process.cwd()
const load = async (base, file) => import(pathToFileURL(path.resolve(base, file)).href)
const oldScorer = await load(oldRoot, 'dist/scorer/index.js')
const currentScorer = await load(root, 'dist/scorer/index.js')
const normalizer = await load(root, 'dist/benchmarks/normalize.js')
const models = JSON.parse(await readFile('data/catalog.json', 'utf8'))
const scores = JSON.parse(await readFile('data/benchmarks.json', 'utf8'))
const hardware = {
  gpu: { name: 'NVIDIA RTX 4090', vendor: 'nvidia', vram_gb: 24, bandwidth_gbps: 1008, unified: false },
  cpu: { model: 'Audit CPU', cores: 16 },
  ram_gb: 64,
  disk_free_gb: 500,
  os: 'linux',
}
Date.now = () => Date.parse('2026-11-21T00:00:00Z')
const options = { topN: models.length, showAll: true }
const before = oldScorer.scoreModels(models, scores, hardware, options)
const after = currentScorer.scoreModels(models, normalizer.normalizeBenchmarkScores(scores), hardware, options)
const oldByName = new Map(before.map(model => [model.name, model]))
const newByName = new Map(after.map(model => [model.name, model]))
const diff = model => {
  const old = oldByName.get(model.name)
  const current = newByName.get(model.name)
  return {
    name: model.name,
    old_rank: old.rank,
    new_rank: current.rank,
    old_score: old.composite_score,
    new_score: current.composite_score,
    old_benchmark: old.benchmark_score,
    new_benchmark: current.benchmark_score,
    old_tier: old.benchmark_tier,
    new_tier: current.benchmark_tier,
  }
}
const membership = n => ({
  left: before.slice(0, n).filter(model => newByName.get(model.name).rank > n).map(diff),
  entered: after.slice(0, n).filter(model => oldByName.get(model.name).rank > n).map(diff),
})
console.log(JSON.stringify({
  models: models.length,
  input: 'bundled catalog and benchmarks from v0.4.2',
  hardware,
  time: '2026-11-21T00:00:00Z',
  top10: membership(10),
  top25: membership(25),
  biggest_rank_changes: after.map(diff).sort((a, b) => Math.abs(b.new_rank - b.old_rank) - Math.abs(a.new_rank - a.old_rank)).slice(0, 10),
  tier_changes: after.map(diff).filter(row => row.old_tier !== row.new_tier),
}, null, 2))
