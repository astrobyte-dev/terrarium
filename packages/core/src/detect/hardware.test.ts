import { describe, expect, it } from 'vitest'
import { parseNvidiaSmi } from './hardware'

describe('parseNvidiaSmi', () => {
  it('parses csv,noheader,nounits output', () => {
    expect(parseNvidiaSmi('NVIDIA GeForce RTX 4070, 12282\n')).toEqual([
      { name: 'NVIDIA GeForce RTX 4070', vramMb: 12282 },
    ])
  })

  it('handles multiple GPUs', () => {
    const out = 'NVIDIA GeForce RTX 4070, 12282\nNVIDIA T400, 2048\n'
    expect(parseNvidiaSmi(out)).toHaveLength(2)
  })

  it('returns empty for missing tool output', () => {
    expect(parseNvidiaSmi('')).toEqual([])
    expect(parseNvidiaSmi("'nvidia-smi' is not recognized")).toEqual([])
  })
})
