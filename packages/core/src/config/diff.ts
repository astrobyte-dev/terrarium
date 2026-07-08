/** Paths where two JSON-ish values differ. Reports paths only — never values (secret-safe). */
export function diffPaths(a: unknown, b: unknown, base = ''): string[] {
  if (Object.is(a, b)) return []

  const bothObjects =
    a !== null && b !== null && typeof a === 'object' && typeof b === 'object' &&
    !Array.isArray(a) && !Array.isArray(b)
  if (!bothObjects) {
    if (Array.isArray(a) && Array.isArray(b) && JSON.stringify(a) === JSON.stringify(b)) return []
    return [base === '' ? '(root)' : base]
  }

  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const diffs: string[] = []
  for (const key of keys) {
    const path = base === '' ? key : `${base}.${key}`
    const av = (a as Record<string, unknown>)[key]
    const bv = (b as Record<string, unknown>)[key]
    if (!(key in a) || !(key in b)) {
      diffs.push(path)
      continue
    }
    diffs.push(...diffPaths(av, bv, path))
  }
  return diffs
}
