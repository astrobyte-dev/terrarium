import { BrowserWindow, ipcMain } from 'electron'
import WebSocket from 'ws'
import { createChatClient, createWindowsSystem, type ChatClient, type ChatMessage } from '@terrarium/core'
import type { ChatConnectResult } from '../shared/contract'

// In-app chat = a second front end on the SAME brain/session as Telegram
// (agent:main:main). All the hard parts (WS handshake, device signing, reply
// reconciliation) live in @terrarium/core's chat client; we host it in main
// and bridge to the renderer. Electron's Node has no global WebSocket, so we
// inject `ws`.
export function setupChat(getWin: () => BrowserWindow | null): void {
  const system = createWindowsSystem()
  let client: ChatClient | null = null
  const send = (channel: string, payload: unknown) => getWin()?.webContents.send(channel, payload)

  function ensureClient(): ChatClient {
    if (client) return client
    const c = createChatClient({
      system,
      WebSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
    })
    c.on('reply', (m: ChatMessage) => send('chat:message', m))
    c.on('status', (state, detail) => send('chat:status', { state, detail }))
    c.on('error', (message) => send('chat:status', { state: 'error', detail: message }))
    client = c
    return c
  }

  ipcMain.handle('chat:connect', async (): Promise<ChatConnectResult> => {
    try {
      const c = ensureClient()
      await c.connect()
      const history = await c.history(40)
      return { ok: true, history }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e), history: [] }
    }
  })

  ipcMain.handle('chat:send', async (_e, text: string): Promise<{ ok: boolean; message?: string }> => {
    try {
      if (!client) return { ok: false, message: 'not connected' }
      await client.send(text)
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })
}
