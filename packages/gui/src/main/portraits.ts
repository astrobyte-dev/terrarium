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

// Candidates should be DIFFERENT women who all fit the brief — not one face in three
// poses. Each candidate is a separate render with its own far-apart seed AND a distinct
// variation phrase. CRITICAL: these vary BONE STRUCTURE ONLY — never complexion, hair,
// or "girl-next-door"/"freckles"-type wording, which is ethnicity-coded and was
// overriding the identity (a Japanese-American brief rendered as caucasian). Different
// seeds already give expression/hair variety; the ethnicity must come from the identity.
const FACE_VARIANTS = [
  'round face shape',
  'oval face shape',
  'heart-shaped face',
  'square jawline',
  'high cheekbones',
  'soft delicate bone structure',
  'strong defined bone structure',
  'slender face',
]

const HOW_MANY = 3
// The identity carries the ethnicity; on a caucasian-default checkpoint a single
// ethnicity token loses unless it's weighted up. Emphasise the whole identity brief.
const IDENTITY_WEIGHT = 1.35

// Fisher–Yates on a copy — pick `n` distinct variants so the candidates differ.
function pickVariants(n: number): string[] {
  const pool = [...FACE_VARIANTS]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  return pool.slice(0, n)
}

function buildPositive(p: PortraitGenInput, variant: string): string {
  const bits = ['score_9, score_8_up, score_7_up, photorealistic, raw photo, 1girl, solo']
  // The photo Identity is often thin on ethnicity ("Japanese-American" alone), while the
  // Look field carries the concrete markers (skin tone, hair colour/texture, eyes). Fold
  // Look IN and weight the whole brief up, or a caucasian-default checkpoint ignores a
  // lone ethnicity token. No parens in this brief (skin markers ride in `extra`), so the
  // (text:weight) wrap can't nest badly.
  const brief = [p.look, p.identity].map((t) => (t ?? '').trim()).filter(Boolean).join(', ')
  if (brief) bits.push(`(${brief}:${IDENTITY_WEIGHT})`)
  bits.push(variant)
  if (p.extra?.trim()) bits.push(p.extra.trim())
  if (p.outfit.trim()) bits.push(`wearing ${p.outfit.trim()}`)
  if (p.shot.trim()) bits.push(p.shot.trim())
  bits.push('upper body portrait, looking at viewer, detailed face, natural skin')
  return bits.join(', ')
}

// One candidate = its own job (batch 1) with a far-apart random seed. Returns the
// saved terrarium:// URL, or null if that single render failed (others still stand).
async function renderCandidate(input: PortraitGenInput, variant: string, idx: number): Promise<string | null> {
  const workflow = buildTxt2ImgWorkflow({
    checkpoint: PHOTOREAL_CHECKPOINT,
    positive: buildPositive(input, variant),
    negative: NEGATIVE,
    width: 768,
    height: 1024,
    steps: 24,
    cfg: 6,
    samplerName: 'dpmpp_2m',
    scheduler: 'karras',
    seed: Math.floor(Math.random() * 1_000_000_000),
    batchSize: 1,
    filenamePrefix: 'terrarium_portrait',
  })
  const r = await renderImage(COMFY, workflow, { timeoutMs: 240_000 })
  if (!r.ok || r.images.length === 0) return null
  const bytes = await downloadComfy(r.images[0]!)
  if (!bytes) return null
  const name = `p_${Date.now()}_${idx}.png`
  writeFileSync(join(PORTRAITS_DIR, name), bytes)
  return `terrarium://portraits/${name}`
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
    if (!input.identity.trim() && !input.outfit.trim() && !input.shot.trim() && !(input.look ?? '').trim()) {
      return { ok: false, images: [], error: 'fill the Look or Photo pipeline fields (Identity/Outfit/Shot) first' }
    }
    try {
      const variants = pickVariants(HOW_MANY)
      // Sequential (not Promise.all) so ComfyUI renders one at a time — kinder to
      // 12 GB of VRAM, and the checkpoint stays loaded between candidates.
      const images: string[] = []
      let lastError = ''
      for (let i = 0; i < variants.length; i++) {
        try {
          const url = await renderCandidate(input, variants[i]!, images.length)
          if (url) images.push(url)
        } catch (e) {
          lastError = e instanceof Error ? e.message : String(e)
        }
      }
      prune()
      if (images.length === 0) {
        return { ok: false, images: [], error: lastError || 'render finished but no images came back (is ComfyUI running on 8188?)' }
      }
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
