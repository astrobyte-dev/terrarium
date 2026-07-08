import type { ProcessInfo } from '../types'
import type { SystemPort } from '../system/system-port'
import { safe } from '../util/safe'

/** One PowerShell call covers every executable our services can run as. */
export const PROCESS_QUERY =
  'Get-CimInstance Win32_Process -Filter "Name=\'node.exe\' OR Name=\'ollama.exe\' OR Name=\'ollama app.exe\' OR Name=\'python.exe\' OR Name=\'pythonw.exe\'" | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress'

interface CimRow {
  ProcessId?: number
  Name?: string
  CommandLine?: string | null
}

export function createProcessLister(system: SystemPort): () => Promise<ProcessInfo[]> {
  return async () => parseCimProcesses(await safe(() => system.runPowerShell(PROCESS_QUERY), ''))
}

export function parseCimProcesses(json: string): ProcessInfo[] {
  const trimmed = json.trim()
  if (trimmed === '') return []

  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch {
    return []
  }

  // ConvertTo-Json emits a bare object for a single result, an array otherwise.
  const rows = (Array.isArray(parsed) ? parsed : [parsed]) as CimRow[]
  const processes: ProcessInfo[] = []
  for (const row of rows) {
    if (typeof row?.ProcessId !== 'number' || typeof row?.Name !== 'string') continue
    processes.push({ pid: row.ProcessId, name: row.Name, commandLine: row.CommandLine ?? '' })
  }
  return processes
}
