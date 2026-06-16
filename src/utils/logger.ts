let isVerbose = false

export function setVerbose(v: boolean): void {
  isVerbose = v
}

export function isVerboseEnabled(): boolean {
  return isVerbose
}

export function verboseLog(...args: unknown[]): void {
  if (isVerbose) {
    console.error('[verbose]', ...args)
  }
}
