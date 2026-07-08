import { describe, expect, it, vi } from 'vitest'
import { MODEL_ASSETS, installModel } from './comfy-models'
import type { DownloadResult } from './download'

describe('MODEL_ASSETS', () => {
  it('marks Civitai (token-gated) assets with a null url', () => {
    const cyber = MODEL_ASSETS.find((a) => a.name.includes('CyberRealisticPony'))!
    expect(cyber.url).toBeNull()
    const wai = MODEL_ASSETS.find((a) => a.name.includes('waiNSFW'))!
    expect(wai.url).toContain('huggingface.co')
  })
})

describe('installModel', () => {
  it('downloads an HF asset into the right models subfolder', async () => {
    const download = vi.fn(async (url: string, dest: string): Promise<DownloadResult> => {
      expect(dest.endsWith('checkpoints\\waiNSFWIllustrious_v100.safetensors')).toBe(true)
      return { ok: true, bytes: 1, message: 'ok' }
    })
    const ensureDir = vi.fn(async () => {})
    const asset = MODEL_ASSETS.find((a) => a.name.includes('waiNSFW'))!
    const result = await installModel(asset, 'C:\\comfy\\models', undefined, { download: download as never, ensureDir })
    expect(result.ok).toBe(true)
    expect(ensureDir).toHaveBeenCalledWith('C:\\comfy\\models\\checkpoints')
  })

  it('returns a manual instruction for token-gated assets without downloading', async () => {
    const download = vi.fn()
    const cyber = MODEL_ASSETS.find((a) => a.name.includes('CyberRealisticPony'))!
    const result = await installModel(cyber, 'C:\\comfy\\models', undefined, { download: download as never })
    expect(result.ok).toBe(false)
    expect(result.manual).toBe(true)
    expect(result.message).toMatch(/manually|token/i)
    expect(download).not.toHaveBeenCalled()
  })
})
