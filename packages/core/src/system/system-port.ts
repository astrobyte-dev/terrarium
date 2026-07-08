/**
 * The single seam between the functional core and the machine.
 * Everything above this interface is pure or near-pure and unit-testable;
 * `system/windows.ts` is the only real implementation (v1 is Windows-only,
 * but nothing above this file may assume that).
 */
export interface DirEntry {
  name: string
  mtimeMs: number
}

export interface SpawnSpec {
  command: string
  args: string[]
  cwd?: string
  /** Merged over the parent environment. */
  env?: Record<string, string>
}

export interface SpawnHandle {
  pid: number
  onStdoutLine(cb: (line: string) => void): void
  onStderrLine(cb: (line: string) => void): void
  /** Fires once; null code = spawn error or signal kill. */
  onExit(cb: (code: number | null) => void): void
}

export interface SystemPort {
  /**
   * Run a PowerShell command, return stdout. Rejects on non-zero exit.
   * `opts.env` is merged over the parent environment — the channel for
   * passing secrets without them appearing in any command line.
   */
  runPowerShell(command: string, opts?: { env?: Record<string, string> }): Promise<string>
  fileExists(path: string): Promise<boolean>
  readTextFile(path: string): Promise<string>
  writeTextFile(path: string, text: string): Promise<void>
  moveFile(from: string, to: string): Promise<void>
  deleteFile(path: string): Promise<void>
  ensureDir(path: string): Promise<void>
  /** null when the file does not exist. */
  statMtimeMs(path: string): Promise<number | null>
  /** null when the file does not exist. */
  statSize(path: string): Promise<number | null>
  /** Empty array when the directory does not exist. */
  listDir(path: string): Promise<DirEntry[]>
  /** Read file content from byte offset `start` to EOF. */
  readFileFrom(path: string, start: number): Promise<string>
  probeTcp(port: number, timeoutMs: number): Promise<boolean>
  /** Piped stdio, hidden window — no stray consoles, ever. */
  spawnProcess(spec: SpawnSpec): SpawnHandle
  /** Force-kill a process and its whole tree. Resolves even if already gone. */
  killTree(pid: number): Promise<void>
  totalRamMb(): number
  freeDiskMb(drive: string): Promise<number>
  env(name: string): string | undefined
  now(): number
}
