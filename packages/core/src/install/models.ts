import type { InstallOutcome, OnProgress } from './types'

const OLLAMA = 'http://127.0.0.1:11434'

export interface LocalModel {
  name: string
  sizeMb: number
}

export async function listLocalModels(fetchFn: typeof fetch = fetch): Promise<LocalModel[]> {
  try {
    const res = await fetchFn(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(5000) })
    const data = (await res.json()) as { models?: Array<{ name: string; size: number }> }
    return (data.models ?? []).map((m) => ({ name: m.name, sizeMb: Math.round(m.size / 1_048_576) }))
  } catch {
    return []
  }
}

/**
 * Pull a model through Ollama's streaming API — Ollama does the downloading,
 * resuming, and verification; we surface its per-layer progress. Idempotent:
 * pulling an installed model just refreshes the manifest.
 */
export async function pullModel(
  name: string,
  onProgress: OnProgress,
  fetchFn: typeof fetch = fetch,
): Promise<InstallOutcome> {
  const component = `model:${name}` as const
  let res: Response
  try {
    res = await fetchFn(`${OLLAMA}/api/pull`, {
      method: 'POST',
      body: JSON.stringify({ model: name, stream: true }),
    })
  } catch (err) {
    return { ok: false, message: `ollama unreachable: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (res.body === null) return { ok: false, message: 'ollama returned no stream' }

  let sawSuccess = false
  let errorMessage: string | null = null

  const handleLine = (line: string): void => {
    if (line.trim() === '') return
    let event: { status?: string; error?: string; total?: number; completed?: number }
    try {
      event = JSON.parse(line)
    } catch {
      return
    }
    if (event.error !== undefined) {
      errorMessage = event.error
      return
    }
    if (event.status === 'success') sawSuccess = true
    const percent =
      event.total !== undefined && event.completed !== undefined && event.total > 0
        ? Math.round((event.completed / event.total) * 100)
        : null
    onProgress({ component, phase: event.status ?? 'working', percent })
  }

  let partial = ''
  const decoder = new TextDecoder()
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    partial += decoder.decode(chunk, { stream: true })
    const lines = partial.split('\n')
    partial = lines.pop() ?? ''
    for (const line of lines) handleLine(line)
    if (errorMessage !== null) return { ok: false, message: errorMessage }
  }
  handleLine(partial) // streams rarely end with a newline
  if (errorMessage !== null) return { ok: false, message: errorMessage }

  return sawSuccess
    ? { ok: true, message: `${name} ready` }
    : { ok: false, message: `${name}: pull ended without success` }
}
