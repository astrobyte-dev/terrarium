import { describe, expect, it } from 'vitest'
import type { ModelAsset } from './comfy-models'
import { executeCopy, planModelAssembly } from './comfy-assemble'

const MANAGED = 'C:\\managed\\models'
const LIVE = 'C:\\live\\models'

const asset = (over: Partial<ModelAsset>): ModelAsset => ({
  name: 'thing.safetensors',
  subfolder: 'checkpoints',
  url: 'https://example.com/thing.safetensors',
  approxMb: 100,
  note: 'test asset',
  ...over,
})

const existsIn = (...paths: string[]) => async (p: string) => paths.includes(p)

describe('planModelAssembly', () => {
  it('skips assets already in the managed tree', async () => {
    const plan = await planModelAssembly([asset({})], { managedModelsDir: MANAGED, liveModelsDir: LIVE }, {
      fileExists: existsIn(`${MANAGED}\\checkpoints\\thing.safetensors`),
    })
    expect(plan[0]).toMatchObject({ kind: 'skip' })
  })

  it('prefers copying from a live install over downloading', async () => {
    const plan = await planModelAssembly([asset({})], { managedModelsDir: MANAGED, liveModelsDir: LIVE }, {
      fileExists: existsIn(`${LIVE}\\checkpoints\\thing.safetensors`),
    })
    expect(plan[0]).toMatchObject({
      kind: 'copy',
      from: `${LIVE}\\checkpoints\\thing.safetensors`,
      to: `${MANAGED}\\checkpoints\\thing.safetensors`,
    })
  })

  it('downloads when absent everywhere and a url exists', async () => {
    const plan = await planModelAssembly([asset({})], { managedModelsDir: MANAGED, liveModelsDir: LIVE }, {
      fileExists: async () => false,
    })
    expect(plan[0]).toMatchObject({ kind: 'download' })
  })

  it('flags token-gated assets as manual when no live copy exists', async () => {
    const plan = await planModelAssembly([asset({ url: null })], { managedModelsDir: MANAGED, liveModelsDir: LIVE }, {
      fileExists: async () => false,
    })
    expect(plan[0]).toMatchObject({ kind: 'manual' })
    expect((plan[0] as { reason: string }).reason).toBeTruthy()
  })

  it('still copies a token-gated asset when the live install has it', async () => {
    const plan = await planModelAssembly([asset({ url: null })], { managedModelsDir: MANAGED, liveModelsDir: LIVE }, {
      fileExists: existsIn(`${LIVE}\\checkpoints\\thing.safetensors`),
    })
    expect(plan[0]).toMatchObject({ kind: 'copy' })
  })

  it('handles a fresh machine (no live install) — download or manual only', async () => {
    const plan = await planModelAssembly(
      [asset({}), asset({ name: 'gated.safetensors', url: null })],
      { managedModelsDir: MANAGED, liveModelsDir: null },
      { fileExists: async () => false },
    )
    expect(plan.map((a) => a.kind)).toEqual(['download', 'manual'])
  })
})

describe('executeCopy', () => {
  const copyAction = {
    kind: 'copy' as const,
    name: 'thing.safetensors',
    from: `${LIVE}\\checkpoints\\thing.safetensors`,
    to: `${MANAGED}\\checkpoints\\thing.safetensors`,
    approxMb: 100,
  }

  it('ensures the target dir, copies, and verifies size parity', async () => {
    const ps: string[] = []
    const dirs: string[] = []
    let copied = false
    const result = await executeCopy(copyAction, {
      runPowerShell: async (cmd) => {
        ps.push(cmd)
        copied = true
        return ''
      },
      ensureDir: async (p) => {
        dirs.push(p)
      },
      statSize: async (p) => (p === copyAction.from || copied ? 104857600 : null),
    })
    expect(result.ok).toBe(true)
    expect(dirs).toContain(`${MANAGED}\\checkpoints`)
    expect(ps[0]).toContain(copyAction.from)
    expect(ps[0]).toContain(copyAction.to)
  })

  it('fails when the copy lands with a different size', async () => {
    const result = await executeCopy(copyAction, {
      runPowerShell: async () => '',
      ensureDir: async () => {},
      statSize: async (p) => (p === copyAction.from ? 104857600 : 12345),
    })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/size/i)
  })
})
