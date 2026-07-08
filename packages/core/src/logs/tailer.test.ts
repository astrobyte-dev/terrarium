import { beforeEach, describe, expect, it } from 'vitest'
import { createTailer } from './tailer'

let files: Map<string, string>
let activePath: string

const fakeFs = {
  statSize: async (p: string) => {
    const f = files.get(p)
    return f === undefined ? null : Buffer.byteLength(f, 'utf8')
  },
  readFileFrom: async (p: string, start: number) =>
    Buffer.from(files.get(p) ?? '', 'utf8').subarray(start).toString('utf8'),
}

function makeTailer(onLine: (l: string) => void) {
  return createTailer({
    fs: fakeFs,
    resolvePath: async () => activePath,
    onLine,
  })
}

describe('createTailer', () => {
  beforeEach(() => {
    files = new Map([['a.log', 'old line\n']])
    activePath = 'a.log'
  })

  it('starts at end of file: emits only lines appended after attach', async () => {
    const seen: string[] = []
    const t = makeTailer((l) => seen.push(l))
    await t.poll()
    expect(seen).toEqual([])
    files.set('a.log', 'old line\nnew line\n')
    await t.poll()
    expect(seen).toEqual(['new line'])
  })

  it('holds partial lines until the newline arrives', async () => {
    const seen: string[] = []
    const t = makeTailer((l) => seen.push(l))
    await t.poll()
    files.set('a.log', 'old line\nhalf')
    await t.poll()
    expect(seen).toEqual([])
    files.set('a.log', 'old line\nhalf-rest\n')
    await t.poll()
    expect(seen).toEqual(['half-rest'])
  })

  it('follows rotation to a new file and reads it from the top', async () => {
    const seen: string[] = []
    const t = makeTailer((l) => seen.push(l))
    await t.poll()
    activePath = 'b.log'
    files.set('b.log', 'b1\nb2\n')
    await t.poll()
    expect(seen).toEqual(['b1', 'b2'])
  })

  it('recovers from truncation by rereading from the top', async () => {
    const seen: string[] = []
    const t = makeTailer((l) => seen.push(l))
    await t.poll()
    files.set('a.log', 'fresh\n')
    await t.poll()
    expect(seen).toEqual(['fresh'])
  })

  it('survives the file disappearing', async () => {
    const seen: string[] = []
    const t = makeTailer((l) => seen.push(l))
    await t.poll()
    files.delete('a.log')
    await t.poll()
    expect(seen).toEqual([])
  })
})
