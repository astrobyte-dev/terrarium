import { configureIpcSecurity } from './ipc'
import { rendererPreferences, secureWindow } from './window-security'
import { trustedIpc as ipcMain } from './ipc'
import { join } from 'node:path'
import { appendFileSync, mkdirSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, Tray, Menu, nativeImage, net, protocol } from 'electron'
import { setupCore } from './core'
import { setupChat } from './chat'
import { setupBrains } from './brains'
import { setupBots } from './bots'
import { setupCharacters } from './characters'
import { setupMemory } from './memory'
import { resolveVoiceAudio, setupVoice } from './voice'
import { setupDoctor } from './doctor'
import { resolveInboxImage, setupInbox } from './inbox'
import { setupGenSettings } from './gensettings'
import { resolvePortraitImage, resolveRefImage, setupPortraits } from './portraits'

// A packaged tray app has no console — boot milestones and crashes go to
// %LOCALAPPDATA%\Terrarium\gui-boot.log so failures are diagnosable at all.
const logDir = join(process.env['LOCALAPPDATA'] ?? '.', 'Terrarium')
function bootlog(line: string): void {
  try {
    mkdirSync(logDir, { recursive: true })
    appendFileSync(join(logDir, 'gui-boot.log'), `${new Date().toISOString()} ${line}\n`)
  } catch {
    /* logging must never take the app down */
  }
}
process.on('uncaughtException', (err) => {
  bootlog(`uncaughtException: ${err?.stack ?? err}`)
  process.exit(1) // don't touch electron.app here — it may be what threw
})
process.on('unhandledRejection', (reason) => bootlog(`unhandledRejection: ${reason}`))
bootlog(`boot pid=${process.pid} packaged=${app.isPackaged}`)

let win: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false

// Two Terrarium instances = two owned gateways = the documented poison loop.
// The second instance exits immediately and hands focus to the first.
const isPrimaryInstance = app.requestSingleInstanceLock()
if (!isPrimaryInstance) {
  bootlog('second instance — quitting')
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
}

// Serve inbox photos over a custom scheme scoped to the inbox dir (path-traversal
// guarded in resolveInboxImage) instead of loosening CSP to file: (whole-disk read).
// Must be registered before the app is ready.
protocol.registerSchemesAsPrivileged([
  { scheme: 'terrarium', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

// Packaged: tray.png ships in extraResources next to the asar (not inside it).
const iconPath = app.isPackaged
  ? join(process.resourcesPath, 'tray.png')
  : join(__dirname, '../../resources/tray.png')

const rendererUrl = !app.isPackaged && process.env['ELECTRON_RENDERER_URL']
  ? process.env['ELECTRON_RENDERER_URL']!
  : pathToFileURL(join(__dirname, '../renderer/index.html')).href

function createWindow(): void {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false, // custom title bar owns the chrome (the Terrarium look)
    backgroundColor: '#0E1512', // Living Glass ground — no white flash on open
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      ...rendererPreferences,
    },
  })

  secureWindow(win, rendererUrl)
  configureIpcSecurity(() => win, rendererUrl)

  win.on('ready-to-show', () => win?.show())

  // Tray app: closing the window minimises to tray; services keep running.
  // A real quit is explicit (tray menu / app:quit).
  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault()
      win?.hide()
    }
  })

  void win.loadURL(rendererUrl)
}

function showWindow(): void {
  if (!win) createWindow()
  win?.show()
  win?.focus()
}

function createTray(): void {
  const img = nativeImage.createFromPath(iconPath)
  tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img)
  tray.setToolTip('Terrarium')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Terrarium', click: () => showWindow() },
      {
        label: 'Start on login',
        type: 'checkbox',
        enabled: app.isPackaged, // in dev this would register the bare electron binary
        checked: app.isPackaged && app.getLoginItemSettings().openAtLogin,
        click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked }),
      },
      { type: 'separator' },
      {
        label: 'Quit Terrarium',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ]),
  )
  tray.on('click', () => showWindow())
}

app.whenReady().then(() => {
  if (!isPrimaryInstance) return // quitting — never spawn a duplicate supervisor
  bootlog('ready')

  // terrarium://inbox|portraits|ref/<file> -> a scoped, traversal-guarded file on disk.
  protocol.handle('terrarium', (request) => {
    const { host, pathname } = new URL(request.url)
    const abs =
      host === 'inbox'
        ? resolveInboxImage(pathname)
        : host === 'portraits'
          ? resolvePortraitImage(pathname)
          : host === 'ref'
            ? resolveRefImage(pathname)
            : host === 'voice'
              ? resolveVoiceAudio(pathname)
              : null
    if (!abs) return new Response('not found', { status: 404 })
    return net.fetch(pathToFileURL(abs).toString())
  })

  createWindow()
  createTray()
  setupCore(() => win) // live supervisor: status/logs/actions
  setupChat(() => win) // in-app chat over the gateway WebSocket
  setupInbox(() => win) // pic daemon → inbox → image bubbles (M8c)
  setupPortraits() // Bot Builder profile-portrait generation via ComfyUI
  setupBrains() // safe in-place primary-model swap
  setupBots() // create companions (full card + AGENTS.md compact card)
  setupCharacters() // manage the roster (view sizes, remove to reclaim AGENTS.md budget)
  setupMemory() // curated long-term memory (workspace/MEMORY.md) + auto-facts view
  setupVoice() // Kokoro voice notes (CPU/ONNX) + per-character preset voices
  setupGenSettings() // live pic toggles (face lock, feet focus) → gen_settings.json for the daemon
  setupDoctor() // read-only health check
  bootlog('setup complete')

  ipcMain.on('window:minimize', () => win?.minimize())
  ipcMain.on('window:hide', () => win?.hide())
  ipcMain.on('app:quit', () => {
    quitting = true
    app.quit()
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Tray app: do NOT quit when the window is hidden/closed.
app.on('window-all-closed', () => {})
