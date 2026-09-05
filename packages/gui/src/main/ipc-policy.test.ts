import { describe, expect, it } from 'vitest'
import { isTrustedDocument, validateIpcArguments } from './ipc-policy'

describe('desktop request validation', () => {
  it.each(['../secrets', '..\\secrets', 'C:\\Windows', '/tmp/file', '%2e%2e', 'con', 'NUL', '__proto__', '', null, 5])('rejects unsafe character identities: %s', (slug) => {
    for (const channel of ['characters:get', 'characters:activate', 'characters:deletePermanently']) {
      expect(() => validateIpcArguments(channel, [slug])).toThrow('Invalid request')
    }
  })
  it('accepts normal file identities and rejects extra arguments', () => {
    expect(() => validateIpcArguments('characters:activate', ['ella-2'])).not.toThrow()
    expect(() => validateIpcArguments('characters:activate', ['ella', 'extra'])).toThrow()
    expect(() => validateIpcArguments('app:quit', ['extra'])).toThrow()
  })
  it('rejects malformed settings and prototype keys before disk writes', () => {
    for (const value of [null, [], { faceLock: 'yes' }, { unknown: true }, JSON.parse('{"__proto__":{}}')]) {
      expect(() => validateIpcArguments('gen:set', [value])).toThrow()
    }
    expect(() => validateIpcArguments('gen:set', [{ faceLock: true, alwaysInclude: ['soft light'] }])).not.toThrow()
    expect(() => validateIpcArguments('proactive:set', [{ wakingStartHour: 25 }])).toThrow()
  })
  it('requires bounded chat messages and allows the optional voice character', () => {
    expect(() => validateIpcArguments('chat:send', [{ id: 'one', text: 'hello' }])).not.toThrow()
    expect(() => validateIpcArguments('chat:send', [{ id: 'one', text: 'x'.repeat(32001) }])).toThrow()
    expect(() => validateIpcArguments('chat:send', [{ id: '', text: 'hi' }])).toThrow()
    expect(() => validateIpcArguments('voice:say', ['hello', undefined])).not.toThrow()
  })
})

it('trusts only the exact app document, including for same-origin pages', () => {
  const expected = 'file:///C:/Terrarium/out/renderer/index.html'
  expect(isTrustedDocument(expected + '#chat', expected)).toBe(true)
  for (const url of ['file:///C:/private.txt', expected + '?override=1', 'https://example.com', 'invalid']) {
    expect(isTrustedDocument(url, expected)).toBe(false)
  }
  expect(isTrustedDocument('http://localhost:5173/evil', 'http://localhost:5173/')).toBe(false)
})
