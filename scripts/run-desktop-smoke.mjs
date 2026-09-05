import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const output = resolve('.desktop-smoke')
await build({ entryPoints: ['packages/gui/scripts/desktop-smoke.ts'], bundle: true, platform: 'node',
  format: 'cjs', external: ['electron'], outfile: resolve(output, 'main.cjs') })
const env = { ...process.env, TERRARIUM_SMOKE_OUTPUT: output,
  TERRARIUM_SMOKE_BUILD: resolve(process.argv[2] ?? 'packages/gui/out') }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(require('electron'), [resolve(output, 'main.cjs')], { env, stdio: 'inherit', windowsHide: true })
const timeout = setTimeout(() => { child.kill(); process.exitCode = 1 }, 60_000)
child.on('error', (error) => { clearTimeout(timeout); console.error(error); process.exitCode = 1 })
child.on('exit', (code) => { clearTimeout(timeout); process.exitCode = code ?? 1 })
