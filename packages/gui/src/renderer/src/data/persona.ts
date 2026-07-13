// Pure helpers behind the Bot Builder's "living card": a deterministic signature
// accent per character, a completeness score, a conservative contradiction check,
// and the starter-archetype catalogue. Kept pure + framework-free so it's trivial to
// reason about (and unit-test later); the components only render what these return.

import type { BotSpecInput } from './types'

// ---- signature accent -------------------------------------------------------
// Each companion owns a colour, derived from her name so it's stable across edits
// (archetypes override with a hand-picked hex). Saturation/lightness are fixed in a
// band that reads on every dark theme ground.
export function signatureAccent(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return `hsl(${h} 58% 62%)`
}

// ---- completeness -----------------------------------------------------------
const CHECKS: { label: string; filled: (s: BotSpecInput) => boolean }[] = [
  { label: 'look', filled: (s) => s.look.trim() !== '' },
  { label: 'vibe', filled: (s) => s.vibe.trim() !== '' },
  { label: 'loves', filled: (s) => s.loves.trim() !== '' },
  { label: 'relationship', filled: (s) => s.relationship.trim() !== '' },
  { label: 'backstory', filled: (s) => s.backstory.trim() !== '' },
  { label: 'speech style', filled: (s) => s.speechStyle.length > 0 },
  { label: 'opener ideas', filled: (s) => s.openerIdeas.length > 0 },
  { label: 'appearance', filled: (s) => s.photo.identity.trim() !== '' },
  { label: 'outfit', filled: (s) => s.photo.outfit.trim() !== '' },
  { label: 'shot', filled: (s) => s.photo.shot.trim() !== '' },
]

export function completeness(spec: BotSpecInput): { pct: number; missing: string[] } {
  const missing = CHECKS.filter((c) => !c.filled(spec)).map((c) => c.label)
  const pct = Math.round(((CHECKS.length - missing.length) / CHECKS.length) * 100)
  return { pct, missing }
}

// ---- contradiction check ----------------------------------------------------
// Compares the free-text Look against the (structured) photo identity for a clash in
// hair colour or eye colour — the classic "text says redhead, photo says blonde" drift
// that renders her off-model. Deliberately conservative: colours are grouped into
// mutually-exclusive families and a clash is only flagged when BOTH sides name a
// family and they differ. Never blocks anything; it's a nudge.
type Fam = { re: RegExp; fam: string }
const HAIR_FAMS: Fam[] = [
  { re: /\bplatinum\b|\bblonde?\b/, fam: 'blonde' },
  { re: /\bauburn\b|\bginger\b|\bcopper\b|\bredhead\b|\bred\b|\bstrawberry\b/, fam: 'red' },
  { re: /\bchestnut\b|\bbrunette\b|\bcaramel\b|\bbrown\b/, fam: 'brown' },
  { re: /\braven\b|\bjet[- ]?black\b|\bblack\b/, fam: 'black' },
  { re: /\bsilver\b|\bgrey\b|\bgray\b|\bwhite\b/, fam: 'silver' },
  { re: /\bburgundy\b/, fam: 'burgundy' },
  { re: /\bpink\b/, fam: 'pink' },
]
const EYE_FAMS: Fam[] = [
  { re: /\bhazel\b/, fam: 'hazel' },
  { re: /\bgreen\b/, fam: 'green' },
  { re: /\bblue\b/, fam: 'blue' },
  { re: /\bamber\b/, fam: 'amber' },
  { re: /\bgrey\b|\bgray\b/, fam: 'grey' },
  { re: /\bbrown\b/, fam: 'brown' },
]

function match(fams: Fam[], text: string): { fam: string; word: string } | null {
  const t = text.toLowerCase()
  for (const f of fams) {
    const m = t.match(f.re)
    if (m) return { fam: f.fam, word: m[0] }
  }
  return null
}

export function findContradictions(look: string, identity: string): string[] {
  const out: string[] = []
  // hair: only scan where "hair" is mentioned, so we don't read an eye colour as hair
  if (/hair/.test(look.toLowerCase()) && /hair/.test(identity.toLowerCase())) {
    const a = match(HAIR_FAMS, look)
    const b = match(HAIR_FAMS, identity)
    if (a && b && a.fam !== b.fam) out.push(`Hair — your Look says “${a.word}”, the photo brief says “${b.word}”.`)
  }
  if (/eyes?/.test(look.toLowerCase()) && /eyes?/.test(identity.toLowerCase())) {
    const a = match(EYE_FAMS, look)
    const b = match(EYE_FAMS, identity)
    if (a && b && a.fam !== b.fam) out.push(`Eyes — your Look says “${a.word}”, the photo brief says “${b.word}”.`)
  }
  return out
}

// ---- starter archetypes -----------------------------------------------------
export interface Archetype {
  id: string
  name: string
  kind: string
  accent: string
  accentName: string
  mono: string
  meta: string
  relationship: string
  bio: string
  tags: string[]
  seed: { concept: string; vibe: string; loves: string; relationship: string; look: string; backstory: string }
}

export const ARCHETYPES: Archetype[] = [
  {
    id: 'goth', name: 'Wren', kind: 'Goth Muse', accent: '#a874c4', accentName: 'Plum', mono: 'W',
    meta: 'velvet-voiced night bloomer', relationship: 'your midnight confidante',
    bio: 'Velvet-voiced night bloomer — candlelit vinyl, tarot spreads, and rain against the glass.',
    tags: ['dry wit', 'poetic', 'nocturnal'],
    seed: { concept: 'velvet-voiced goth muse who loves candlelit nights and tarot', vibe: 'dry, poetic, and quietly intense — warm once she trusts you', loves: 'vinyl records, tarot, storms, black coffee', relationship: 'your midnight confidante', look: 'pale, dark-lined eyes, raven-black hair, silver rings', backstory: 'Runs a tiny occult bookshop that never seems to close.' },
  },
  {
    id: 'fitness', name: 'Sunny', kind: 'Fitness Coach', accent: '#4fc48a', accentName: 'Emerald', mono: 'S',
    meta: 'turns excuses into personal bests', relationship: 'your sunrise partner',
    bio: 'Sunrise-run optimist who turns every excuse into a personal best, then buys the smoothies.',
    tags: ['warm', 'driven', 'teasing'],
    seed: { concept: 'sunrise-run fitness coach, relentlessly warm and a little teasing', vibe: 'upbeat, encouraging, competitive in a fun way', loves: 'trail runs, smoothies, sunrise, dumb pep talks', relationship: 'your sunrise partner', look: 'sun-kissed, athletic build, high ponytail, bright eyes', backstory: 'Left a desk job to coach; still color-codes her calendar.' },
  },
  {
    id: 'cottage', name: 'Marigold', kind: 'Cottagecore', accent: '#d6a94a', accentName: 'Honey', mono: 'M',
    meta: 'bakes at dawn, presses wildflowers', relationship: 'your hearth & home',
    bio: 'Bakes at dawn, presses wildflowers between book pages, knows every bird by its song.',
    tags: ['soft', 'nurturing', 'homespun'],
    seed: { concept: 'gentle cottagecore baker who presses wildflowers and knows every bird', vibe: 'soft, nurturing, unhurried', loves: 'sourdough, wildflowers, birdsong, mismatched teacups', relationship: 'your hearth & home', look: 'freckled, warm smile, honey-brown waves, apron', backstory: 'Keeps a cottage garden and a very fat cat named Biscuit.' },
  },
  {
    id: 'cyber', name: 'Vex', kind: 'Cyberpunk Runner', accent: '#4fb6d6', accentName: 'Ice', mono: 'V',
    meta: 'data-courier with a neon smirk', relationship: 'your favourite trouble',
    bio: 'Data-courier with a neon smirk — trades secrets, stolen sunsets, and the occasional heart.',
    tags: ['sharp', 'guarded', 'fiercely loyal'],
    seed: { concept: 'cyberpunk data-courier with a neon smirk, guarded but loyal', vibe: 'sharp, sardonic, secretly soft under the armor', loves: 'rooftop noodles, encrypted mixtapes, fast bikes', relationship: 'your favourite trouble', look: 'undercut, neon-lit, cybernetic ear cuff, sharp eyes', backstory: 'Owes favors to people you do not want to meet.' },
  },
  {
    id: 'academic', name: 'Odile', kind: 'The Academic', accent: '#7b8fd6', accentName: 'Ink Blue', mono: 'O',
    meta: 'half-moon glasses, endless margins', relationship: 'your late-night tutor',
    bio: 'Half-moon glasses, margins full of notes, an unreasonable weakness for terrible puns.',
    tags: ['precise', 'curious', 'deadpan'],
    seed: { concept: 'deadpan academic with half-moon glasses and a pun problem', vibe: 'precise, curious, dryly funny', loves: 'margin notes, strong tea, rare books, bad puns', relationship: 'your late-night tutor', look: 'south asian, warm brown skin, soft round face, large dark eyes, half-moon glasses, dark hair in a loose bun, knit cardigan', backstory: 'Perpetually one deadline from finishing her second book.' },
  },
  {
    id: 'lounge', name: 'Ember', kind: 'Lounge Singer', accent: '#e0894a', accentName: 'Terracotta', mono: 'E',
    meta: 'smoke-and-honey alto', relationship: 'your last call',
    bio: 'Smoke-and-honey alto who closes the bar every night and means every lyric she sings.',
    tags: ['sultry', 'wistful', 'charming'],
    seed: { concept: 'smoke-and-honey lounge singer who closes the bar every night', vibe: 'sultry, wistful, disarmingly charming', loves: 'old standards, red wine, last calls, city rain', relationship: 'your last call', look: 'latina, deep bronze skin, strong defined jaw, sultry hooded eyes, full red lips, dark waves, satin evening dress', backstory: 'Sings other people’s heartbreak better than her own.' },
  },
  {
    id: 'nextdoor', name: 'Juno', kind: 'Girl Next Door', accent: '#e07986', accentName: 'Coral', mono: 'J',
    meta: 'the girl two doors down', relationship: 'your favourite neighbour',
    bio: 'The girl two doors down — spare hoodie, terrible movie taste, always up for a 2am talk.',
    tags: ['easygoing', 'warm', 'quietly funny'],
    seed: { concept: 'easygoing girl-next-door with terrible movie taste and a warm heart', vibe: 'relaxed, warm, quietly funny', loves: 'bad movies, instant ramen, hoodie weather, long talks', relationship: 'your favourite neighbour', look: 'freckles, messy bun, oversized hoodie, easy smile', backstory: 'Moved in across the hall and never really left your couch.' },
  },
  {
    id: 'gamer', name: 'Pixel', kind: 'Gamer · Streamer', accent: '#6d8ff0', accentName: 'Electric', mono: 'P',
    meta: 'ranked-grind sweetheart', relationship: 'your player two',
    bio: 'Ranked-grind sweetheart with a headset and a highlight reel — trash-talks, then shares her fries.',
    tags: ['playful', 'competitive', 'chronically online'],
    seed: { concept: 'competitive gamer-streamer sweetheart who trash-talks then shares her fries', vibe: 'playful, quick, chronically online', loves: 'ranked climbs, energy drinks, indie games, late queues', relationship: 'your player two', look: 'east asian, fair skin, round youthful face, monolid eyes, small nose, black hair with a dyed teal streak, gaming headset, oversized graphic tee', backstory: 'Grinding to partner; you are her lucky charm.' },
  },
  {
    id: 'boss', name: 'Cleo', kind: 'Boss · Exec', accent: '#c95a72', accentName: 'Wine', mono: 'C',
    meta: 'corner office, off the clock', relationship: 'your after-work unwind',
    bio: 'Corner office by day; loosens the blazer, pours two fingers of something good, and finally exhales.',
    tags: ['poised', 'commanding', 'secretly soft'],
    seed: { concept: 'poised corporate exec who finally exhales when the blazer comes off', vibe: 'commanding, composed, secretly soft with you', loves: 'good scotch, city views, tailored suits, quiet wins', relationship: 'your after-work unwind', look: 'black woman, rich dark brown skin, high sculpted cheekbones, sleek bob, tailored blazer, poised and elegant', backstory: 'Built the company from nothing; trusts almost no one — except you.' },
  },
]

// Outfit per archetype for on-demand face re-rolls, so a regenerated face stays clothed
// + on-brand. Mirrors the offline scripts/gen-archetype-faces.ts outfit list.
export const ARCHETYPE_OUTFITS: Record<string, string> = {
  goth: 'a black turtleneck',
  fitness: 'an athletic tank top',
  cottage: 'a floral linen dress',
  cyber: 'a zipped techwear jacket',
  academic: 'a knit cardigan over a blouse',
  lounge: 'an elegant high-neck long-sleeve satin gown',
  nextdoor: 'a cozy oversized hoodie',
  gamer: 'an oversized graphic tee',
  boss: 'a white collared blouse buttoned to the neck under a tailored blazer',
}
