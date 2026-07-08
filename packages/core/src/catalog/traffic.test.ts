import { describe, expect, it } from 'vitest'
import { MODEL_CATALOG } from './models'
import { trafficLight } from './traffic'

// Corey's machine: RTX 4070 12 GB, 32 GB RAM, ComfyUI resident.
const RTX4070 = { vramMb: 12282, ramMb: 32768 }
const OPTS = { comfyResidentMb: 1024 }

const entry = (id: string) => MODEL_CATALOG.find((m) => m.id === id)!

describe('trafficLight', () => {
  it('greens a proven 8B on a 12 GB card even with ComfyUI resident', () => {
    const light = trafficLight(entry('dolphin3:8b'), RTX4070, OPTS)
    expect(light.color).toBe('green')
  })

  it('reds reasoning models regardless of hardware — they break OpenClaw', () => {
    const light = trafficLight(entry('huihui_ai/qwen3-abliterated:8b'), RTX4070, OPTS)
    expect(light.color).toBe('red')
    expect(light.reason).toMatch(/reasoning/i)
  })

  it('ambers a 24B class model: fits only with CPU offload', () => {
    const light = trafficLight(entry('local-24b-class'), RTX4070, OPTS)
    expect(light.color).toBe('amber')
    expect(light.reason).toMatch(/slow|offload/i)
  })

  it('reds a 70B class model on this hardware', () => {
    expect(trafficLight(entry('local-70b-class'), RTX4070, OPTS).color).toBe('red')
  })

  it('greens hosted models — the hardware ceiling does not apply', () => {
    const light = trafficLight(entry('arliai/Mistral-Medium-3.5-128B'), RTX4070, OPTS)
    expect(light.color).toBe('green')
    expect(light.reason).toMatch(/internet|api/i)
  })

  it('ambers local models on a no-GPU machine (CPU-only crawl)', () => {
    const light = trafficLight(entry('dolphin3:8b'), { vramMb: 0, ramMb: 16384 }, {})
    expect(light.color).toBe('amber')
    expect(light.reason).toMatch(/cpu/i)
  })

  it('catalog carries refusal tiers so the UI can label the doors honestly', () => {
    expect(entry('claude-sonnet').refusalTier).toBe('strict')
    expect(entry('arliai/Mistral-Medium-3.5-128B').refusalTier).toBe('uncensored')
    expect(entry('dolphin3:8b').refusalTier).toBe('uncensored')
  })
})
