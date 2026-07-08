import type { ComfyWorkflow } from './workflow'

export interface RenderedImage {
  filename: string
  subfolder: string
  type: string
}

export interface RenderResult {
  ok: boolean
  promptId: string | null
  images: RenderedImage[]
  message: string
}

export interface RenderOptions {
  fetchImpl?: typeof fetch
  pollIntervalMs?: number
  timeoutMs?: number
  onProgress?: (phase: string) => void
}

/**
 * Drive one render through ComfyUI's HTTP API: POST /prompt, then poll
 * /history/{id} until the outputs appear (or timeout). Returns the output
 * image descriptors so the caller can fetch or display them.
 */
export async function renderImage(
  baseUrl: string,
  workflow: ComfyWorkflow,
  opts: RenderOptions = {},
): Promise<RenderResult> {
  const fetchFn = opts.fetchImpl ?? fetch
  const pollIntervalMs = opts.pollIntervalMs ?? 1500
  const deadline = Date.now() + (opts.timeoutMs ?? 180_000)

  let promptId: string
  try {
    opts.onProgress?.('submitting workflow')
    const res = await fetchFn(`${baseUrl}/prompt`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: workflow }),
    })
    if (!res.ok) {
      return { ok: false, promptId: null, images: [], message: `POST /prompt failed: HTTP ${res.status}` }
    }
    const body = (await res.json()) as { prompt_id?: string; error?: unknown; node_errors?: unknown }
    if (typeof body.prompt_id !== 'string') {
      return { ok: false, promptId: null, images: [], message: `prompt rejected: ${JSON.stringify(body.error ?? body.node_errors ?? body)}` }
    }
    promptId = body.prompt_id
  } catch (err) {
    return { ok: false, promptId: null, images: [], message: `submit failed: ${errText(err)}` }
  }

  opts.onProgress?.('rendering')
  while (Date.now() < deadline) {
    await sleep(pollIntervalMs)
    let history: Record<string, unknown>
    try {
      const res = await fetchFn(`${baseUrl}/history/${promptId}`)
      if (!res.ok) continue
      history = (await res.json()) as Record<string, unknown>
    } catch {
      continue
    }
    const entry = history[promptId] as { outputs?: Record<string, { images?: RenderedImage[] }> } | undefined
    if (entry?.outputs === undefined) continue
    const images = Object.values(entry.outputs).flatMap((o) => o.images ?? [])
    if (images.length > 0) {
      return { ok: true, promptId, images, message: `rendered ${images.length} image(s)` }
    }
    // outputs present but no images = a node produced only non-image output; done anyway
    return { ok: true, promptId, images: [], message: 'completed with no image outputs' }
  }
  return { ok: false, promptId, images: [], message: `render timed out after ${Math.round((opts.timeoutMs ?? 180_000) / 1000)}s` }
}

export interface UploadResult {
  ok: boolean
  /** server-side filename to reference in workflows (LoadImage etc.) */
  name: string | null
  message: string
}

/** Upload an image (e.g. a character face reference) into ComfyUI's input folder. */
export async function uploadImage(
  baseUrl: string,
  filename: string,
  bytes: Uint8Array,
  opts: { fetchImpl?: typeof fetch } = {},
): Promise<UploadResult> {
  const fetchFn = opts.fetchImpl ?? fetch
  const form = new FormData()
  form.set('image', new File([bytes as unknown as Blob], filename, { type: 'image/png' }))
  form.set('overwrite', 'true')
  try {
    const res = await fetchFn(`${baseUrl}/upload/image`, { method: 'POST', body: form })
    if (!res.ok) {
      return { ok: false, name: null, message: `upload failed: HTTP ${res.status}` }
    }
    const body = (await res.json()) as { name?: string }
    if (typeof body.name !== 'string') {
      return { ok: false, name: null, message: `upload response had no name: ${JSON.stringify(body)}` }
    }
    return { ok: true, name: body.name, message: `uploaded as ${body.name}` }
  } catch (err) {
    return { ok: false, name: null, message: `upload failed: ${errText(err)}` }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err))
