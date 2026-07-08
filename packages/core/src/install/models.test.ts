import { describe, expect, it } from 'vitest'
import { listLocalModels, pullModel } from './models'
import type { InstallProgress } from './types'

const fetchOf = (body: string, ok = true) =>
  (async () => new Response(body, { status: ok ? 200 : 500 })) as unknown as typeof fetch

const PULL_STREAM = [
  '{"status":"pulling manifest"}',
  '{"status":"downloading","digest":"sha256:aa","total":1000,"completed":250}',
  '{"status":"downloading","digest":"sha256:aa","total":1000,"completed":1000}',
  '{"status":"verifying sha256 digest"}',
  '{"status":"success"}',
].join('\n')

describe('pullModel', () => {
  it('streams ollama pull progress with percentages', async () => {
    const seen: InstallProgress[] = []
    const outcome = await pullModel('dolphin3:8b', (p) => seen.push(p), fetchOf(PULL_STREAM))
    expect(outcome.ok).toBe(true)
    const percents = seen.filter((p) => p.percent !== null).map((p) => p.percent)
    expect(percents).toContain(25)
    expect(percents).toContain(100)
    expect(seen.every((p) => p.component === 'model:dolphin3:8b')).toBe(true)
  })

  it('surfaces ollama errors as a failed outcome', async () => {
    const outcome = await pullModel('nope:1b', () => {}, fetchOf('{"error":"pull model manifest: file does not exist"}'))
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toContain('does not exist')
  })

  it('fails cleanly when ollama is unreachable', async () => {
    const throwing = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const outcome = await pullModel('x', () => {}, throwing)
    expect(outcome.ok).toBe(false)
    expect(outcome.message).toMatch(/unreachable|ECONNREFUSED/i)
  })
})

describe('listLocalModels', () => {
  it('maps /api/tags onto name + size', async () => {
    const body = JSON.stringify({
      models: [
        { name: 'dolphin3:8b', size: 4_900_000_000 },
        { name: 'qwen2.5vl:3b', size: 3_200_000_000 },
      ],
    })
    const models = await listLocalModels(fetchOf(body))
    expect(models).toEqual([
      { name: 'dolphin3:8b', sizeMb: 4673 },
      { name: 'qwen2.5vl:3b', sizeMb: 3052 },
    ])
  })

  it('returns empty when ollama is down', async () => {
    const throwing = (async () => {
      throw new Error('down')
    }) as unknown as typeof fetch
    expect(await listLocalModels(throwing)).toEqual([])
  })
})
