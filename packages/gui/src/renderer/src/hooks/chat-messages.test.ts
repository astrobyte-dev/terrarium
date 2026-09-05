import { describe, expect, it } from 'vitest'
import type { ChatMsg } from '../data/types'
import { mergeHistory, parseOutbox, reconcile } from './chat-messages'

const user = (id: string, patch: Partial<ChatMsg> = {}): ChatMsg =>
  ({ id, role: 'user', text: 'hello', ts: 1000, ...patch })
const assistant = (id: string, patch: Partial<ChatMsg> = {}): ChatMsg =>
  ({ id, role: 'assistant', text: 'hello there', ts: 2000, ...patch })

describe('chat reconciliation', () => {
  it('keeps deliberate repeated messages with distinct IDs', () => {
    const messages = [user('a'), user('b'), assistant('c'), assistant('d')]
    expect(mergeHistory([], messages)).toEqual(messages.map((m) => expect.objectContaining(m)))
    expect(reconcile([user('a')], user('b'))).toHaveLength(2)
  })

  it('lets authoritative history clear stale delivery errors and streaming flags', () => {
    const current = [user('a', { delivery: 'failed', error: 'offline' }), assistant('b', { streaming: true })]
    const merged = mergeHistory(current, [user('a'), assistant('b')])
    expect(merged[0]).toMatchObject({ delivery: 'sent', error: undefined })
    expect(merged[1]?.streaming).toBeUndefined()
  })

  it('matches one attempted local echo to only one history record', () => {
    const merged = mergeHistory([user('local', { delivery: 'sending' })], [user('server-a'), user('server-b')])
    expect(merged.map((m) => m.id)).toEqual(['server-a', 'server-b'])
  })

  it('never discards an unsent repeat or matches to an older historical message', () => {
    expect(mergeHistory([user('local', { delivery: 'queued' })], [user('server')])).toHaveLength(2)
    expect(mergeHistory([user('local', { delivery: 'failed' })], [user('server', { ts: 900 })])).toHaveLength(2)
  })

  it('finishes the provisional reply even if a photo arrived after it', () => {
    const partial = assistant('stream', { text: 'hello', streaming: true })
    const photo = assistant('photo', { images: ['terrarium://inbox/a.png'] })
    const merged = reconcile([partial, photo], assistant('server'))
    expect(merged).toHaveLength(2)
    expect(merged[0]).toMatchObject({ id: 'server', text: 'hello there' })
    expect(merged[0]?.streaming).toBeUndefined()
    expect(merged[1]).toEqual(photo)
  })

  it('preserves the original timestamp through streaming updates without timestamps', () => {
    const current = assistant('stream', { ts: 0, streaming: true })
    expect(reconcile([current], assistant('stream', { ts: null, streaming: true }))[0]?.ts).toBe(0)
  })

  it('replaces a completed live bubble with history once, preserving later identical replies', () => {
    const live = assistant('stream', { streaming: false })
    const merged = mergeHistory([live], [assistant('history-a'), assistant('history-b')])
    expect(merged.map((m) => m.id)).toEqual(['history-a', 'history-b'])
  })

  it('keeps images distinct from text and makes repeated history merges idempotent', () => {
    const current = [assistant('photo', { images: ['terrarium://inbox/a.png'] })]
    const history = [assistant('server')]
    const merged = mergeHistory(current, history)
    expect(merged).toHaveLength(2)
    expect(mergeHistory(merged, history)).toEqual(merged)
  })
})

describe('persistent outbox', () => {
  it.each(['null', '{}', '[null, 12, {}, {"role":"user","delivery":"queued"}]', 'broken'])('ignores invalid stored data: %s', (value) => {
    expect(parseOutbox(value)).toEqual([])
  })

  it('restores interrupted sends as queued with the same idempotency key', () => {
    const restored = parseOutbox(JSON.stringify([
      user('interrupted', { delivery: 'sending' }), user('failed', { delivery: 'failed' }),
      user('done', { delivery: 'sent' }), assistant('reply'),
    ]))
    expect(restored).toEqual([
      expect.objectContaining({ id: 'interrupted', delivery: 'queued' }),
      expect.objectContaining({ id: 'failed', delivery: 'failed' }),
    ])
  })
})
