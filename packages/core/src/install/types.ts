export type ComponentId = 'ollama' | 'openclaw' | 'comfyui'

export interface ComponentPlan {
  id: ComponentId
  installed: { version: string | null; path: string } | null
  /** Human-readable steps install() would take. Empty when nothing to do. */
  actions: string[]
  downloadMb: number
  diskNeededMb: number
  /** Reasons install() cannot run — surfaced, never swallowed. */
  blockers: string[]
}

export interface InstallProgress {
  component: ComponentId | `model:${string}`
  phase: string
  /** null = indeterminate */
  percent: number | null
}

export interface InstallOutcome {
  ok: boolean
  message: string
}

export type OnProgress = (p: InstallProgress) => void

export interface ComponentInstaller {
  id: ComponentId
  plan(): Promise<ComponentPlan>
  install(onProgress?: OnProgress): Promise<InstallOutcome>
  verify(): Promise<boolean>
}
