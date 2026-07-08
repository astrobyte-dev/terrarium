import type { DashboardView } from './types'

// Placeholder data for M7a so the shell renders and the themes can be judged.
// Wired to the live supervisor in M7b. (Brain reflects tonight's real swap.)
export const MOCK: DashboardView = {
  bot: { name: 'Ella', handle: '@Harry_the_hbot', live: true, uptime: 'up 3h 12m' },
  owner: 'terrarium',
  services: [
    { id: 'gateway', name: 'Gateway', port: ':8787', state: 'live', reached: 'live' },
    { id: 'ollama', name: 'Ollama', port: ':11434', state: 'live', reached: 'live' },
    { id: 'comfyui', name: 'ComfyUI', port: ':8188', state: 'live', reached: 'live' },
    { id: 'daemon', name: 'Pic daemon', port: 'tail', state: 'idle', reached: 'running' },
  ],
  brain: 'Gemma-4-31B-DarkIdol',
  gpu: { name: 'RTX 4070', usedGb: 8.1, totalGb: 12 },
  logs: [
    { ts: '22:41:07', svc: 'gateway', msg: 'telegram message from @corey -> agent:main:main' },
    { ts: '22:41:07', svc: 'ollama', msg: 'prompt eval 214 tok - 41 tok/s' },
    { ts: '22:41:09', svc: 'gateway', msg: 'reply delivered (2 chunks) - Ella' },
    { ts: '22:41:22', svc: 'comfyui', msg: '/system_stats ok - cuda:0 reserved 1.0 GB' },
    { ts: '22:41:40', svc: 'daemon', msg: 'idle - watching transcript for photo intent' },
    { ts: '22:42:03', svc: 'gateway', msg: 'heartbeat ok - last activity 23s ago' },
  ],
}
