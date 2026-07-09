// The DTO contract across the preload bridge. Imported as TYPES by main
// (produces them from @terrarium/core) and renderer (draws them). Kept free of
// any Node/core import so the renderer can reference it safely.
export type Rung = 'installed' | 'running' | 'responds' | 'live'

export const RUNGS: { key: Rung; label: string }[] = [
  { key: 'installed', label: 'Installed' },
  { key: 'running', label: 'Running' },
  { key: 'responds', label: 'Responds' },
  { key: 'live', label: 'Live' },
]

export type ServiceState = 'live' | 'idle' | 'down'

export interface ServiceView {
  id: string
  name: string
  port: string
  state: ServiceState
  reachedIdx: number // -1 = nothing achieved .. 3 = live
  detail: string
}

export interface GpuView {
  name: string
  totalGb: number
  usedGb: number | null // null until we poll live usage
}

export interface MetaView {
  bot: { name: string; handle: string; live: boolean } | null
  owner: 'terrarium' | 'tasks'
  brain: string
  gpu: GpuView | null
}

export interface LogLine {
  id: number
  ts: string
  svc: string
  msg: string
  level: string
}

export interface CoreState {
  services: ServiceView[]
  meta: MetaView
}

export type ActionType = 'start' | 'stop' | 'restart' | 'restartAll' | 'migrate' | 'release'

export interface ActionRequest {
  type: ActionType
  id?: string
  label?: string // human name for the confirm dialog
}

export interface ActionResult {
  ok: boolean
  message: string
}

// ---- doctor (health check + safe config repair) ----
export interface DoctorCheckView {
  id: string
  title: string
  status: 'ok' | 'warn' | 'fail'
  detail: string
  /** 'regenerate-config' when this check can be fixed by repair; null/absent otherwise. */
  fix?: 'regenerate-config' | null
}
export interface DoctorReportView {
  checks: DoctorCheckView[]
  healthy: boolean
}
export interface DoctorRepairResult {
  ok: boolean
  repaired: boolean
  changed: boolean
  message: string
}

// ---- bot builder (create a companion → full card + AGENTS.md compact card) ----
export interface BotSpecInput {
  slug: string
  displayName: string
  age: number
  look: string
  vibe: string
  loves: string
  relationship: string
  backstory: string
  speechStyle: string[]
  hardRules: string[]
  openerIdeas: string[]
  photo: { identity: string; outfit: string; shot: string }
}
export interface BotPreview {
  ok: boolean
  errors: string[]
  compactCard: string
  currentChars: number
  cardChars: number
  resultChars: number
  headroom: number
  fits: boolean
}
export interface BotCreateResult {
  ok: boolean
  errors: string[]
  wrote: boolean
  backupPath: string | null
  fullCardPath: string | null
}

// ---- profile portraits (Bot Builder: generate candidate faces via ComfyUI) ----
export interface PortraitGenInput {
  identity: string
  outfit: string
  shot: string
  /** The Look field — folded in with identity because it carries the concrete
   *  ethnicity markers (skin tone, hair) the sparse photo Identity often omits. */
  look?: string
  /** Apparent-age + skin cues, kept separate so the identity brief can be weighted
   *  without nesting inside the skin phrase's own parens. */
  extra?: string
}
export interface PortraitGenResult {
  ok: boolean
  images: string[] // terrarium://portraits/… URLs
  error?: string
}
export interface PortraitSaveResult {
  ok: boolean
  message: string
}

// ---- character roster (manage who's in AGENTS.md / the 12k budget) ----
export interface RosterCardView {
  heading: string
  name: string
  age: number
  chars: number
}
export interface RosterView {
  cards: RosterCardView[]
  totalChars: number
  limit: number
  headroom: number
}
export interface CharRemoveResult {
  ok: boolean
  message: string
  roster?: RosterView
}
// Load an existing character back into the Bot Builder form for editing.
export interface CharGetResult {
  ok: boolean
  message?: string
  slug?: string
  heading?: string
  spec?: BotSpecInput
}
// Save edits to an existing character (rewrites full card + swaps its compact card).
export interface CharUpdateResult {
  ok: boolean
  errors: string[]
  wrote: boolean
  backupPath: string | null
  message?: string
}

// ---- bot builder: AI-assisted drafting (local model fills the personality) ----
export type DraftMode = 'sfw' | 'nsfw'
export interface DraftSeedInput {
  displayName: string
  age: number
  concept: string
  mode: DraftMode
}
export interface DraftedPersonaView {
  look: string
  vibe: string
  loves: string
  relationship: string
  backstory: string
  speechStyle: string[]
  openerIdeas: string[]
  photo: { identity: string; outfit: string; shot: string }
}
export interface DraftResult {
  ok: boolean
  error?: string
  persona?: DraftedPersonaView
}
export type DraftFieldKey =
  | 'look'
  | 'vibe'
  | 'loves'
  | 'relationship'
  | 'backstory'
  | 'speechStyle'
  | 'openerIdeas'
  | 'photoIdentity'
  | 'photoOutfit'
  | 'photoShot'
export interface DraftFieldResult {
  ok: boolean
  value?: string | string[]
  error?: string
}

// ---- brains (swap the primary model, edited in-place in openclaw.json) ----
export interface BrainOpt {
  ref: string // provider/id, e.g. arliai/Gemma-4-31B-DarkIdol
  provider: string
  id: string
  contextWindow: number | null
  reasoning: boolean
  kind: 'hosted' | 'local'
}
export interface BrainsList {
  current: string
  models: BrainOpt[]
}
// ref -> liveness. 'local' = an Ollama model (runs here); hosted probed live.
export type BrainLiveness = Record<string, 'up' | 'down' | 'local' | 'unknown'>

// ---- chat (shares agent:main:main with Telegram) ----
export interface ChatMsg {
  role: 'user' | 'assistant'
  text: string
  ts: number | null
  /**
   * terrarium:// URLs of any images on this message. Photos generated by the pic
   * daemon are mirrored into Terrarium's inbox and pushed as assistant messages
   * with these set (text = the caption, if any). Absent/empty for text messages.
   */
  images?: string[]
  /**
   * The original reproducible "/pic …" command for a mirrored photo, so the chat's
   * per-image Redo/×3 buttons can re-fire exactly this shot. Absent for /hd upscales
   * (not reproducible) and text messages.
   */
  command?: string
}

export interface ChatStatus {
  state: 'connecting' | 'ready' | 'sending' | 'closed' | 'error'
  detail: string
}

// A single photo in a character's gallery. `character` is the /be slug/name the pic
// daemon recorded; `image` is a terrarium://inbox/… URL.
export interface GalleryEntry {
  character: string
  image: string
  caption: string
  command?: string
  ts: number
}

export interface ChatConnectResult {
  ok: boolean
  message?: string
  history: ChatMsg[]
}
