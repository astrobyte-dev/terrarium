import type { BrowserWindow } from 'electron'
import { isTrustedDocument } from './ipc-policy'

export const rendererPreferences = { sandbox: true, contextIsolation: true, nodeIntegration: false, webviewTag: false } as const

export function secureWindow(win: BrowserWindow, documentUrl: string): void {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  win.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedDocument(url, documentUrl)) event.preventDefault()
  })
  win.webContents.on('will-attach-webview', (event) => event.preventDefault())
  win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  win.webContents.session.setPermissionCheckHandler(() => false)
}
