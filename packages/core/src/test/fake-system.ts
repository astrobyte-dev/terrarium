import type { SpawnHandle, SystemPort } from '../system/system-port'

export function neverExitHandle(pid: number): SpawnHandle {
  return { pid, onStdoutLine: () => {}, onStderrLine: () => {}, onExit: () => {} }
}

/** A SystemPort where every probe answers benignly; override what the test cares about. */
export function makeFakeSystem(overrides: Partial<SystemPort> = {}): SystemPort {
  let nextPid = 1000
  return {
    runPowerShell: async () => '',
    fileExists: async () => true,
    readTextFile: async () => '',
    writeTextFile: async () => {},
    moveFile: async () => {},
    deleteFile: async () => {},
    ensureDir: async () => {},
    statMtimeMs: async () => null,
    statSize: async () => 0,
    listDir: async () => [],
    readFileFrom: async () => '',
    probeTcp: async () => false,
    spawnProcess: () => neverExitHandle(nextPid++),
    killTree: async () => {},
    totalRamMb: () => 32768,
    freeDiskMb: async () => 100_000,
    env: () => undefined,
    now: () => Date.now(),
    ...overrides,
  }
}
