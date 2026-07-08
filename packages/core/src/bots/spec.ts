export interface BotSpec {
  slug: string
  displayName: string
  age: number
  look: string
  vibe: string
  loves: string
  relationship: string
  speechStyle: string[]
  backstory: string
  hardRules: string[]
  photo: {
    identity: string
    outfit: string
    shot: string
  }
  openerIdeas: string[]
}

const SLUG_RE = /^[a-z][a-z0-9-]{1,23}$/
// Non-negotiable: no age-coded terms anywhere near the photo pipeline.
const AGE_CODED_RE = /\b(loli|shota|teen|teenage|schoolgirl|school girl|child|underage|minor)\b/i

const REQUIRED: Array<[keyof BotSpec, string]> = [
  ['displayName', 'display name'],
  ['look', 'look'],
  ['vibe', 'vibe'],
  ['loves', 'loves'],
  ['relationship', 'relationship'],
  ['backstory', 'backstory'],
]

export function validateBotSpec(spec: BotSpec): string[] {
  const errors: string[] = []
  if (!SLUG_RE.test(spec.slug)) {
    errors.push(`slug "${spec.slug}" must be lowercase letters/digits/dashes (2-24 chars)`)
  }
  if (!Number.isInteger(spec.age) || spec.age < 18) {
    errors.push('age must be 18 or older — 18 is the floor, never below, no exceptions')
  }
  for (const [key, label] of REQUIRED) {
    const value = spec[key]
    if (typeof value === 'string' && value.trim() === '') errors.push(`${label} is required`)
  }
  if (spec.speechStyle.length === 0) errors.push('at least one speech-style bullet is required')
  if (spec.openerIdeas.length === 0) errors.push('at least one opener idea is required')
  for (const [field, text] of Object.entries(spec.photo)) {
    if (text.trim() === '') {
      errors.push(`photo ${field} is required (structured Identity/Outfit/Shot format)`)
    } else if (AGE_CODED_RE.test(text)) {
      errors.push(`photo ${field} contains an age-coded term — not allowed, ever`)
    }
  }
  return errors
}
