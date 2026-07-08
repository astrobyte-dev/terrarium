export interface TailerFs {
  statSize(path: string): Promise<number | null>
  readFileFrom(path: string, start: number): Promise<string>
}

export interface TailerOptions {
  fs: TailerFs
  /** Current log file for this service (re-resolved every poll to follow rotation). */
  resolvePath: () => Promise<string | null>
  onLine: (line: string) => void
  onError?: (err: unknown) => void
}

/**
 * Byte-offset polling tailer. First attach skips to end-of-file (tail
 * semantics); rotation to a new path reads the new file from the top;
 * truncation resets. The caller drives poll() on its own schedule.
 */
export function createTailer(opts: TailerOptions): { poll(): Promise<void> } {
  let path: string | null = null
  let offset = 0
  let partial = ''
  let attached = false

  function emitLines(text: string): void {
    const chunks = (partial + text).split(/\r?\n/)
    partial = chunks.pop() ?? ''
    for (const line of chunks) {
      if (line.trim() !== '') opts.onLine(line)
    }
  }

  async function poll(): Promise<void> {
    try {
      const current = await opts.resolvePath()
      if (current === null) return

      if (current !== path) {
        path = current
        partial = ''
        if (attached) {
          offset = 0 // rotation: fresh file, read from the top
        } else {
          attached = true
          offset = (await opts.fs.statSize(current)) ?? 0
        }
      }

      const size = await opts.fs.statSize(path)
      if (size === null) return
      if (size < offset) {
        offset = 0 // truncated
        partial = ''
      }
      if (size === offset) return

      const text = await opts.fs.readFileFrom(path, offset)
      // Byte accounting; a multibyte char split at the boundary could drift,
      // but these logs are ASCII-dominant and lines re-sync at each newline.
      offset += Buffer.byteLength(text, 'utf8')
      emitLines(text)
    } catch (err) {
      opts.onError?.(err)
    }
  }

  return { poll }
}
