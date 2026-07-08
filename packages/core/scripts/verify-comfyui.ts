/**
 * Boot the managed ComfyUI portable on its own port and confirm it serves the
 * API, then kill it. Proves the runtime install works end to end without
 * touching the live C:\ComfyUI on 8188. (Models/render = follow-up milestone.)
 */
import { MANAGED_COMFY_PORT, managedComfySpawn } from '../src/install/comfyui'
import { createWindowsSystem } from '../src/system/windows'

const system = createWindowsSystem()
const spec = managedComfySpawn()
console.log(`booting managed ComfyUI: ${spec.command} (port ${MANAGED_COMFY_PORT})`)

const handle = system.spawnProcess(spec)
handle.onStderrLine((l) => { if (/error|traceback|to see the gui/i.test(l)) console.log('  ﹥', l.slice(0, 120)) })
handle.onStdoutLine((l) => { if (/to see the gui|starting server|import times/i.test(l)) console.log('  ﹥', l.slice(0, 120)) })

const deadline = Date.now() + 180_000
let ok = false
while (Date.now() < deadline) {
  if (await system.probeTcp(MANAGED_COMFY_PORT, 1000)) {
    try {
      const res = await fetch(`http://127.0.0.1:${MANAGED_COMFY_PORT}/system_stats`)
      if (res.ok) {
        const stats = (await res.json()) as { devices?: Array<{ name?: string }>; system?: { comfyui_version?: string } }
        console.log(`\nOK — API responded. version=${stats.system?.comfyui_version ?? '?'} device=${stats.devices?.[0]?.name ?? '?'}`)
        ok = true
        break
      }
    } catch {
      /* port up but not serving yet */
    }
  }
  await new Promise((r) => setTimeout(r, 2000))
}

console.log(ok ? 'managed ComfyUI runtime verified.' : 'FAILED to verify within 180s')
await system.killTree(handle.pid)
console.log('managed instance stopped.')
process.exit(ok ? 0 : 1)
