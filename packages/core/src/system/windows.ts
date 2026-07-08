import { execFile, spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import { promisify } from 'node:util'
import type { DirEntry, SpawnHandle, SpawnSpec, SystemPort } from './system-port'
import { createLineSplitter } from './line-splitter'

const execFileAsync = promisify(execFile)

function spawnHidden(spec: SpawnSpec): SpawnHandle {
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, ...spec.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  const stdoutCbs: Array<(line: string) => void> = []
  const stderrCbs: Array<(line: string) => void> = []
  const exitCbs: Array<(code: number | null) => void> = []
  const out = createLineSplitter((l) => stdoutCbs.forEach((cb) => cb(l)))
  const err = createLineSplitter((l) => stderrCbs.forEach((cb) => cb(l)))
  child.stdout?.on('data', (d: Buffer) => out.push(d.toString('utf8')))
  child.stderr?.on('data', (d: Buffer) => err.push(d.toString('utf8')))

  let exitCode: number | null = null
  let exitFired = false
  const fireExit = (code: number | null) => {
    if (exitFired) return
    exitFired = true
    exitCode = code
    out.flush()
    err.flush()
    exitCbs.forEach((cb) => cb(code))
  }
  child.once('exit', (code) => fireExit(code))
  child.once('error', () => fireExit(null))

  return {
    pid: child.pid ?? -1,
    onStdoutLine: (cb) => void stdoutCbs.push(cb),
    onStderrLine: (cb) => void stderrCbs.push(cb),
    onExit: (cb) => {
      if (exitFired) {
        cb(exitCode)
        return
      }
      exitCbs.push(cb)
    },
  }
}

export function createWindowsSystem(): SystemPort {
  return {
    async runPowerShell(command, opts) {
      // PS 5.1 emits cp1252 by default; force UTF-8 so node's decode is right.
      const utf8Command = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; ${command}`
      const { stdout } = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', utf8Command],
        {
          windowsHide: true,
          maxBuffer: 32 * 1024 * 1024,
          env: opts?.env === undefined ? process.env : { ...process.env, ...opts.env },
        },
      )
      return stdout
    },

    async fileExists(path) {
      try {
        await fs.access(path)
        return true
      } catch {
        return false
      }
    },

    readTextFile: (path) => fs.readFile(path, 'utf8'),
    writeTextFile: (path, text) => fs.writeFile(path, text, 'utf8'),
    moveFile: (from, to) => fs.rename(from, to),
    deleteFile: (path) => fs.rm(path, { force: true }),
    ensureDir: async (path) => {
      await fs.mkdir(path, { recursive: true })
    },

    async statMtimeMs(path) {
      try {
        return (await fs.stat(path)).mtimeMs
      } catch {
        return null
      }
    },

    async statSize(path) {
      try {
        return (await fs.stat(path)).size
      } catch {
        return null
      }
    },

    async listDir(path): Promise<DirEntry[]> {
      let names: string[]
      try {
        names = await fs.readdir(path)
      } catch {
        return []
      }
      const entries = await Promise.all(
        names.map(async (name) => {
          try {
            return { name, mtimeMs: (await fs.stat(`${path}\\${name}`)).mtimeMs }
          } catch {
            return null
          }
        }),
      )
      return entries.filter((e): e is DirEntry => e !== null)
    },

    async readFileFrom(path, start) {
      const handle = await fs.open(path, 'r')
      try {
        const size = (await handle.stat()).size
        const length = Math.max(0, size - start)
        if (length === 0) return ''
        const buffer = Buffer.alloc(length)
        await handle.read(buffer, 0, length, start)
        return buffer.toString('utf8')
      } finally {
        await handle.close()
      }
    },

    probeTcp(port, timeoutMs) {
      return new Promise((resolve) => {
        const socket = net.createConnection({ host: '127.0.0.1', port })
        const done = (ok: boolean) => {
          socket.destroy()
          resolve(ok)
        }
        socket.setTimeout(timeoutMs)
        socket.once('connect', () => done(true))
        socket.once('timeout', () => done(false))
        socket.once('error', () => done(false))
      })
    },

    spawnProcess: spawnHidden,

    async killTree(pid) {
      try {
        await execFileAsync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true })
      } catch {
        // already gone — that's the goal
      }
    },

    totalRamMb: () => os.totalmem() / (1024 * 1024),

    async freeDiskMb(drive) {
      const st = await fs.statfs(`${drive}\\`)
      return (st.bsize * st.bavail) / (1024 * 1024)
    },

    env: (name) => process.env[name],
    now: () => Date.now(),
  }
}
