import { describe, expect, it } from 'vitest'
import type { ComfyWorkflow } from './workflow'
import {
  ANIME_CHECKPOINTS,
  PHOTOREAL_CHECKPOINT,
  buildFaceWorkflow,
  buildUpscaleWorkflow,
} from './face-workflow'

const photo = (over = {}) => buildFaceWorkflow({ prompt: 'red dress, beach', seed: 7, ...over })
const n = (wf: ComfyWorkflow, id: string) => wf[id]!

describe('buildFaceWorkflow — photoreal base', () => {
  it('mirrors the proven pipeline settings (dpmpp_2m/karras, 24 steps, cfg 6)', () => {
    const wf = photo()
    expect(n(wf, '1').inputs.ckpt_name).toBe(PHOTOREAL_CHECKPOINT)
    expect(n(wf, '5').inputs).toMatchObject({ steps: 24, cfg: 6.0, sampler_name: 'dpmpp_2m', scheduler: 'karras', seed: 7 })
    expect(n(wf, '4').inputs).toMatchObject({ width: 832, height: 1216 })
    expect(n(wf, '2').inputs.text).toContain('score_9')
    expect(n(wf, '2').inputs.text).toContain('red dress, beach')
  })

  it('always runs both detailer passes: face (locked model) then hands (base model)', () => {
    const wf = photo()
    expect(n(wf, '20').inputs.model_name).toBe('bbox/face_yolov8m.pt')
    expect(n(wf, '21').class_type).toBe('FaceDetailer')
    expect(n(wf, '21').inputs.image).toEqual(['6', 0])
    expect(n(wf, '22').inputs.model_name).toBe('bbox/hand_yolov8s.pt')
    expect(n(wf, '23').inputs.image).toEqual(['21', 0])
    expect(n(wf, '23').inputs.model).toEqual(['1', 0]) // hands never go through the face lock
    expect(n(wf, '7').inputs.images).toEqual(['23', 0]) // save AFTER both passes
  })
})

describe('buildFaceWorkflow — face lock', () => {
  it('routes the sampler through IPAdapter with the proven grip settings', () => {
    const wf = photo({ refImageName: 'luna.png' })
    expect(n(wf, '10').inputs.image).toBe('luna.png')
    expect(n(wf, '11').inputs.preset).toBe('PLUS FACE (portraits)')
    expect(n(wf, '12').inputs).toMatchObject({
      weight: 0.8,
      weight_type: 'ease in-out',
      start_at: 0.2, // let the text prompt establish pose before the ref engages
      end_at: 1.0,
    })
    expect(n(wf, '5').inputs.model).toEqual(['12', 0])
    expect(n(wf, '21').inputs.model).toEqual(['12', 0]) // face pass re-locks at high res
  })

  it('without a ref, the sampler and face pass use the base model', () => {
    const wf = photo()
    expect(wf['10']).toBeUndefined()
    expect(n(wf, '5').inputs.model).toEqual(['1', 0])
    expect(n(wf, '21').inputs.model).toEqual(['1', 0])
  })
})

describe('buildFaceWorkflow — anime mode', () => {
  it('switches checkpoint/settings and ignores photo face refs', () => {
    const wf = buildFaceWorkflow({ prompt: 'beach', seed: 1, anime: true, refImageName: 'luna.png' })
    expect(n(wf, '1').inputs.ckpt_name).toBe(ANIME_CHECKPOINTS.default)
    expect(n(wf, '5').inputs).toMatchObject({ steps: 28, cfg: 6.0, sampler_name: 'euler_ancestral', scheduler: 'normal' })
    expect(wf['10']).toBeUndefined() // photo refs don't apply to anime style
    expect(n(wf, '2').inputs.text).toContain('masterpiece')
  })

  it('accepts the alternate anime checkpoint', () => {
    const wf = buildFaceWorkflow({ prompt: 'x', seed: 1, anime: true, animeCheckpoint: ANIME_CHECKPOINTS.noob })
    expect(n(wf, '1').inputs.ckpt_name).toBe(ANIME_CHECKPOINTS.noob)
  })
})

describe('buildFaceWorkflow — safety floor', () => {
  it('photoreal negative always carries the anti-underage terms', () => {
    const neg = n(photo(), '3').inputs.text as string
    for (const term of ['child', 'kid', 'underage', 'teen']) expect(neg).toContain(term)
  })

  it('anime negative always carries the anti-underage terms', () => {
    const wf = buildFaceWorkflow({ prompt: 'x', seed: 1, anime: true })
    const neg = n(wf, '3').inputs.text as string
    for (const term of ['child', 'kid', 'loli', 'shota', 'underage', 'aged down']) expect(neg).toContain(term)
  })

  it('negatives survive a caller-supplied prompt (they are not overridable)', () => {
    const wf = photo({ prompt: 'anything at all' })
    expect(n(wf, '3').inputs.text).toContain('underage')
  })
})

describe('buildUpscaleWorkflow', () => {
  it('runs 4x-UltraSharp then lanczos-downscales to the requested factor', () => {
    const wf = buildUpscaleWorkflow('img.png', 2.0)
    expect(n(wf, '2').inputs.model_name).toBe('4x-UltraSharp.pth')
    expect(n(wf, '4').inputs).toMatchObject({ upscale_method: 'lanczos', scale_by: 0.5 })
    expect(n(wf, '5').class_type).toBe('SaveImage')
  })
})
