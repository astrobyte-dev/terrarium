import type { DirEntry } from '../system/system-port'

/** Most recently written file whose name matches, or null. */
export function pickNewest(entries: DirEntry[], pattern: RegExp): string | null {
  let best: DirEntry | null = null
  for (const entry of entries) {
    if (!pattern.test(entry.name)) continue
    if (best === null || entry.mtimeMs > best.mtimeMs) best = entry
  }
  return best?.name ?? null
}
