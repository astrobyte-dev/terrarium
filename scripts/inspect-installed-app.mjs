import { extractFile, listPackage } from '@electron/asar'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
const path = join(process.env.LOCALAPPDATA, 'Programs/@terrariumgui/resources/app.asar')
const pkg = JSON.parse(extractFile(path, 'package.json').toString())
console.log(JSON.stringify({name: pkg.name, main: pkg.main, files: listPackage(path).filter(p => /main|renderer|package\.json/.test(p)).slice(0, 15)}))
const main = extractFile(path, pkg.main.replace(/^\.\//, '').replaceAll('/', '\\')).toString()
const assets = listPackage(path).filter(p => /out\/renderer\/assets\/.*\.js$/.test(p.replaceAll('\\', '/')))
const renderer = assets.map(p => extractFile(path, p.replace(/^[/\\]/, '').replaceAll('/', '\\')).toString()).join('\n')
console.log(JSON.stringify({ name: pkg.name, version: pkg.version, main: pkg.main,
  hasDraftPersistence: renderer.includes('terrarium.chat.draft.v1'),
  hasModernStreaming: main.includes('deltaText'), hasPerformanceBroker: main.includes('18790'),
  userDataOverride: main.match(/setPath\([^\n]{0,160}/g) ?? [] }))
console.log('Installed Electron: ' + execFileSync(join(process.env.LOCALAPPDATA, 'Programs/@terrariumgui/Terrarium.exe'),
  ['-p', 'process.versions.electron'], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, encoding: 'utf8' }).trim())
