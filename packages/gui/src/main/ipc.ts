import { ipcMain, type BrowserWindow, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { isTrustedDocument, validateIpcArguments } from './ipc-policy'

let getWindow: () => BrowserWindow | null = () => null
let documentUrl = ''

export function configureIpcSecurity(window: () => BrowserWindow | null, url: string): void {
  getWindow = window
  documentUrl = url
}

function authorize(event: IpcMainEvent | IpcMainInvokeEvent, channel: string, args: unknown[]): void {
  const win = getWindow()
  if (!win || win.isDestroyed() || event.sender !== win.webContents
    || event.senderFrame !== win.webContents.mainFrame
    || !isTrustedDocument(event.senderFrame?.url ?? '', documentUrl)) {
    throw new Error('Untrusted desktop request')
  }
  validateIpcArguments(channel, args)
}

/** Every preload operation passes both sender authorization and runtime validation. */
export const trustedIpc = {
  handle(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void {
    ipcMain.handle(channel, (event, ...args) => {
      authorize(event, channel, args)
      return listener(event, ...args)
    })
  },
  on(channel: string, listener: (event: IpcMainEvent, ...args: any[]) => void): void {
    ipcMain.on(channel, (event, ...args) => {
      try { authorize(event, channel, args) } catch { return }
      listener(event, ...args)
    })
  },
}
