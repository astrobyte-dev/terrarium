/**
 * Brain catalog for the three doors: local uncensored / hosted
 * OpenAI-compatible / Claude API. Sizes are planning estimates (weights at
 * common quantization + KV-cache per 1k context, fp16). `reasoning: true` is
 * disqualifying for OpenClaw — thinking models spam or return empty replies
 * through its plain pipe (proven repeatedly in production).
 */
export type BrainProvider = 'ollama' | 'arliai' | 'anthropic'

export interface CatalogEntry {
  id: string
  label: string
  kind: 'local' | 'hosted'
  provider: BrainProvider
  /** The `agents.defaults.model.primary` string, or null for guidance-only rows. */
  configRef: string | null
  weightsMb: number | null // null for hosted
  kvMbPer1kCtx: number | null
  reasoning: boolean
  refusalTier: 'uncensored' | 'lenient' | 'strict'
  notes: string
}

export const MODEL_CATALOG: CatalogEntry[] = [
  {
    id: 'dolphin3:8b',
    label: 'Dolphin 3 8B (local)',
    kind: 'local',
    provider: 'ollama',
    configRef: 'ollama/dolphin3:8b',
    weightsMb: 4900,
    kvMbPer1kCtx: 128,
    reasoning: false,
    refusalTier: 'uncensored',
    notes: 'the proven offline fallback; ~25 tok/s on a 4070',
  },
  {
    id: 'mannix/llama3.1-8b-abliterated:latest',
    label: 'Llama 3.1 8B abliterated (local)',
    kind: 'local',
    provider: 'ollama',
    configRef: 'ollama/mannix/llama3.1-8b-abliterated:latest',
    weightsMb: 4700,
    kvMbPer1kCtx: 128,
    reasoning: false,
    refusalTier: 'uncensored',
    notes: 'refusal-removed; powers the photo caption/suggestion helpers',
  },
  {
    id: 'llama3:latest',
    label: 'Llama 3 8B (local)',
    kind: 'local',
    provider: 'ollama',
    configRef: 'ollama/llama3:latest',
    weightsMb: 4700,
    kvMbPer1kCtx: 128,
    reasoning: false,
    refusalTier: 'lenient',
    notes: 'general-purpose; deflects explicit content',
  },
  {
    id: 'huihui_ai/qwen3-abliterated:8b',
    label: 'Qwen 3 8B abliterated (local)',
    kind: 'local',
    provider: 'ollama',
    configRef: 'ollama/huihui_ai/qwen3-abliterated:8b',
    weightsMb: 5000,
    kvMbPer1kCtx: 128,
    reasoning: true,
    refusalTier: 'uncensored',
    notes: 'thinking model — incompatible with OpenClaw regardless of hardware',
  },
  {
    id: 'local-24b-class',
    label: '~24B class model (local)',
    kind: 'local',
    provider: 'ollama',
    configRef: null,
    weightsMb: 14000,
    kvMbPer1kCtx: 200,
    reasoning: false,
    refusalTier: 'lenient',
    notes: 'size-class placeholder for bigger-local-model guidance',
  },
  {
    id: 'local-70b-class',
    label: '~70B class model (local)',
    kind: 'local',
    provider: 'ollama',
    configRef: null,
    weightsMb: 40000,
    kvMbPer1kCtx: 320,
    reasoning: false,
    refusalTier: 'lenient',
    notes: 'size-class placeholder; needs a multi-GPU rig',
  },
  {
    id: 'arliai/Mistral-Medium-3.5-128B',
    label: 'Mistral Medium 3.5 128B (ArliAI, hosted)',
    kind: 'hosted',
    provider: 'arliai',
    configRef: 'arliai/Mistral-Medium-3.5-128B',
    weightsMb: null,
    kvMbPer1kCtx: null,
    reasoning: false,
    refusalTier: 'uncensored',
    notes: 'the production brain; ~$15/mo plan, 1 parallel request',
  },
  {
    id: 'arliai/Gemma-4-31B-DarkIdol',
    label: 'Gemma-4 31B DarkIdol (ArliAI, hosted)',
    kind: 'hosted',
    provider: 'arliai',
    configRef: 'arliai/Gemma-4-31B-DarkIdol',
    weightsMb: null,
    kvMbPer1kCtx: null,
    reasoning: false,
    refusalTier: 'uncensored',
    notes: 'proven fallback on the same ArliAI plan',
  },
  {
    id: 'claude-sonnet',
    label: 'Claude Sonnet (Anthropic API, hosted)',
    kind: 'hosted',
    provider: 'anthropic',
    configRef: 'anthropic/claude-sonnet-5',
    weightsMb: null,
    kvMbPer1kCtx: null,
    reasoning: false,
    refusalTier: 'strict',
    notes: 'smartest door; refuses explicit content — best for SFW personas; per-use cost',
  },
]
