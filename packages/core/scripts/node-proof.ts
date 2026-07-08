/**
 * Prove the custom-node install path: clone comfyui-ollama into the managed
 * ComfyUI, boot it, and confirm ComfyUI actually LOADS the node (its class
 * appears in /object_info) — the real test that git+pip worked.
 */
import { CUSTOM_NODES, installGitNode } from '../src/install/comfy-nodes'
import { MANAGED_COMFY_PORT, managedComfySpawn } from '../src/install/comfyui'
import { createWindowsSystem } from '../src/system/windows'

const PORTABLE = 'C:\\Terrarium\\comfyui\\ComfyUI_windows_portable'
const system = createWindowsSystem()
const node = CUSTOM_NODES.find((n) => n.name === 'comfyui-ollama')!

console.log(`installing ${node.name}…`)
const install = await installGitNode(
  node,
  { customNodesDir: `${PORTABLE}\\ComfyUI\\custom_nodes`, embeddedPython: `${PORTABLE}\\python_embeded\\python.exe` },
  { runPowerShell: (c) => system.runPowerShell(c), fileExists: (p) => system.fileExists(p) },
)
console.log(`  ${install.message}`)
if (!install.ok) process.exit(1)

console.log('booting managed ComfyUI to confirm the node loads…')
const handle = system.spawnProcess(managedComfySpawn())
const base = `http://127.0.0.1:${MANAGED_COMFY_PORT}`
const deadline = Date.now() + 180_000
let loaded = false
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 2000))
  if (!(await system.probeTcp(MANAGED_COMFY_PORT, 1000))) continue
  try {
    const res = await fetch(`${base}/object_info`)
    if (!res.ok) continue
    const info = (await res.json()) as Record<string, unknown>
    const ollamaNodes = Object.keys(info).filter((k) => /ollama/i.test(k))
    if (ollamaNodes.length > 0) {
      console.log(`OK — ComfyUI loaded ${ollamaNodes.length} ollama node(s): ${ollamaNodes.join(', ')}`)
      loaded = true
    }
    break
  } catch {
    /* not serving yet */
  }
}
await system.killTree(handle.pid)
console.log(loaded ? 'custom-node install path verified.' : 'FAILED — node did not load')
process.exit(loaded ? 0 : 1)
