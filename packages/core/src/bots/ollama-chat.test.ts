import { describe, expect, it } from 'vitest'
import { createOllamaChat } from './ollama-chat'

const okResponse = (content: string) =>
  ({ ok: true, status: 200, json: async () => ({ message: { content } }) }) as unknown as Response

describe('createOllamaChat', () => {
  it('posts the prompt to /api/chat and returns the message content', async () => {
    let seenUrl = ''
    let seenBody: Record<string, unknown> = {}
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seenUrl = url
      seenBody = JSON.parse(init.body as string)
      return okResponse('hello')
    }) as unknown as typeof fetch
    const chat = createOllamaChat({ fetchImpl, model: 'test-model', baseUrl: 'http://x:11434' })
    expect(await chat('draft me')).toBe('hello')
    expect(seenUrl).toBe('http://x:11434/api/chat')
    expect(seenBody.model).toBe('test-model')
    expect(seenBody.stream).toBe(false)
  })

  it('strips <think> blocks some models emit', async () => {
    const fetchImpl = (async () => okResponse('<think>hmm</think>the answer')) as unknown as typeof fetch
    expect(await createOllamaChat({ fetchImpl })('x')).toBe('the answer')
  })

  it('throws a helpful error on a non-ok response', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 404 }) as Response) as unknown as typeof fetch
    await expect(createOllamaChat({ fetchImpl, model: 'missing' })('x')).rejects.toThrow(/404|Ollama/i)
  })

  it('throws on an empty reply', async () => {
    const fetchImpl = (async () => okResponse('   ')) as unknown as typeof fetch
    await expect(createOllamaChat({ fetchImpl })('x')).rejects.toThrow(/empty/i)
  })
})
