import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

export interface DownloadProgress {
  receivedBytes: number
  totalBytes: number | null
  percent: number | null
}

export interface DownloadResult {
  ok: boolean
  bytes: number
  message: string
}

export interface DownloadOptions {
  onProgress?: (p: DownloadProgress) => void
  fetchImpl?: typeof fetch
  /** Skip if the destination already exists at the expected size (idempotent). */
  expectedBytes?: number
}

/**
 * Stream a URL to disk with progress, writing to a .part file and renaming on
 * success so a crash never leaves a truncated file looking complete. Used for
 * every large fetch (ComfyUI portable, model checkpoints).
 */
export async function downloadFile(
  url: string,
  destPath: string,
  opts: DownloadOptions = {},
): Promise<DownloadResult> {
  const fetchFn = opts.fetchImpl ?? fetch
  if (opts.expectedBytes !== undefined && (await sizeOf(destPath)) === opts.expectedBytes) {
    return { ok: true, bytes: opts.expectedBytes, message: 'already downloaded' }
  }

  await mkdir(dirname(destPath), { recursive: true })
  const partPath = `${destPath}.part`

  let res: Response
  try {
    res = await fetchFn(url)
  } catch (err) {
    return { ok: false, bytes: 0, message: `download failed: ${errText(err)}` }
  }
  if (!res.ok || res.body === null) {
    return { ok: false, bytes: 0, message: `download failed: HTTP ${res.status}` }
  }

  const totalBytes = toInt(res.headers.get('content-length'))
  let received = 0
  const source = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0])
  source.on('data', (chunk: Buffer) => {
    received += chunk.length
    opts.onProgress?.({
      receivedBytes: received,
      totalBytes,
      percent: totalBytes === null ? null : Math.round((received / totalBytes) * 100),
    })
  })

  try {
    await pipeline(source, createWriteStream(partPath))
  } catch (err) {
    await rm(partPath, { force: true })
    return { ok: false, bytes: received, message: `download interrupted: ${errText(err)}` }
  }

  if (totalBytes !== null && received !== totalBytes) {
    await rm(partPath, { force: true })
    return { ok: false, bytes: received, message: `size mismatch: got ${received} of ${totalBytes}` }
  }
  await rename(partPath, destPath)
  return { ok: true, bytes: received, message: `downloaded ${received} bytes` }
}

async function sizeOf(path: string): Promise<number | null> {
  try {
    return (await stat(path)).size
  } catch {
    return null
  }
}

const toInt = (v: string | null): number | null => {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err))
