// Regenerate the canonical archetype portraits used by the Bot Builder's starter cards.
// Renders one photo per archetype through the same ComfyUI pipeline the app uses, into
// src/renderer/src/assets/archetypes/<id>.png (bundled statically; the cards fall back to
// monogram art for any that are missing). Run when the archetype set or checkpoint changes.
//
//   npx esbuild scripts/gen-archetype-faces.ts --bundle --platform=node --format=cjs \
//     --outfile=<tmp>.cjs && node <tmp>.cjs
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PHOTOREAL_CHECKPOINT, buildTxt2ImgWorkflow, renderImage } from '../../core/src/index'
import { ARCHETYPES } from '../src/renderer/src/data/persona'

const COMFY = 'http://127.0.0.1:8188'
const HERE = dirname(fileURLToPath(import.meta.url))
// FACES_OUT lets a bundled copy (where import.meta.url points elsewhere) target the repo.
const OUT = process.env.FACES_OUT || join(HERE, '..', 'src', 'renderer', 'src', 'assets', 'archetypes')

// Card thumbnails are browse art — keep them tastefully CLOTHED. No outfit token makes
// the checkpoint default to bare shoulders, so give each archetype a fitting outfit and
// push nudity out via the negative.
const NEGATIVE =
  'score_1, score_2, score_3, worst quality, low quality, bad anatomy, bad hands, extra fingers, ' +
  'missing fingers, deformed, watermark, signature, text, cartoon, anime, 3d render, drawing, ' +
  'child, kid, underage, teen, loli, nude, topless, bare shoulders, cleavage, lingerie, nsfw'

const OUTFITS: Record<string, string> = {
  goth: 'wearing a black turtleneck',
  fitness: 'wearing an athletic tank top',
  cottage: 'wearing a floral linen dress',
  cyber: 'wearing a zipped techwear jacket',
  academic: 'wearing a knit cardigan over a blouse',
  lounge: 'wearing an elegant satin evening dress',
  nextdoor: 'wearing a cozy oversized hoodie',
  gamer: 'wearing an oversized graphic tee',
  boss: 'wearing a tailored blazer',
}

// Bone-structure-only variation so the nine faces read as different women (never touch
// complexion/hair — that's ethnicity-coded and lives in each archetype's look).
const VARIANTS = [
  'oval face shape', 'round face shape', 'heart-shaped face', 'high cheekbones',
  'soft delicate bone structure', 'strong defined bone structure', 'slender face', 'square jawline', 'oval face shape',
]

function positive(look: string, variant: string, outfit: string): string {
  return [
    'score_9, score_8_up, score_7_up, photorealistic, raw photo, 1girl, solo',
    `(${look}, adult woman, 24:1.3)`,
    variant,
    outfit,
    'upper body portrait, looking at viewer, detailed face, natural skin, fully clothed, soft studio lighting, plain neutral background',
  ].join(', ')
}

async function download(img: { filename: string; subfolder: string; type: string }): Promise<Buffer | null> {
  const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder ?? '', type: img.type ?? 'output' })
  const res = await fetch(`${COMFY}/view?${q.toString()}`)
  if (!res.ok) return null
  return Buffer.from(await res.arrayBuffer())
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true })
  let ok = 0
  for (let i = 0; i < ARCHETYPES.length; i++) {
    const a = ARCHETYPES[i]!
    const workflow = buildTxt2ImgWorkflow({
      checkpoint: PHOTOREAL_CHECKPOINT,
      positive: positive(a.seed.look, VARIANTS[i % VARIANTS.length]!, OUTFITS[a.id] ?? 'wearing stylish clothing'),
      negative: NEGATIVE,
      width: 576,
      height: 768,
      steps: 22,
      cfg: 6,
      samplerName: 'dpmpp_2m',
      scheduler: 'karras',
      seed: 1000 + i * 7919,
      batchSize: 1,
      filenamePrefix: 'terrarium_archetype',
    })
    process.stdout.write(`[${i + 1}/${ARCHETYPES.length}] ${a.id} (${a.name})... `)
    const r = await renderImage(COMFY, workflow, { timeoutMs: 240_000 })
    if (!r.ok || r.images.length === 0) {
      console.log(`FAILED: ${r.message}`)
      continue
    }
    const bytes = await download(r.images[0]!)
    if (!bytes) {
      console.log('download failed')
      continue
    }
    writeFileSync(join(OUT, `${a.id}.png`), bytes)
    console.log(`saved ${a.id}.png (${(bytes.length / 1024).toFixed(0)}kb)`)
    ok++
  }
  console.log(`\nDONE: ${ok}/${ARCHETYPES.length} archetype faces generated.`)
}

main().catch((e) => {
  console.error('gen-archetype-faces crashed:', e)
  process.exit(1)
})
