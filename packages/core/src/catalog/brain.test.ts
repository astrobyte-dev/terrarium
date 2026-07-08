import { describe, expect, it } from 'vitest'
import { MODEL_CATALOG } from './models'
import { resolveBrainChoice, resolveFallbacks } from './brain'

const entry = (id: string) => MODEL_CATALOG.find((m) => m.id === id)!

describe('resolveBrainChoice', () => {
  it('accepts a configured hosted brain and returns its primary ref', () => {
    const r = resolveBrainChoice(entry('arliai/Mistral-Medium-3.5-128B'))
    expect(r.ok).toBe(true)
    expect(r.primaryModel).toBe('arliai/Mistral-Medium-3.5-128B')
  })

  it('accepts a configured local brain', () => {
    const r = resolveBrainChoice(entry('dolphin3:8b'))
    expect(r.ok).toBe(true)
    expect(r.primaryModel).toBe('ollama/dolphin3:8b')
  })

  it('rejects reasoning models — they break OpenClaw', () => {
    const r = resolveBrainChoice(entry('huihui_ai/qwen3-abliterated:8b'))
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/reasoning/i)
  })

  it('rejects guidance-only placeholder rows', () => {
    const r = resolveBrainChoice(entry('local-24b-class'))
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/not installable|placeholder/i)
  })

  it('rejects a brain whose provider is not configured yet (Claude needs a key)', () => {
    const r = resolveBrainChoice(entry('claude-sonnet'))
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/API key|not configured|anthropic/i)
  })

  it('opens the Claude door once the anthropic key is captured', () => {
    const r = resolveBrainChoice(entry('claude-sonnet'), { anthropicConfigured: true })
    expect(r.ok).toBe(true)
    expect(r.primaryModel).toBe('anthropic/claude-sonnet-5')
    expect(r.fallbacks).toEqual(['ollama/dolphin3:8b'])
  })

  it('a captured key does not bypass the reasoning gate', () => {
    const r = resolveBrainChoice(entry('huihui_ai/qwen3-abliterated:8b'), { anthropicConfigured: true })
    expect(r.ok).toBe(false)
  })
})

describe('resolveFallbacks', () => {
  it('falls back to the local safety net for a hosted primary', () => {
    expect(resolveFallbacks('arliai/Mistral-Medium-3.5-128B')).toEqual(['ollama/dolphin3:8b'])
  })

  it('does not list the primary as its own fallback', () => {
    expect(resolveFallbacks('ollama/dolphin3:8b')).toEqual([])
  })

  it('gives a local primary the standard local fallback when different', () => {
    expect(resolveFallbacks('ollama/llama3:latest')).toEqual(['ollama/dolphin3:8b'])
  })
})
