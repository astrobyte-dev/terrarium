import { mkdtemp, readFile, writeFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { downloadFile, type DownloadProgress } from './download'

let dirs: string[] = []
async function tmp() {
  const d = await mkdtemp(join(tmpdir(), 'terr-dl-'))
  dirs.push(d)
  return d
}
afterEach(async () => {
  dirs = []
})

function fetchReturning(body: string, headers: Record<string, string> = {}, ok = true) {
  return (async () => new Response(ok ? body : null, { status: ok ? 200 : 404, headers })) as unknown as typeof fetch
}

describe('downloadFile', () => {
  it('streams to disk, reports progress, and renames off the .part file', async () => {
    const dir = await tmp()
    const dest = join(dir, 'sub', 'file.bin')
    const body = 'x'.repeat(1000)
    const seen: DownloadProgress[] = []
    const result = await downloadFile('http://x/file', dest, {
      fetchImpl: fetchReturning(body, { 'content-length': '1000' }),
      onProgress: (p) => seen.push(p),
    })
    expect(result.ok).toBe(true)
    expect(await readFile(dest, 'utf8')).toBe(body)
    expect(seen.at(-1)?.percent).toBe(100)
    // .part file must be gone after the rename
    await expect(stat(`${dest}.part`)).rejects.toThrow()
  })

  it('is idempotent when the file already exists at the expected size', async () => {
    const dir = await tmp()
    const dest = join(dir, 'file.bin')
    await writeFile(dest, 'y'.repeat(500))
    let fetched = false
    const result = await downloadFile('http://x/file', dest, {
      expectedBytes: 500,
      fetchImpl: (async () => {
        fetched = true
        return new Response('')
      }) as unknown as typeof fetch,
    })
    expect(result.message).toMatch(/already downloaded/)
    expect(fetched).toBe(false)
  })

  it('fails cleanly on HTTP error, leaving no partial file', async () => {
    const dir = await tmp()
    const dest = join(dir, 'file.bin')
    const result = await downloadFile('http://x/file', dest, { fetchImpl: fetchReturning('', {}, false) })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/HTTP 404/)
    await expect(stat(dest)).rejects.toThrow()
  })

  it('rejects a truncated download (size mismatch) rather than keeping it', async () => {
    const dir = await tmp()
    const dest = join(dir, 'file.bin')
    const result = await downloadFile('http://x/file', dest, {
      fetchImpl: fetchReturning('short', { 'content-length': '9999' }),
    })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/size mismatch/)
    await expect(stat(dest)).rejects.toThrow()
  })
})
