import type { ComponentId, ComponentInstaller, ComponentPlan, OnProgress } from './types'

export interface StepPlan {
  id: ComponentId
  /** install() has work to do (already-installed components are skipped). */
  needed: boolean
  actions: string[]
  downloadMb: number
  diskNeededMb: number
  blockers: string[]
}

export interface InstallPlanSummary {
  steps: StepPlan[]
  /** Bytes we'll actually pull — only the steps that need work. */
  totalDownloadMb: number
  totalDiskNeededMb: number
  /** Every blocker, component-labeled, so the wizard can refuse to start honestly. */
  blockers: string[]
  ready: boolean
}

/** Fold each component's plan into one wizard-facing summary. Pure. */
export function summarizeInstallPlan(plans: ComponentPlan[]): InstallPlanSummary {
  const steps: StepPlan[] = plans.map((p) => ({
    id: p.id,
    needed: p.actions.length > 0,
    actions: p.actions,
    downloadMb: p.downloadMb,
    diskNeededMb: p.diskNeededMb,
    blockers: p.blockers,
  }))
  const needed = steps.filter((s) => s.needed)
  const blockers = plans.flatMap((p) => p.blockers.map((b) => `${p.id}: ${b}`))
  return {
    steps,
    totalDownloadMb: needed.reduce((n, s) => n + s.downloadMb, 0),
    totalDiskNeededMb: needed.reduce((n, s) => n + s.diskNeededMb, 0),
    blockers,
    ready: blockers.length === 0,
  }
}

export type StepStatus = 'skipped' | 'installed' | 'failed'

export interface StepResult {
  id: ComponentId
  status: StepStatus
  message: string
}

export interface RunOptions {
  onProgress?: OnProgress
  onStep?: (result: StepResult) => void
  /** Stop at the first failure (default) — dependents would fail anyway. */
  stopOnFailure?: boolean
}

/**
 * Install a set of components in the given (dependency) order. Each installer
 * is idempotent, so a re-run after a partial failure resumes: completed steps
 * re-plan to nothing and are skipped. A failure stops the run by default.
 */
export async function runInstallSequence(
  installers: ComponentInstaller[],
  opts: RunOptions = {},
): Promise<StepResult[]> {
  const results: StepResult[] = []
  const record = (result: StepResult) => {
    results.push(result)
    opts.onStep?.(result)
  }
  const stop = opts.stopOnFailure !== false

  for (const installer of installers) {
    try {
      const plan = await installer.plan()

      if (plan.blockers.length > 0) {
        record({ id: installer.id, status: 'failed', message: `blocked: ${plan.blockers.join('; ')}` })
        if (stop) break
        continue
      }
      if (plan.actions.length === 0) {
        record({ id: installer.id, status: 'skipped', message: 'already installed' })
        continue
      }

      const outcome = await installer.install(opts.onProgress)
      if (!outcome.ok) {
        record({ id: installer.id, status: 'failed', message: outcome.message })
        if (stop) break
        continue
      }

      const verified = await installer.verify()
      if (!verified) {
        record({ id: installer.id, status: 'failed', message: `installed but verify failed: ${outcome.message}` })
        if (stop) break
        continue
      }
      record({ id: installer.id, status: 'installed', message: outcome.message })
    } catch (err) {
      // An installer that throws (e.g. winget exits non-zero) must degrade to a
      // failed step, never crash the whole run with an unhandled rejection.
      record({ id: installer.id, status: 'failed', message: err instanceof Error ? err.message : String(err) })
      if (stop) break
    }
  }
  return results
}
