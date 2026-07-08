import { describe, expect, it, vi } from 'vitest'
import { CUSTOM_NODES, installBundledNode, installGitNode } from './comfy-nodes'

const PATHS = { customNodesDir: 'C:\\comfy\\custom_nodes', embeddedPython: 'C:\\comfy\\py\\python.exe' }
const node = (name: string) => CUSTOM_NODES.find((n) => n.name === name)!

describe('CUSTOM_NODES', () => {
  it('splits standard git repos from bespoke bundled nodes', () => {
    expect(node('comfyui-ollama').repo).toContain('github.com')
    expect(node('character_ipadapter').repo).toBeNull()
    expect(node('prompt_model_switcher').repo).toBeNull()
  })
})

describe('installGitNode', () => {
  it('is idempotent — a present node is not re-cloned', async () => {
    const ps: string[] = []
    const result = await installGitNode(node('comfyui-ollama'), PATHS, {
      runPowerShell: async (cmd) => {
        ps.push(cmd)
        return ''
      },
      fileExists: async (p) => p.endsWith('comfyui-ollama'),
    })
    expect(result.message).toMatch(/already present/)
    expect(ps).toEqual([])
  })

  it('clones then pip-installs when the node is absent, using the embedded python', async () => {
    const ps: string[] = []
    let cloned = false
    const result = await installGitNode(node('comfyui-ollama'), PATHS, {
      runPowerShell: async (cmd) => {
        ps.push(cmd)
        if (cmd.includes('git clone')) cloned = true
        return ''
      },
      fileExists: async (p) => {
        if (p.endsWith('comfyui-ollama')) return cloned // absent until cloned
        if (p.endsWith('requirements.txt')) return true
        return false
      },
    })
    expect(result.ok).toBe(true)
    expect(ps.some((c) => c.includes('git clone') && c.includes('comfyui-ollama'))).toBe(true)
    const pip = ps.find((c) => c.includes('pip install'))!
    expect(pip).toContain(PATHS.embeddedPython)
    expect(pip).toContain('requirements.txt')
  })

  it('skips pip for a node that declares no requirements', async () => {
    const ps: string[] = []
    let cloned = false
    await installGitNode(node('ComfyUI_IPAdapter_plus'), PATHS, {
      runPowerShell: async (cmd) => {
        ps.push(cmd)
        if (cmd.includes('git clone')) cloned = true
        return ''
      },
      fileExists: async (p) => (p.endsWith('ComfyUI_IPAdapter_plus') ? cloned : false),
    })
    expect(ps.some((c) => c.includes('pip install'))).toBe(false)
  })

  it('refuses to clone a bundled/local node', async () => {
    const result = await installGitNode(node('character_ipadapter'), PATHS, {
      runPowerShell: vi.fn(),
      fileExists: async () => false,
    })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/bundled|local|copy/i)
  })

  it('reports a git failure clearly', async () => {
    const result = await installGitNode(node('comfyui-ollama'), PATHS, {
      runPowerShell: async () => {
        throw new Error('fatal: could not resolve host')
      },
      fileExists: async () => false,
    })
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/git clone failed/)
  })
})

describe('installBundledNode', () => {
  const B_PATHS = { customNodesDir: 'C:\\comfy\\custom_nodes', bundledDir: 'C:\\terrarium\\assets\\comfy-nodes' }
  const deps = (files: Record<string, string>) => {
    const writes: Record<string, string> = {}
    const dirs: string[] = []
    return {
      writes,
      dirs,
      io: {
        fileExists: async (p: string) => p in files,
        readTextFile: async (p: string) => {
          const text = files[p]
          if (text === undefined) throw new Error(`ENOENT: ${p}`)
          return text
        },
        writeTextFile: async (p: string, text: string) => {
          writes[p] = text
        },
        ensureDir: async (p: string) => {
          dirs.push(p)
        },
      },
    }
  }

  it('refuses a git node — clone it, do not copy', async () => {
    const d = deps({})
    const result = await installBundledNode(node('comfyui-ollama'), B_PATHS, d.io)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/git|clone/i)
  })

  it('copies the bundled source into custom_nodes', async () => {
    const src = 'C:\\terrarium\\assets\\comfy-nodes\\random_seed\\__init__.py'
    const d = deps({ [src]: 'NODE_CLASS_MAPPINGS = {}' })
    const result = await installBundledNode(node('random_seed'), B_PATHS, d.io)
    expect(result.ok).toBe(true)
    expect(d.dirs).toContain('C:\\comfy\\custom_nodes\\random_seed')
    expect(d.writes['C:\\comfy\\custom_nodes\\random_seed\\__init__.py']).toBe('NODE_CLASS_MAPPINGS = {}')
  })

  it('is idempotent — an installed node is not rewritten', async () => {
    const src = 'C:\\terrarium\\assets\\comfy-nodes\\random_seed\\__init__.py'
    const target = 'C:\\comfy\\custom_nodes\\random_seed\\__init__.py'
    const d = deps({ [src]: 'new', [target]: 'old' })
    const result = await installBundledNode(node('random_seed'), B_PATHS, d.io)
    expect(result.ok).toBe(true)
    expect(result.message).toMatch(/already present/)
    expect(Object.keys(d.writes)).toEqual([])
  })

  it('fails loudly when the bundled source is missing from the app', async () => {
    const d = deps({})
    const result = await installBundledNode(node('write_text_file'), B_PATHS, d.io)
    expect(result.ok).toBe(false)
    expect(result.message).toMatch(/missing|not found/i)
  })
})
