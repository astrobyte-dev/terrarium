import type { AutostartEntry } from '../types'

export const OPENCLAW_TASKS_QUERY =
  "Get-ScheduledTask | Where-Object { $_.TaskName -like '*OpenClaw*' -or $_.TaskName -eq 'Terrarium Inference' } | Select-Object TaskName,State | ConvertTo-Json -Compress"

// Microsoft.PowerShell.Cmdletization.GeneratedTypes.ScheduledTask.StateEnum
const TASK_STATES: Record<number, string> = {
  0: 'Unknown',
  1: 'Disabled',
  2: 'Queued',
  3: 'Ready',
  4: 'Running',
}

interface TaskRow {
  TaskName?: string
  State?: number
}

export function parseScheduledTasksJson(json: string): AutostartEntry[] {
  const trimmed = json.trim()
  if (trimmed === '') return []

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return []
  }

  const rows = (Array.isArray(parsed) ? parsed : [parsed]) as TaskRow[]
  const entries: AutostartEntry[] = []
  for (const row of rows) {
    if (typeof row?.TaskName !== 'string') continue
    const state =
      typeof row.State === 'number' ? (TASK_STATES[row.State] ?? String(row.State)) : 'Unknown'
    entries.push({ kind: 'scheduled-task', name: row.TaskName, state })
  }
  return entries
}
