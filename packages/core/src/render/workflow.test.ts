import { describe, expect, it } from 'vitest'
import { buildTxt2ImgWorkflow } from './workflow'

describe('buildTxt2ImgWorkflow', () => {
  it('wires a valid checkpoint→encode→sample→decode→save graph', () => {
    const wf = buildTxt2ImgWorkflow({ checkpoint: 'model.safetensors', positive: 'a cat' })
    expect(wf['4']!.class_type).toBe('CheckpointLoaderSimple')
    expect(wf['4']!.inputs.ckpt_name).toBe('model.safetensors')
    expect(wf['6']!.inputs.text).toBe('a cat')
    // KSampler references model, conditioning, and latent by node output
    expect(wf['3']!.inputs.model).toEqual(['4', 0])
    expect(wf['3']!.inputs.positive).toEqual(['6', 0])
    expect(wf['3']!.inputs.latent_image).toEqual(['5', 0])
    // SaveImage consumes the VAE decode
    expect(wf['9']!.class_type).toBe('SaveImage')
    expect(wf['9']!.inputs.images).toEqual(['8', 0])
  })

  it('applies turbo-friendly overrides', () => {
    const wf = buildTxt2ImgWorkflow({
      checkpoint: 'sd_xl_turbo.safetensors',
      positive: 'x',
      steps: 1,
      cfg: 1,
      width: 512,
      height: 512,
    })
    expect(wf['3']!.inputs.steps).toBe(1)
    expect(wf['3']!.inputs.cfg).toBe(1)
    expect(wf['5']!.inputs.width).toBe(512)
  })
})
