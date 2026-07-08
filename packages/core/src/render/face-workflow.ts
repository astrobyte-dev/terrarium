import type { ComfyWorkflow } from './workflow'

/**
 * The full companion photo pipeline, transcribed EXACTLY from the proven
 * `generate.py` (rebuilt 2026-07-05): base render → IPAdapter face lock →
 * FaceDetailer face pass → FaceDetailer hand pass. Node IDs mirror the
 * Python so the two stay diffable.
 *
 * The anti-underage negative terms are hard-wired, not caller-supplied —
 * they are a floor, never an option.
 */
export const PHOTOREAL_CHECKPOINT = 'CyberRealisticPony_V17.0_FP16.safetensors'
export const ANIME_CHECKPOINTS = {
  default: 'waiNSFWIllustrious_v100.safetensors',
  noob: 'NoobAI-XL-v1.1.safetensors',
} as const

const NEGATIVE =
  'score_1, score_2, score_3, worst quality, low quality, bad anatomy, bad hands, ' +
  'extra fingers, missing fingers, deformed, watermark, signature, text, cartoon, ' +
  '3d render, anime, drawing, sketch, arm hair, hairy arms, hairy forearms, ' +
  'moles, mole, beauty marks, skin blemishes, freckles, ' +
  'child, kid, underage, teen'

const ANIME_POSITIVE_PREFIX = 'masterpiece, best quality, newest, absurdres, highres, 1girl, solo, '
const ANIME_NEGATIVE =
  'worst quality, low quality, lowres, oldest, bad anatomy, bad hands, ' +
  'extra digits, missing fingers, deformed, watermark, signature, username, ' +
  'text, logo, censored, mosaic censoring, bar censor, convenient censoring, ' +
  'arm hair, hairy arms, hairy forearms, ' +
  'child, kid, loli, shota, underage, aged down'

export interface FaceWorkflowOptions {
  prompt: string
  seed: number
  /** server-side name from ComfyUI /upload/image; enables the face lock */
  refImageName?: string | null
  anime?: boolean
  animeCheckpoint?: string | null
}

export function buildFaceWorkflow(opts: FaceWorkflowOptions): ComfyWorkflow {
  const anime = opts.anime ?? false
  const positive = anime
    ? ANIME_POSITIVE_PREFIX + opts.prompt
    : 'score_9, score_8_up, score_7_up, photorealistic, photo, realistic skin texture, ' + opts.prompt
  const negative = anime ? ANIME_NEGATIVE : NEGATIVE
  const ckpt = anime ? (opts.animeCheckpoint ?? ANIME_CHECKPOINTS.default) : PHOTOREAL_CHECKPOINT
  const [steps, cfg] = anime ? [28, 6.0] : [24, 6.0]
  const sampler = anime ? 'euler_ancestral' : 'dpmpp_2m'
  const scheduler = anime ? 'normal' : 'karras'
  const refName = anime ? null : (opts.refImageName ?? null) // photo refs don't apply to anime style

  const wf: ComfyWorkflow = {
    '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: ckpt } },
    '2': { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 1], text: positive } },
    '3': { class_type: 'CLIPTextEncode', inputs: { clip: ['1', 1], text: negative } },
    '4': { class_type: 'EmptyLatentImage', inputs: { width: 832, height: 1216, batch_size: 1 } },
    '5': {
      class_type: 'KSampler',
      inputs: {
        model: ['1', 0], positive: ['2', 0], negative: ['3', 0], latent_image: ['4', 0],
        seed: opts.seed, steps, cfg, sampler_name: sampler, scheduler, denoise: 1.0,
      },
    },
    '6': { class_type: 'VAEDecode', inputs: { samples: ['5', 0], vae: ['1', 2] } },
  }

  let modelForFaces: unknown = ['1', 0]
  if (refName !== null) {
    wf['10'] = { class_type: 'LoadImage', inputs: { image: refName } }
    wf['11'] = { class_type: 'IPAdapterUnifiedLoader', inputs: { model: ['1', 0], preset: 'PLUS FACE (portraits)' } }
    // start_at 0.2: let the TEXT prompt establish pose/composition first,
    // THEN engage the face reference — engaging at 0 clamps the layout and
    // flattens requested poses; the FaceDetailer pass re-locks the face.
    wf['12'] = {
      class_type: 'IPAdapterAdvanced',
      inputs: {
        model: ['11', 0], ipadapter: ['11', 1], image: ['10', 0],
        weight: 0.8, weight_type: 'ease in-out', combine_embeds: 'concat',
        start_at: 0.2, end_at: 1.0, embeds_scaling: 'V only',
      },
    }
    wf['5']!.inputs.model = ['12', 0]
    modelForFaces = ['12', 0]
  }

  const detailer = (imageFrom: unknown, detectorNode: string, model: unknown, denoise: number) => ({
    class_type: 'FaceDetailer',
    inputs: {
      image: imageFrom, model, clip: ['1', 1], vae: ['1', 2],
      positive: ['2', 0], negative: ['3', 0], bbox_detector: [detectorNode, 0],
      guide_size: 512, guide_size_for: true, max_size: 1024,
      seed: opts.seed, steps: 14, cfg, sampler_name: sampler, scheduler,
      denoise, feather: 5, noise_mask: true, force_inpaint: true,
      bbox_threshold: 0.5, bbox_dilation: 10, bbox_crop_factor: 3.0,
      sam_detection_hint: 'center-1', sam_dilation: 0, sam_threshold: 0.93,
      sam_bbox_expansion: 0, sam_mask_hint_threshold: 0.7,
      sam_mask_hint_use_negative: 'False', drop_size: 10, wildcard: '', cycle: 1,
    },
  })

  wf['20'] = { class_type: 'UltralyticsDetectorProvider', inputs: { model_name: 'bbox/face_yolov8m.pt' } }
  wf['21'] = detailer(['6', 0], '20', modelForFaces, 0.45)
  wf['22'] = { class_type: 'UltralyticsDetectorProvider', inputs: { model_name: 'bbox/hand_yolov8s.pt' } }
  wf['23'] = detailer(['21', 0], '22', ['1', 0], 0.4) // hands never go through the face lock
  wf['7'] = { class_type: 'SaveImage', inputs: { images: ['23', 0], filename_prefix: 'imagegen' } }
  return wf
}

/** /hd path: 4x ESRGAN then lanczos-downscale to the target factor. */
export function buildUpscaleWorkflow(imageName: string, scaleBy = 2.0): ComfyWorkflow {
  return {
    '1': { class_type: 'LoadImage', inputs: { image: imageName } },
    '2': { class_type: 'UpscaleModelLoader', inputs: { model_name: '4x-UltraSharp.pth' } },
    '3': { class_type: 'ImageUpscaleWithModel', inputs: { upscale_model: ['2', 0], image: ['1', 0] } },
    '4': { class_type: 'ImageScaleBy', inputs: { image: ['3', 0], upscale_method: 'lanczos', scale_by: scaleBy / 4.0 } },
    '5': { class_type: 'SaveImage', inputs: { images: ['4', 0], filename_prefix: 'upscaled' } },
  }
}
