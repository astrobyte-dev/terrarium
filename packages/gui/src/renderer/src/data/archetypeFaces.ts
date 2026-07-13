// Static map of archetype id → bundled portrait URL, populated from the assets folder
// at build time by Vite. Regenerate the PNGs with scripts/gen-archetype-faces.ts.
// Tolerant by design: an archetype with no generated face simply isn't in the map, and
// the card falls back to its monogram tile — so a missing image never breaks the build.
const modules = import.meta.glob('../assets/archetypes/*.png', { eager: true, import: 'default' }) as Record<string, string>

// <id>.png = photoreal portrait · <id>-anime.png = anime portrait.
const faces: Record<string, string> = {}
const animeFaces: Record<string, string> = {}
for (const [path, url] of Object.entries(modules)) {
  const base = path.split('/').pop()?.replace(/\.png$/, '')
  if (!base) continue
  if (base.endsWith('-anime')) animeFaces[base.replace(/-anime$/, '')] = url
  else faces[base] = url
}

export function archetypeFace(id: string): string | undefined {
  return faces[id]
}

export function archetypeAnimeFace(id: string): string | undefined {
  return animeFaces[id]
}

// User re-rolls (persistent, per-machine) override the bundled photoreal face. Stored as
// id → terrarium://portraits/archetype_<id>.png?t=… so it survives restarts.
const OVERRIDE_KEY = 'terrarium.archetypeFaceOverride'

function readOverrides(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(OVERRIDE_KEY) || '{}')
  } catch {
    return {}
  }
}

export function getFaceOverride(id: string): string | undefined {
  return readOverrides()[id]
}

export function setFaceOverride(id: string, url: string): void {
  const m = readOverrides()
  m[id] = url
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(m))
  } catch {
    /* storage full / unavailable — the in-session state still updates */
  }
}

export function clearFaceOverride(id: string): void {
  const m = readOverrides()
  delete m[id]
  try {
    localStorage.setItem(OVERRIDE_KEY, JSON.stringify(m))
  } catch {
    /* ignore */
  }
}
