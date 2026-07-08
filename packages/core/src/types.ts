export type ServiceId = 'gateway' | 'ollama' | 'comfyui' | 'picDaemon'

export const SERVICE_IDS: readonly ServiceId[] = ['gateway', 'ollama', 'comfyui', 'picDaemon']

/**
 * Health is a ladder, not a boolean. `quiet`/`wedged` exist because the
 * gateway has been observed returning HTTP 200 for 16 hours while dead
 * (stalled provider stream) — port checks alone lie.
 */
export type HealthRung =
  | 'not-installed'
  | 'stopped'
  | 'starting' // process up, port not answering yet
  | 'port-open' // responding, but no log signal available to prove liveness
  | 'live'
  | 'quiet' // responding, log silent past the quiet threshold — worth a look
  | 'wedged' // responding, log silent past the wedge threshold — silent-hang signature
  | 'crashed' // owned process died; restart scheduled with backoff

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEvent {
  service: ServiceId
  ts: number
  level: LogLevel
  line: string
}

export interface InstallInfo {
  path: string
  version: string | null
  mode: 'adopted' | 'managed'
}

export interface ProcessInfo {
  pid: number
  name: string
  commandLine: string
}

export interface ServiceStatus {
  id: ServiceId
  name: string
  install: InstallInfo | null
  process: { pid: number; ownedByUs: boolean } | null
  portOpen: boolean | null // null = service has no port
  lastLogAt: number | null // epoch ms of last log write, null = no log source/file
  health: HealthRung
  detail: string
}

export interface GpuInfo {
  name: string
  vramMb: number
}

export interface AutostartEntry {
  kind: 'scheduled-task' | 'startup-folder'
  name: string
  state: string
}

export interface SystemReport {
  gpus: GpuInfo[]
  ramMb: number
  freeDiskMbC: number
  installs: Record<ServiceId, InstallInfo | null>
  autostart: AutostartEntry[]
}
