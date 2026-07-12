// AI-assisted persona drafting for the Bot Builder. A local (uncensored) model
// drafts the personality + baseline photo prompts from a name + one-line concept;
// the user still edits and the usual validateBotSpec gate (incl. the 18+ floor and
// age-coded rejection) runs on preview/create. This module is pure + injectable so
// it's fully unit-tested; the real Ollama call lives in ollama-chat.ts.

export type DraftMode = 'sfw' | 'nsfw'

export interface DraftSeed {
  displayName: string
  age: number
  concept: string
  mode: DraftMode
  /** 0–4 spice dial (wholesome→explicit). When set it overrides `mode` for tone;
   *  when omitted, tone falls back to the coarse `mode` for backward compatibility. */
  spice?: number
}

// The NSFW branches keep the photo prompts tame on purpose — explicit *acts* are added
// later at /pic time, not baked into the baseline appearance the card ships with.
const PHOTO_CAVEAT =
  ' Keep the photo prompts to tasteful ADULT baseline appearance only — explicit acts are added later at photo time, not here.'

/** Tone paragraphs for the persona draft + a single-field re-roll, graded by spice. */
export function spiceTone(level: number): { persona: string; field: string } {
  const clamped = Math.max(0, Math.min(4, Math.round(level)))
  switch (clamped) {
    case 0:
      return { persona: 'Keep everything wholesome, warm, and non-sexual (SFW).', field: 'Keep it wholesome (SFW).' }
    case 1:
      return {
        persona: 'Keep it warm and lightly flirty — playful teasing is fine, but nothing sexual or explicit (SFW).',
        field: 'Warm and lightly flirty, nothing explicit (SFW).',
      }
    case 2:
      return {
        persona: 'This is an adult companion (NSFW). Personality, loves, and backstory can be flirty and openly sexual.' + PHOTO_CAVEAT,
        field: 'She is an adult companion (NSFW) — flirty and openly sexual is fine.',
      }
    case 3:
      return {
        persona: 'This is an adult companion (NSFW). Personality, loves, and backstory can be sensual, forward, and sexually explicit.' + PHOTO_CAVEAT,
        field: 'She is an adult companion (NSFW) — sensual, forward, sexually explicit is fine.',
      }
    default:
      return {
        persona:
          'This is an adult companion (NSFW). Personality, loves, and backstory can be uninhibited and sexually explicit, including kinks and desires.' + PHOTO_CAVEAT,
        field: 'She is an adult companion (NSFW) — uninhibited, explicit; kinks and desires are fine.',
      }
  }
}

// Resolve the tone for a seed: prefer the fine-grained spice dial. With no spice, fall
// back to the original coarse mode strings verbatim, so pre-dial callers are unchanged.
function seedTone(seed: DraftSeed): { persona: string; field: string } {
  if (seed.spice !== undefined) return spiceTone(seed.spice)
  return seed.mode === 'nsfw'
    ? {
        persona:
          'This is an adult companion (NSFW). Personality, loves, and backstory can be flirty, sexual, and explicit.' + PHOTO_CAVEAT,
        field: 'She is an adult companion (NSFW) — flirty/explicit is fine.',
      }
    : { persona: 'Keep everything wholesome, warm, and non-sexual (SFW).', field: 'Keep it wholesome (SFW).' }
}

/** The subset of BotSpec the model drafts; slug/displayName/age/hardRules stay user-owned. */
export interface DraftedPersona {
  look: string
  vibe: string
  loves: string
  relationship: string
  backstory: string
  speechStyle: string[]
  openerIdeas: string[]
  photo: { identity: string; outfit: string; shot: string }
}

// Belt-and-braces: strip any youth-suggesting term the model might slip in, even
// though validateBotSpec also rejects them. Mirrors spec.ts's AGE_CODED_RE plus a
// couple of adjacent words, applied only to the (sensitive) photo fields.
const AGE_CODED_RE = /\b(loli|shota|teen|teenage|schoolgirl|school girl|child|childlike|underage|minor|young girl)\b/gi

// Local models are loose with the schema — a field asked to be a string sometimes
// comes back as an object or array. Flatten anything to a readable comma phrase so
// nothing is silently dropped.
function text(v: unknown): string {
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(text).filter((x) => x !== '').join(', ')
  if (v !== null && typeof v === 'object') {
    return Object.values(v as Record<string, unknown>)
      .map(text)
      .filter((x) => x !== '')
      .join(', ')
  }
  return ''
}
const toLines = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(text).filter((x) => x !== '')
  const s = text(v)
  return s === '' ? [] : [s]
}
const scrub = (v: unknown): string =>
  text(v).replace(AGE_CODED_RE, '').replace(/\s{2,}/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '')

/** Extract one JSON object by brace-matching (string-aware); repairs a truncated tail. */
function extractJsonObject(raw: string): string {
  const start = raw.indexOf('{')
  if (start === -1) throw new Error('no JSON object found in the model reply')
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < raw.length; i++) {
    const c = raw[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
    } else if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return raw.slice(start, i + 1)
  }
  return raw.slice(start) + '}'.repeat(Math.max(0, depth)) // truncated — close open braces
}

export function buildDraftPrompt(seed: DraftSeed): string {
  const tone = seedTone(seed).persona
  return [
    `You are helping design a fictional adult companion chatbot character named "${seed.displayName}", age ${seed.age}.`,
    `Concept: ${seed.concept}.`,
    tone,
    `HARD RULE: the character is an ADULT (${seed.age}). NEVER use age-coded or youth-suggesting words anywhere (no "teen", "schoolgirl", "loli", "young girl", "childlike", etc.), especially in the photo prompts. Describe a grown adult woman.`,
    'Give her a SPECIFIC, concrete ethnicity and render it as PHYSICAL markers in BOTH "look" and the photo "identity": a concrete race/ethnicity word (e.g. "east asian", "black", "latina", "middle eastern", "south asian" — NOT just a nationality like "Japanese-American"), PLUS skin tone, hair colour & texture, and eye colour. Vary it — do not default to a generic white woman.',
    '',
    'Output ONLY a JSON object (no prose, no code fences) with EXACTLY these keys:',
    '- look: short physical description INCLUDING her ethnicity, skin tone, hair colour & texture (comma phrases)',
    '- vibe: her personality in a phrase',
    '- loves: a few things she loves (comma list)',
    '- relationship: her relationship to the user (e.g. "your girlfriend")',
    '- backstory: 1-2 sentences',
    '- speechStyle: array of 2-4 short bullets on how she talks',
    '- openerIdeas: array of 2-3 short opening text messages she might send',
    '- photo: object with identity (MUST restate the concrete ethnicity markers — race/ethnicity word + skin tone + hair colour & texture + eye colour — THEN adult face/body descriptors incl. the age), outfit (default clothing), shot (camera framing)',
    '',
    'Return the JSON now.',
  ].join('\n')
}

export function parseDraft(raw: string): DraftedPersona {
  let obj: Record<string, unknown>
  try {
    obj = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>
  } catch (e) {
    if (e instanceof Error && /no JSON object found/.test(e.message)) throw e
    throw new Error('no JSON object could be parsed from the model reply')
  }
  const photo = (obj.photo ?? {}) as Record<string, unknown>
  return {
    look: text(obj.look),
    vibe: text(obj.vibe),
    loves: text(obj.loves),
    relationship: text(obj.relationship),
    backstory: text(obj.backstory),
    speechStyle: toLines(obj.speechStyle),
    openerIdeas: toLines(obj.openerIdeas),
    photo: { identity: scrub(photo.identity), outfit: scrub(photo.outfit), shot: scrub(photo.shot) },
  }
}

export async function draftPersona(seed: DraftSeed, chat: (prompt: string) => Promise<string>): Promise<DraftedPersona> {
  return parseDraft(await chat(buildDraftPrompt(seed)))
}

// --- per-field re-roll (the little dice button on each section) ---

export type DraftField =
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

const FIELD_SPEC: Record<DraftField, { label: string; array: boolean; photo: boolean }> = {
  look: { label: 'a short physical description INCLUDING her ethnicity (comma phrases)', array: false, photo: false },
  vibe: { label: 'her personality in a short phrase', array: false, photo: false },
  loves: { label: 'a few things she loves (comma list)', array: false, photo: false },
  relationship: { label: 'her relationship to the user (e.g. "your girlfriend")', array: false, photo: false },
  backstory: { label: 'a fresh 1-2 sentence backstory', array: false, photo: false },
  speechStyle: { label: '2-4 short bullets on how she talks', array: true, photo: false },
  openerIdeas: { label: '2-3 short opening text messages she might send', array: true, photo: false },
  photoIdentity: {
    label:
      'concrete ethnicity markers (race/ethnicity word + skin tone + hair colour & texture + eye colour) then adult face/body descriptors including the age',
    array: false,
    photo: true,
  },
  photoOutfit: { label: 'her default outfit', array: false, photo: true },
  photoShot: { label: 'a camera framing / pose for her photo', array: false, photo: true },
}

export function buildFieldPrompt(seed: DraftSeed, field: DraftField): string {
  const spec = FIELD_SPEC[field]
  const tone = seedTone(seed).field
  return [
    `Adult companion "${seed.displayName}", age ${seed.age}. Concept: ${seed.concept}.`,
    tone,
    `She is an ADULT (${seed.age}) — never any age-coded or youth-suggesting words${spec.photo ? ', especially here' : ''}.`,
    `Give ONE fresh option for: ${spec.label}.`,
    `Output ONLY JSON: {"value": ${spec.array ? '["...", "..."]' : '"..."'}}`,
  ].join('\n')
}

/** Re-roll a single field. Returns a string, or a string[] for speechStyle/openerIdeas. */
export async function draftField(
  seed: DraftSeed,
  field: DraftField,
  chat: (prompt: string) => Promise<string>,
): Promise<string | string[]> {
  const spec = FIELD_SPEC[field]
  const obj = JSON.parse(extractJsonObject(await chat(buildFieldPrompt(seed, field)))) as { value?: unknown }
  if (spec.array) return toLines(obj.value)
  return spec.photo ? scrub(obj.value) : text(obj.value)
}
