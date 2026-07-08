import type { AutostartEntry, InstallInfo, ServiceId, SystemReport } from '../types'
import type { SystemPort } from '../system/system-port'
import type { ServiceDefinition } from '../services/definitions'
import { NVIDIA_SMI_QUERY, parseNvidiaSmi } from './hardware'
import { OPENCLAW_TASKS_QUERY, parseScheduledTasksJson } from './autostart'
import { safe } from '../util/safe'

export async function detectSystem(
  sys: SystemPort,
  definitions: ServiceDefinition[],
): Promise<SystemReport> {
  const [gpuOut, tasksOut, freeDiskMbC, installPairs, startup] = await Promise.all([
    safe(() => sys.runPowerShell(NVIDIA_SMI_QUERY), ''),
    safe(() => sys.runPowerShell(OPENCLAW_TASKS_QUERY), ''),
    safe(() => sys.freeDiskMb('C:'), 0),
    Promise.all(
      definitions.map(
        async (d) => [d.id, await safe(() => d.detectInstall(sys), null)] as const,
      ),
    ),
    startupFolderEntries(sys),
  ])

  return {
    gpus: parseNvidiaSmi(gpuOut),
    ramMb: Math.round(sys.totalRamMb()),
    freeDiskMbC: Math.round(freeDiskMbC),
    installs: Object.fromEntries(installPairs) as Record<ServiceId, InstallInfo | null>,
    autostart: [...parseScheduledTasksJson(tasksOut), ...startup],
  }
}

async function startupFolderEntries(sys: SystemPort): Promise<AutostartEntry[]> {
  const dir = `${sys.env('APPDATA') ?? ''}\\Microsoft\\Windows\\Start Menu\\Programs\\Startup`
  const entries = await safe(() => sys.listDir(dir), [])
  return entries
    .filter((e) => /openclaw/i.test(e.name))
    .map((e) => ({ kind: 'startup-folder' as const, name: e.name, state: 'present' }))
}
