import type { SystemPort } from '../system/system-port'
import { downloadFile, type DownloadProgress } from './download'

/**
 * Model assets the companion photo pipeline uses. `url: null` marks assets
 * that need a Civitai account token to download — the fragile piece the
 * design flagged; those are surfaced as manual/advanced rather than failing.
 */
export interface ModelAsset {
  name: string
  subfolder: string // relative to ComfyUI/models
  url: string | null
  approxMb: number
  note: string
}

export const MODEL_ASSETS: ModelAsset[] = [
  {
    name: 'waiNSFWIllustrious_v100.safetensors',
    subfolder: 'checkpoints',
    url: 'https://huggingface.co/Ine007/waiNSFWIllustrious_v100/resolve/main/waiNSFWIllustrious_v100.safetensors',
    approxMb: 6800,
    note: 'anime checkpoint (WAI-NSFW-Illustrious) — default anime model',
  },
  {
    name: 'NoobAI-XL-v1.1.safetensors',
    subfolder: 'checkpoints',
    url: 'https://huggingface.co/Laxhar/noobai-XL-1.1/resolve/main/NoobAI-XL-v1.1.safetensors',
    approxMb: 6600,
    note: 'anime checkpoint (NoobAI-XL) — alternate',
  },
  {
    name: 'CyberRealisticPony_V17.0_FP16.safetensors',
    subfolder: 'checkpoints',
    url: null, // Civitai — needs an account API token (advanced/manual)
    approxMb: 6900,
    note: 'photoreal checkpoint (CyberRealisticPony) — Civitai, needs an API token',
  },
  // Auxiliary models for the face-locked pipeline (FaceDetailer, upscale, IPAdapter).
  {
    name: 'face_yolov8m.pt',
    subfolder: 'ultralytics\\bbox',
    url: 'https://huggingface.co/Bingsu/adetailer/resolve/main/face_yolov8m.pt',
    approxMb: 52,
    note: 'FaceDetailer face detector',
  },
  {
    name: 'hand_yolov8s.pt',
    subfolder: 'ultralytics\\bbox',
    url: 'https://huggingface.co/Bingsu/adetailer/resolve/main/hand_yolov8s.pt',
    approxMb: 22,
    note: 'FaceDetailer hand detector (fixes morphed fingers)',
  },
  {
    name: '4x-UltraSharp.pth',
    subfolder: 'upscale_models',
    url: 'https://huggingface.co/Kim2091/UltraSharp/resolve/main/4x-UltraSharp.pth',
    approxMb: 67,
    note: '/hd upscaler',
  },
  {
    // what IPAdapterUnifiedLoader's "PLUS FACE (portraits)" preset actually loads
    name: 'ip-adapter-plus-face_sdxl_vit-h.safetensors',
    subfolder: 'ipadapter',
    url: 'https://huggingface.co/h94/IP-Adapter/resolve/main/sdxl_models/ip-adapter-plus-face_sdxl_vit-h.safetensors',
    approxMb: 850,
    note: 'IPAdapter plus-face SDXL (face-lock)',
  },
  {
    // the unified loader requires this exact filename in clip_vision
    name: 'CLIP-ViT-H-14-laion2B-s32B-b79K.safetensors',
    subfolder: 'clip_vision',
    url: 'https://huggingface.co/h94/IP-Adapter/resolve/main/models/image_encoder/model.safetensors',
    approxMb: 2500,
    note: 'CLIP vision encoder the IPAdapter presets require',
  },
]

export interface InstallModelResult {
  ok: boolean
  message: string
  manual: boolean
}

/** Download one model asset into the managed ComfyUI models tree (idempotent). */
export async function installModel(
  asset: ModelAsset,
  comfyModelsDir: string,
  onProgress?: (p: DownloadProgress) => void,
  deps: { download?: typeof downloadFile; ensureDir?: SystemPort['ensureDir'] } = {},
): Promise<InstallModelResult> {
  if (asset.url === null) {
    return { ok: false, manual: true, message: `${asset.name} must be downloaded manually — ${asset.note}` }
  }
  const download = deps.download ?? downloadFile
  const dest = `${comfyModelsDir}\\${asset.subfolder}\\${asset.name}`
  await deps.ensureDir?.(`${comfyModelsDir}\\${asset.subfolder}`)
  const result = await download(asset.url, dest, {
    expectedBytes: undefined, // HF sizes vary slightly; presence check is by name
    onProgress,
  })
  return { ok: result.ok, manual: false, message: result.message }
}
