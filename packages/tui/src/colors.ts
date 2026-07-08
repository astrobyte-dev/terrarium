import type { HealthRung, LogLevel, ServiceId } from '@terrarium/core'

export const healthColor: Record<HealthRung, string> = {
  live: 'green',
  quiet: 'yellow',
  starting: 'yellow',
  'port-open': 'yellow',
  wedged: 'red',
  crashed: 'red',
  stopped: 'gray',
  'not-installed': 'gray',
}

export const serviceColor: Record<ServiceId, string> = {
  gateway: 'cyan',
  ollama: 'green',
  comfyui: 'magenta',
  picDaemon: 'yellow',
}

export const levelColor: Record<LogLevel, string> = {
  debug: 'gray',
  info: 'white',
  warn: 'yellow',
  error: 'red',
}
