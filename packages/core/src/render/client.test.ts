import { describe, expect, it, vi } from 'vitest'
import { renderImage, uploadImage } from './client'
import { buildTxt2ImgWorkflow } from './workflow'

const WF = buildTxt2ImgWorkflow({ checkpoint: 'm.safetensors', positive: 'x' })
const json = (body: unknown, ok = true) =>
  new Response(JSON.stringify(body), { status: ok ? 200 : 500, headers: { 'content-type': 'application/json' } })

describe('renderImage', () => {
  it('submits, polls history, and returns the output images', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ prompt_id: 'p1' })) // POST /prompt
      .mockResolvedValueOnce(json({})) // history empty (still rendering)
      .mockResolvedValueOnce(json({ p1: { outputs: { '9': { images: [{ filename: 'out.png', subfolder: '', type: 'output' }] } } } }))
    const result = await renderImage('http://x', WF, { fetchImpl: fetchImpl as never, pollIntervalMs: 1 })
    expect(result.ok).toBe(true)
    expect(result.promptId).toBe('p1')
    expect(result.images[0]?.filename).toBe('out.png')
  })

  it('surfaces a rejected prompt (validation / node errors)', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ error: 'bad node', node_errors: { '3': 'x' } }))
    const result = await renderImage('http://x', WF, { fetchImpl: fetchImpl as never })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/rejected/)
  })

  it('times out if the render never completes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({ prompt_id: 'p1' })).mockResolvedValue(json({}))
    // first call returns prompt_id, subsequent return empty history forever
    fetchImpl.mockReset()
    fetchImpl.mockResolvedValueOnce(json({ prompt_id: 'p1' }))
    fetchImpl.mockResolvedValue(json({}))
    const result = await renderImage('http://x', WF, { fetchImpl: fetchImpl as never, pollIntervalMs: 1, timeoutMs: 20 })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/timed out/)
  })

  it('fails cleanly when the server is unreachable', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'))
    const result = await renderImage('http://x', WF, { fetchImpl: fetchImpl as never })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/submit failed/)
  })
})

describe('uploadImage', () => {
  it('POSTs the bytes as multipart form data and returns the server-side name', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({ name: 'luna.png' }))
    const result = await uploadImage('http://x', 'luna.png', new Uint8Array([1, 2, 3]), { fetchImpl: fetchImpl as never })
    expect(result.ok).toBe(true)
    expect(result.name).toBe('luna.png')
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://x/upload/image')
    expect(init.method).toBe('POST')
    const form = init.body as FormData
    const file = form.get('image') as File
    expect(file.name).toBe('luna.png')
    expect(form.get('overwrite')).toBe('true')
  })

  it('fails cleanly on a server error', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(json({}, false))
    const result = await uploadImage('http://x', 'a.png', new Uint8Array(), { fetchImpl: fetchImpl as never })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/upload/i)
  })
})
