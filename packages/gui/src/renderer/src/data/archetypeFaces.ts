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
