import ora from 'ora'

let currentSpinner: ReturnType<typeof ora> | null = null

export function startSpinner(text: string): void {
  currentSpinner = ora({ text, color: 'blue' }).start()
}

export function updateSpinner(text: string): void {
  if (currentSpinner) {
    currentSpinner.text = text
  }
}

export function stopSpinner(text?: string): void {
  if (currentSpinner) {
    if (text) {
      currentSpinner.succeed(text)
    } else {
      currentSpinner.stop()
    }
    currentSpinner = null
  }
}

export function failSpinner(text: string): void {
  if (currentSpinner) {
    currentSpinner.fail(text)
    currentSpinner = null
  }
}
