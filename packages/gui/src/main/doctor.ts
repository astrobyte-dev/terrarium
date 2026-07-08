import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { ipcMain } from 'electron'
import { buildDoctorReport, createDpapiSecretStore, createWindowsSystem, gatherDoctorFacts } from '@terrarium/core'
import type { DoctorReportView } from '../shared/contract'

// What's actually running (openclaw.json primary) — the core doctor's brain check
// reads Terrarium's brain.json/default, which is stale on a hand-edited config.
function liveBrain(): string | null {
  try {
    return JSON.parse(readFileSync(join(homedir(), '.openclaw', 'openclaw.json'), 'utf8'))?.agents?.defaults?.model
      ?.primary ?? null
  } catch {
    return null
  }
}

// READ-ONLY: diagnose only. No repair — the core's repair regenerates config from
// the template, which would clobber Corey's hand-tuning.
export function setupDoctor(): void {
  ipcMain.handle('doctor:report', async (): Promise<DoctorReportView> => {
    const system = createWindowsSystem()
    const store = createDpapiSecretStore(system)
    const report = buildDoctorReport(await gatherDoctorFacts(system, store))
    const lb = liveBrain()
    return {
      healthy: report.healthy,
      checks: report.checks.map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status,
        detail: c.id === 'brain' && lb ? `active: ${lb}` : c.detail,
      })),
    }
  })
}
