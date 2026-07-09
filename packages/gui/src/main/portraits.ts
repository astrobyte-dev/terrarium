import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { PHOTOREAL_CHECKPOINT, buildTxt2ImgWorkflow, renderImage, type RenderedImage } from '@terrarium/core'
import type { PortraitGenInput, PortraitGenResult, PortraitSaveResult } from '../shared/contract'

// Candidate profile portraits for the Bot Builder, rendered on the same ComfyUI the
// photo pipeline uses. The chosen one becomes the character's face reference
// (characters/refs/<slug>.png) so future /pic shots lock to that face.
const COMFY = 'http://127.0.0.1:8188'
const LOCALAPPDATA = process.env['LOCALAPPDATA'] || join(homedir(), 'AppData', 'Local')
export const PORTRAITS_DIR = join(LOCALAPPDATA, 'Terrarium', 'portraits')
const REFS_DIR = join(homedir(), '.openclaw', 'workspace', 'characters', 'refs')
const KEEP = 60

// Anti-underage terms are a hard floor here too (mirrors the photo pipeline's negative).
const NEGATIVE =
  'score_1, score_2, score_3, worst quality, low quality, bad anatomy, bad hands, extra fingers, ' +
  'missing fingers, deformed, watermark, signature, text, cartoon, anime, 3d render, drawing, ' +
  'child, kid, underage, teen, loli'

function buildPositive(p: PortraitGenInput): string {
  const bits = ['score_9, score_8_up, score_7_up, photorealistic, raw photo, 1girl, solo']
  if (p.identity.trim()) bits.push(p.identity.trim())
  if (p.outfit.trim()) bits.push(`wearing ${p.outfit.trim()}`)
  if (p.shot.trim()) bits.push(p.shot.trim())
  bits.push('upper body portrait, looking at viewer, detailed face, natural skin')
  return bits.join(', ')
}

async function downloadComfy(img: RenderedImage): Promise<Buffer | null> {
  const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder ?? '', type: img.type ?? 'output' })
  try {
    const res = await fetch(`${COMFY}/view?${q.toString()}`)
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

function prune(): void {
  try {
    const pngs = readdirSync(PORTRAITS_DIR)
      .filter((f) => f.endsWith('.png'))
      .map((f) => ({ f, m: statSync(join(PORTRAITS_DIR, f)).mtimeMs }))
      .sort((a, b) => a.m - b.m)
    for (const { f } of pngs.slice(0, Math.max(0, pngs.length - KEEP))) unlinkSync(join(PORTRAITS_DIR, f))
  } catch {
    /* best effort */
  }
}

export function setupPortraits(): void {
  mkdirSync(PORTRAITS_DIR, { recursive: true })
  prune()

  ipcMain.handle('portraits:generate', async (_e, input: PortraitGenInput): Promise<PortraitGenResult> => {
    if (!input.identity.trim() && !input.outfit.trim() && !input.shot.trim()) {
      return { ok: false, images: [], error: 'fill the Photo pipeline fields (Identity/Outfit/Shot) first' }
    }
    try {
      const workflow = buildTxt2ImgWorkflow({
        checkpoint: PHOTOREAL_CHECKPOINT,
        positive: buildPositive(input),
        negative: NEGATIVE,
        width: 768,
        height: 1024,
        steps: 24,
        cfg: 6,
        samplerName: 'dpmpp_2m',
        scheduler: 'karras',
        seed: Math.floor(Math.random() * 1_000_000_000),
        batchSize: 3,
        filenamePrefix: 'terrarium_portrait',
      })
      const r = await renderImage(COMFY, workflow, { timeoutMs: 240_000 })
      if (!r.ok) return { ok: false, images: [], error: `${r.message} (is ComfyUI running on 8188?)` }
      const images: string[] = []
      for (const img of r.images) {
        const bytes = await downloadComfy(img)
        if (!bytes) continue
        const name = `p_${Date.now()}_${images.length}.png`
        writeFileSync(join(PORTRAITS_DIR, name), bytes)
        images.push(`terrarium://portraits/${name}`)
      }
      prune()
      if (images.length === 0) return { ok: false, images: [], error: 'render finished but no images came back' }
      return { ok: true, images }
    } catch (e) {
      return { ok: false, images: [], error: e instanceof Error ? e.message : String(e) }
    }
  })

  ipcMain.handle('portraits:saveRef', async (_e, slug: string, url: string): Promise<PortraitSaveResult> => {
    try {
      const src = resolvePortraitImage(url.replace('terrarium://portraits/', ''))
      if (!src) return { ok: false, message: 'that portrait is no longer on disk' }
      mkdirSync(REFS_DIR, { recursive: true })
      copyFileSync(src, join(REFS_DIR, `${slug}.png`))
      return { ok: true, message: `saved as characters/refs/${slug}.png` }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })
}

/** Resolve terrarium://portraits/<name> to an absolute path INSIDE the portraits dir. */
export function resolvePortraitImage(name: string): string | null {
  const clean = decodeURIComponent(name).replace(/^\/+/, '')
  const abs = join(PORTRAITS_DIR, clean)
  const root = PORTRAITS_DIR.endsWith('\\') || PORTRAITS_DIR.endsWith('/') ? PORTRAITS_DIR : PORTRAITS_DIR + '\\'
  if (!abs.startsWith(root) && abs !== PORTRAITS_DIR) return null
  if (!existsSync(abs)) return null
  return abs
}
