import { readFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { BrowserWindow, ipcMain, dialog } from 'electron'
import { createSupervisor, type Supervisor, type ServiceStatus, type ServiceId, type LogEvent } from '@terrarium/core'
import type { ActionRequest, ActionResult, MetaView, ServiceState, ServiceView } from '../shared/contract'

// The brain that's ACTUALLY running = openclaw.json's primary. (The core's
// currentBrain() reads Terrarium's own selection store, which is empty/default
// when the config was hand-edited — so it lied. Source of truth is the config.)
function liveBrain(): string | null {
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), '.openclaw', 'openclaw.json'), 'utf8'))
    return cfg?.agents?.defaults?.model?.primary ?? null
  } catch {
    return null
  }
}

// The gateway runs on 18789 on this machine; the pic daemon has no port (log tail).
const PORTS: Record<ServiceId, string> = {
  gateway: ':18789',
  ollama: ':11434',
  comfyui: ':8188',
  picDaemon: 'tail',
}

// HealthRung -> (ladder rung reached, coarse state). wedged = responding but
// silent-hang, so it is NOT counted as truly live.
function mapHealth(s: ServiceStatus): { reachedIdx: number; state: ServiceState } {
  switch (s.health) {
    case 'live':
      return { reachedIdx: 3, state: 'live' }
    case 'quiet':
      return { reachedIdx: 3, state: 'idle' }
    case 'wedged':
      return { reachedIdx: 2, state: 'down' }
    case 'port-open':
      return { reachedIdx: 2, state: 'idle' }
    case 'starting':
      return { reachedIdx: 1, state: 'idle' }
    case 'crashed':
      return { reachedIdx: s.process ? 1 : 0, state: 'down' }
    case 'stopped':
      return { reachedIdx: 0, state: 'down' }
    default:
      return { reachedIdx: -1, state: 'down' } // not-installed
  }
}

function mapStatus(s: ServiceStatus): ServiceView {
  const { reachedIdx, state } = mapHealth(s)
  return { id: s.id, name: s.name, port: PORTS[s.id] ?? '', state, reachedIdx, detail: s.detail }
}

const tagFor = (id: ServiceId): string => (id === 'picDaemon' ? 'daemon' : id)

function fmtTs(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// Live VRAM usage (MB) via nvidia-smi. null when unavailable — never throws.
function nvidiaUsedMb(): Promise<number | null> {
  return new Promise((resolve) => {
    execFile(
      'nvidia-smi',
      ['--query-gpu=memory.used', '--format=csv,noheader,nounits'],
      { timeout: 4000, windowsHide: true },
      (err, stdout) => {
        if (err) return resolve(null)
        const n = Number.parseInt(String(stdout).trim().split(/\r?\n/)[0] ?? '', 10)
        resolve(Number.isFinite(n) ? n : null)
      },
    )
  })
}

const DESTRUCTIVE = new Set<ActionRequest['type']>(['stop', 'restart', 'restartAll', 'migrate', 'release'])

function confirmCopy(req: ActionRequest): { message: string; ok: string } {
  const name = req.label ?? req.id ?? 'services'
  switch (req.type) {
    case 'stop':
      return { message: `Stop ${name}?`, ok: 'Stop' }
    case 'restart':
      return { message: `Restart ${name}?`, ok: 'Restart' }
    case 'restartAll':
      return { message: 'Restart all services?', ok: 'Restart all' }
    case 'migrate':
      return {
        message:
          'Migrate — Terrarium takes over? It stops the standalone gateway, disables the OpenClaw scheduled tasks, and runs every service itself. They stay up while Terrarium is open, and Start/Restart here will control them. Reversible any time via Release.',
        ok: 'Migrate',
      }
    case 'release':
      return {
        message: 'Release — stop the services Terrarium is running and hand them back to the scheduled tasks?',
        ok: 'Release',
      }
    default:
      return { message: `${req.type}?`, ok: 'OK' }
  }
}

async function runAction(sup: Supervisor, win: BrowserWindow | null, req: ActionRequest): Promise<ActionResult> {
  if (win && DESTRUCTIVE.has(req.type)) {
    const c = confirmCopy(req)
    const r = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Cancel', c.ok],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      message: c.message,
      detail: 'This affects the live services running your bot.',
    })
    if (r.response === 0) return { ok: false, message: 'Cancelled' }
  }
  try {
    switch (req.type) {
      case 'start':
        await sup.start(req.id as ServiceId)
        break
      case 'stop':
        await sup.stop(req.id as ServiceId)
        break
      case 'restart':
        await sup.restart(req.id as ServiceId)
        break
      case 'restartAll':
        await sup.stopAll()
        await sup.startAll()
        break
      case 'migrate': {
        const rep = await sup.migrate()
        await sup.refresh().catch(() => {})
        const warnings = Array.isArray((rep as { warnings?: unknown }).warnings)
          ? ((rep as { warnings?: string[] }).warnings as string[])
          : []
        return {
          ok: true,
          message: warnings.length
            ? `Migrated, with ${warnings.length} warning(s): ${warnings.join(' · ')}`
            : 'Migrated — Terrarium now owns the services (they run while Terrarium is open)',
        }
      }
      case 'release':
        await sup.release()
        break
    }
    await sup.refresh().catch(() => {})
    return { ok: true, message: `${req.label ?? req.type}: done` }
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) }
  }
}

/** Wire the live supervisor to the renderer: push status/log/meta, handle actions. */
export function setupCore(getWin: () => BrowserWindow | null): void {
  const sup = createSupervisor()
  let logSeq = 0
  let identity: { firstName: string; username: string } | null = null
  let gpuStatic: { name: string; totalGb: number } | null = null
  let metaInit = false

  const send = (channel: string, payload: unknown) => getWin()?.webContents.send(channel, payload)

  // botIdentity (network getMe) and detectSystem (nvidia-smi) are slow — fetch once, cache.
  async function ensureSlowMeta(): Promise<void> {
    if (metaInit) return
    metaInit = true
    identity = await sup.botIdentity().catch(() => null)
    const sys = await sup.detectSystem().catch(() => null)
    const g = sys?.gpus?.[0]
    gpuStatic = g ? { name: g.name, totalGb: Math.round((g.vramMb / 1024) * 10) / 10 } : null
  }

  async function buildMeta(): Promise<MetaView> {
    await ensureSlowMeta()
    const owner = (await sup.ownership().catch(() => null)) !== null ? 'terrarium' : 'tasks'
    const brainRef = liveBrain() ?? (await sup.currentBrain().catch(() => '—'))
    const gwLive = sup.statuses().find((s) => s.id === 'gateway')?.health === 'live'
    const usedMb = gpuStatic ? await nvidiaUsedMb() : null
    const gpu = gpuStatic
      ? { ...gpuStatic, usedGb: usedMb !== null ? Math.round((usedMb / 1024) * 10) / 10 : null }
      : null
    return {
      bot: identity ? { name: identity.firstName || 'bot', handle: '@' + identity.username, live: gwLive } : null,
      owner,
      brain: brainRef.split('/').pop() ?? brainRef,
      gpu,
    }
  }

  sup.on('status', () => {
    send('core:services', sup.statuses().map(mapStatus))
    void buildMeta().then((m) => send('core:meta', m))
  })
  sup.on('log', (e: LogEvent) =>
    send('core:log', { id: ++logSeq, ts: fmtTs(e.ts), svc: tagFor(e.service), msg: e.line, level: e.level }),
  )

  ipcMain.handle('core:getState', async () => {
    await sup.refresh().catch(() => {})
    return { services: sup.statuses().map(mapStatus), meta: await buildMeta() }
  })
  ipcMain.handle('core:action', async (_e, req: ActionRequest): Promise<ActionResult> => runAction(sup, getWin(), req))

  sup.startMonitoring()
}
