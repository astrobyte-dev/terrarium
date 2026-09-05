import { trustedIpc as ipcMain } from './ipc'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import {
  buildDoctorReport,
  createDpapiSecretStore,
  createWindowsSystem,
  gatherDoctorFacts,
  repairConfig,
} from '@terrarium/core'
import type { DoctorRepairResult, DoctorReportView } from '../shared/contract'

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

// Diagnose + safe repair. Since M8a, config regeneration PRESERVES hand-tuning
// (models/primary/params), so repair no longer clobbers a tuned config — it only
// realigns app-owned structure + secret placement. Repair is confirm-gated in the UI
// and surfaced only when a check is actually fixable.
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
        fix: c.fix,
      })),
    }
  })

  ipcMain.handle('doctor:repair', async (): Promise<DoctorRepairResult> => {
    try {
      const system = createWindowsSystem()
      const store = createDpapiSecretStore(system)
      const r = await repairConfig(system, store)
      return { ok: true, repaired: r.repaired, changed: r.changed, message: r.message }
    } catch (e) {
      return { ok: false, repaired: false, changed: false, message: e instanceof Error ? e.message : String(e) }
    }
  })
}
