/**
 * Minimal txt2img graph in ComfyUI's API (prompt) format — enough to prove a
 * managed install renders. The full face-locked pipeline (IPAdapter +
 * FaceDetailer + custom nodes) is a later milestone; this is the base path.
 */
export interface Txt2ImgOptions {
  checkpoint: string
  positive: string
  negative?: string
  width?: number
  height?: number
  steps?: number
  cfg?: number
  samplerName?: string
  scheduler?: string
  seed?: number
  filenamePrefix?: string
  /** number of images to render in one pass (for candidate portraits). */
  batchSize?: number
}

export type ComfyWorkflow = Record<string, { class_type: string; inputs: Record<string, unknown> }>

export function buildTxt2ImgWorkflow(opts: Txt2ImgOptions): ComfyWorkflow {
  const width = opts.width ?? 768
  const height = opts.height ?? 768
  return {
    '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: opts.checkpoint } },
    '5': { class_type: 'EmptyLatentImage', inputs: { width, height, batch_size: opts.batchSize ?? 1 } },
    '6': { class_type: 'CLIPTextEncode', inputs: { text: opts.positive, clip: ['4', 1] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: opts.negative ?? '', clip: ['4', 1] } },
    '3': {
      class_type: 'KSampler',
      inputs: {
        seed: opts.seed ?? 42,
        steps: opts.steps ?? 20,
        cfg: opts.cfg ?? 7,
        sampler_name: opts.samplerName ?? 'euler',
        scheduler: opts.scheduler ?? 'normal',
        denoise: 1,
        model: ['4', 0],
        positive: ['6', 0],
        negative: ['7', 0],
        latent_image: ['5', 0],
      },
    },
    '8': { class_type: 'VAEDecode', inputs: { samples: ['3', 0], vae: ['4', 2] } },
    '9': {
      class_type: 'SaveImage',
      inputs: { filename_prefix: opts.filenamePrefix ?? 'terrarium', images: ['8', 0] },
    },
  }
}
