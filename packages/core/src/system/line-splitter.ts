/** Turn a stream of text chunks into trimmed, non-blank lines. */
export function createLineSplitter(onLine: (line: string) => void) {
  let partial = ''
  return {
    push(chunk: string): void {
      const parts = (partial + chunk).split(/\r?\n/)
      partial = parts.pop() ?? ''
      for (const part of parts) {
        if (part.trim() !== '') onLine(part)
      }
    },
    flush(): void {
      if (partial.trim() !== '') onLine(partial)
      partial = ''
    },
  }
}
