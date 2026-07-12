// Static map of archetype id → bundled portrait URL, populated from the assets folder
// at build time by Vite. Regenerate the PNGs with scripts/gen-archetype-faces.ts.
// Tolerant by design: an archetype with no generated face simply isn't in the map, and
// the card falls back to its monogram tile — so a missing image never breaks the build.
const modules = import.meta.glob('../assets/archetypes/*.png', { eager: true, import: 'default' }) as Record<string, string>

const faces: Record<string, string> = {}
for (const [path, url] of Object.entries(modules)) {
  const id = path.split('/').pop()?.replace(/\.png$/, '')
  if (id) faces[id] = url
}

export function archetypeFace(id: string): string | undefined {
  return faces[id]
}
