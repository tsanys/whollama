import * as readline from 'readline'

/**
 * Zero-dependency fzf-style fuzzy matcher + interactive selector.
 * Pure scoring is unit-testable; only `selectInteractive` touches the TTY.
 */

/** Subsequence fuzzy score (higher = better). Null = no match. */
export function fuzzyScore(query: string, target: string): number | null {
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  if (q.length === 0) return 0
  if (q.length > t.length) return null

  let score = 0
  let ti = 0
  let consecutive = 0

  for (let qi = 0; qi < q.length; qi++) {
    const idx = t.indexOf(q[qi], ti)
    if (idx === -1) return null
    // Bonus: match at start or after a separator (small — consecutive runs matter more)
    if (idx === 0) score += 10
    else if (/[-_:/. ]/.test(t[idx - 1])) score += 3
    // Bonus: consecutive run (grows — favors tight matches over scattered ones)
    consecutive = idx === ti ? consecutive + 1 : 1
    score += consecutive * 8
    // Penalty: gaps between matches
    score -= idx - ti
    ti = idx + 1
  }
  // NOTE: no length penalty by design — callers pass pre-ranked lists and
  // stable sort preserves that order for near-tie scores.
  return score
}

export function filterRanked<T>(
  items: T[],
  query: string,
  key: (item: T) => string,
): T[] {
  const q = query.trim()
  if (!q) return items
  const scored: Array<{ item: T; score: number }> = []
  for (const item of items) {
    const s = fuzzyScore(q, key(item))
    if (s !== null) scored.push({ item, score: s })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map((s) => s.item)
}

export interface SelectChoice<T> {
  value: T
  label: string
}

/**
 * Interactive selector. Returns the chosen value or null on cancel.
 * Falls back to a numbered prompt when stdin is not a TTY.
 */
export async function selectInteractive<T>(
  choices: SelectChoice<T>[],
  prompt = 'Select a model',
): Promise<T | null> {
  if (choices.length === 0) return null
  if (!process.stdin.isTTY) {
    return numberedFallback(choices, prompt)
  }

  return new Promise<T | null>((resolve) => {
    const stdin = process.stdin
    const stdout = process.stdout
    let query = ''
    let highlighted = 0
    let done = false

    const finish = (value: T | null): void => {
      if (done) return
      done = true
      try {
        stdin.setRawMode(false)
      } catch {
        // not a TTY after all — ignore
      }
      stdin.pause()
      stdin.removeListener('data', onData)
      // Clear the selector UI
      stdout.write('\x1B[?25h')
      resolve(value)
    }

    const visible = (): SelectChoice<T>[] =>
      filterRanked(choices, query, (c) => c.label).slice(0, 10)

    // Lines drawn by the previous frame (query line + rows). 0 = nothing yet.
    let frameLines = 0
    const render = (): void => {
      const list = visible()
      if (highlighted >= list.length) highlighted = Math.max(0, list.length - 1)
      if (frameLines > 0) stdout.write(`\x1B[${frameLines}A\x1B[J`)
      stdout.write(`\x1B[?25l> ${query}\n`)
      if (list.length === 0) {
        stdout.write('  (no match)\n')
        frameLines = 2
      } else {
        for (let i = 0; i < list.length; i++) {
          const marker = i === highlighted ? '▸' : ' '
          stdout.write(`  ${marker} ${list[i].label}\n`)
        }
        frameLines = 1 + list.length
      }
    }

    const onData = (buf: Buffer): void => {
      const s = buf.toString('utf8')
      if (s === '\x03' || s === '\x1b') {
        finish(null) // Ctrl-C / Esc
        return
      }
      if (s === '\r' || s === '\n') {
        const list = visible()
        finish(list.length > 0 ? list[highlighted].value : null)
        return
      }
      if (s === '\x7f' || s === '\b') {
        query = query.slice(0, -1)
        highlighted = 0
        render()
        return
      }
      if (s === '\x1b[A' || s === '\x10') {
        highlighted = Math.max(0, highlighted - 1) // Up / Ctrl-P
        render()
        return
      }
      if (s === '\x1b[B' || s === '\x0e') {
        highlighted = Math.min(Math.max(0, visible().length - 1), highlighted + 1) // Down / Ctrl-N
        render()
        return
      }
      // Printable input (ignore other escape sequences)
      if (s >= ' ' && !s.startsWith('\x1b')) {
        query += s
        highlighted = 0
        render()
      }
    }

    // Print usage hint once (outside the redraw frame), then draw
    stdout.write(`\n  ${prompt} (type to filter, ↑↓ navigate, Enter select, Esc cancel)\n`)
    try {
      stdin.setRawMode(true)
    } catch {
      void numberedFallback(choices, prompt).then(finish)
      return
    }
    stdin.resume()
    stdin.on('data', onData)
    render()
  })
}

async function numberedFallback<T>(
  choices: SelectChoice<T>[],
  prompt: string,
): Promise<T | null> {
  console.log(`\n${prompt}:\n`)
  const shown = choices.slice(0, 20)
  shown.forEach((c, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. ${c.label}`)
  })
  console.log()

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  })
  const answer = await new Promise<string>((resolve) => {
    rl.question('  Enter number (or "q" to quit): ', resolve)
  })
  rl.close()

  const num = parseInt(answer, 10)
  if (isNaN(num) || num < 1 || num > shown.length) return null
  return shown[num - 1].value
}
