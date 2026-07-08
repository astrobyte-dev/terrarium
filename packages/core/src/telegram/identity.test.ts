import { describe, expect, it } from 'vitest'
import { getBotIdentity } from './identity'

const fakeFetch = (body: unknown, ok = true) =>
  (async () => ({ ok, json: async () => body })) as unknown as typeof fetch

describe('getBotIdentity', () => {
  it('maps getMe onto a BotIdentity', async () => {
    const identity = await getBotIdentity(
      'T',
      fakeFetch({ ok: true, result: { id: 8612263408, username: 'Harry_the_hbot', first_name: 'Ella' } }),
    )
    expect(identity).toEqual({ id: 8612263408, username: 'Harry_the_hbot', firstName: 'Ella' })
  })

  it('returns null on API failure or network error', async () => {
    expect(await getBotIdentity('T', fakeFetch({ ok: false }))).toBeNull()
    const throwing = (async () => {
      throw new Error('net')
    }) as unknown as typeof fetch
    expect(await getBotIdentity('T', throwing)).toBeNull()
  })
})
