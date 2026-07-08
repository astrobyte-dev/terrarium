import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('core stays headless', () => {
  it('declares no runtime dependencies (especially no UI libraries)', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    const deps = Object.keys(pkg.dependencies ?? {})
    expect(deps).toEqual([])
  })
})
