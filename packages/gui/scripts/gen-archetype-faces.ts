// Regenerate the archetype portraits used by the Bot Builder's starter cards. Renders
// photoreal AND/OR anime variants through the same ComfyUI the app uses, into
// src/renderer/src/assets/archetypes/<id>.png (photo) and <id>-anime.png (anime).
// Loaded via a tolerant glob, so any missing file just falls back to monogram art.
//
//   FACES_MODE=both|realistic|anime   FACES_IDS=all|goth,boss   FACES_OUT=<abs dir>
//   npx esbuild scripts/gen-archetype-faces.ts --bundle --platform=node --format=esm \
//     --outfile=<tmp>.mjs && FACES_OUT=<repo>/.../archetypes node <tmp>.mjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PHOTOREAL_CHECKPOINT, ANIME_CHECKPOINTS, buildTxt2ImgWorkflow, renderImage } from '../../core/src/index'
import { ARCHETYPES } from '../src/renderer/src/data/persona'

const COMFY = 'http://127.0.0.1:8188'
const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = process.env.FACES_OUT || join(HERE, '..', 'src', 'renderer', 'src', 'assets', 'archetypes')
const MODE = (process.env.FACES_MODE || 'both').toLowerCase() // realistic | anime | both
const IDS = (process.env.FACES_IDS || 'all').toLowerCase()
const wantId = (id: string) => IDS === 'all' || IDS.split(',').map((s) => s.trim()).includes(id)

// Card thumbnails are browse art — tastefully CLOTHED. No outfit token defaults to bare
// shoulders, so give each archetype an outfit and push nudity out via the negative.
const PHOTO_NEG =
  'score_1, score_2, score_3, worst quality, low quality, bad anatomy, bad hands, extra fingers, ' +
  'missing fingers, deformed, watermark, signature, text, cartoon, anime, 3d render, drawing, ' +
  'child, kid, underage, teen, loli, nude, topless, bare shoulders, cleavage, lingerie, nsfw, ' +
  'plunging neckline, deep neckline, unbuttoned, revealing outfit'

// Anime uses an illustration checkpoint + booru-style prompt; keep it clothed too.
const ANIME_PREFIX = 'masterpiece, best quality, newest, absurdres, highres, 1girl, solo, '
const ANIME_NEG =
  'worst quality, low quality, lowres, oldest, bad anatomy, bad hands, extra digits, missing fingers, ' +
  'deformed, watermark, signature, username, text, logo, censored, nude, topless, bare shoulders, ' +
  'cleavage, nsfw, plunging neckline, deep neckline, unbuttoned, revealing, child, kid, loli, shota, underage, aged down'

// Force ethnicity where the photoreal checkpoint defaults caucasian and ignores a lone token.
const ETHNIC: Record<string, string> = { gamer: 'east asian korean woman' }

const OUTFITS: Record<string, string> = {
  goth: 'wearing a black turtleneck',
  fitness: 'wearing an athletic tank top',
  cottage: 'wearing a floral linen dress',
  cyber: 'wearing a zipped techwear jacket',
  academic: 'wearing a knit cardigan over a blouse',
  lounge: 'wearing an elegant high-neck long-sleeve satin gown',
  nextdoor: 'wearing a cozy oversized hoodie',
  gamer: 'wearing an oversized graphic tee, medium shot from the waist up',
  boss: 'wearing a white collared blouse buttoned to the neck under a tailored blazer',
}

// Distinct bone structure per id so the nine read as different women.
const VARIANTS: Record<string, string> = {
  goth: 'long slender face, sharp jaw',
  fitness: 'oval athletic face, defined cheekbones',
  cottage: 'soft round face, full cheeks',
  cyber: 'angular androgynous face, strong jaw',
  academic: 'gentle round face, soft features',
  lounge: 'strong defined jaw, high cheekbones',
  nextdoor: 'heart-shaped face, warm features',
  gamer: 'round youthful face, soft cheeks',
  boss: 'sculpted high cheekbones, refined jaw',
}

async function download(img: { filename: string; subfolder: string; type: string }): Promise<Buffer | null> {
  const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder ?? '', type: img.type ?? 'output' })
  const res = await fetch(`${COMFY}/view?${q.toString()}`)
  if (!res.ok) return null
  return Buffer.from(await res.arrayBuffer())
}

async function render(id: string, look: string, kind: 'realistic' | 'anime', seed: number): Promise<boolean> {
  const outfit = OUTFITS[id] ?? 'wearing stylish clothing'
  const variant = VARIANTS[id] ?? 'oval face shape'
  const boost = ETHNIC[id] ? `(${ETHNIC[id]}:1.5), ` : ''
  const workflow =
    kind === 'anime'
      ? buildTxt2ImgWorkflow({
          checkpoint: ANIME_CHECKPOINTS.default,
          positive: `${ANIME_PREFIX}${boost}(${look}:1.1), ${variant}, ${outfit}, upper body portrait, looking at viewer, detailed face, clean simple background`,
          negative: ANIME_NEG,
          width: 576, height: 768, steps: 28, cfg: 6, samplerName: 'euler_ancestral', scheduler: 'normal',
          seed, batchSize: 1, filenamePrefix: 'terrarium_archetype_anime',
        })
      : buildTxt2ImgWorkflow({
          checkpoint: PHOTOREAL_CHECKPOINT,
          positive: `score_9, score_8_up, score_7_up, photorealistic, raw photo, 1girl, solo, ${boost}(${look}, adult woman, 24:1.3), ${variant}, ${outfit}, upper body portrait, looking at viewer, detailed face, natural skin, fully clothed, soft studio lighting, plain neutral background`,
          negative: PHOTO_NEG,
          width: 576, height: 768, steps: 22, cfg: 6, samplerName: 'dpmpp_2m', scheduler: 'karras',
          seed, batchSize: 1, filenamePrefix: 'terrarium_archetype',
        })
  const r = await renderImage(COMFY, workflow, { timeoutMs: 240_000 })
  if (!r.ok || r.images.length === 0) {
    console.log(`  ${kind} FAILED: ${r.message}`)
    return false
  }
  const bytes = await download(r.images[0]!)
  if (!bytes) {
    console.log(`  ${kind} download failed`)
    return false
  }
  const name = kind === 'anime' ? `${id}-anime.png` : `${id}.png`
  writeFileSync(join(OUT, name), bytes)
  console.log(`  saved ${name} (${(bytes.length / 1024).toFixed(0)}kb)`)
  return true
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  console.log(`mode=${MODE} ids=${IDS} out=${OUT}`)
  let ok = 0
  for (let i = 0; i < ARCHETYPES.length; i++) {
    const a = ARCHETYPES[i]!
    if (!wantId(a.id)) continue
    console.log(`[${a.id}] ${a.name}`)
    if (MODE === 'realistic' || MODE === 'both') if (await render(a.id, a.seed.look, 'realistic', 2000 + i * 7919)) ok++
    if (MODE === 'anime' || MODE === 'both') if (await render(a.id, a.seed.look, 'anime', 5000 + i * 6151)) ok++
  }
  console.log(`\nDONE: ${ok} image(s) generated.`)
}

main().catch((e) => {
  console.error('gen-archetype-faces crashed:', e)
  process.exit(1)
})
