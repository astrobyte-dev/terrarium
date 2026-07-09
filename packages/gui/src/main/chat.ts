import { BrowserWindow, ipcMain } from 'electron'
import WebSocket from 'ws'
import { createChatClient, createWindowsSystem, isProactiveNudge, type ChatClient, type ChatMessage } from '@terrarium/core'
import type { ChatConnectResult } from '../shared/contract'
import { setupProactive } from './proactive'

// In-app chat = a second front end on the SAME brain/session as Telegram
// (agent:main:main). All the hard parts (WS handshake, device signing, reply
// reconciliation) live in @terrarium/core's chat client; we host it in main
// and bridge to the renderer. Electron's Node has no global WebSocket, so we
// inject `ws`.
export function setupChat(getWin: () => BrowserWindow | null): void {
  const system = createWindowsSystem()
  let client: ChatClient | null = null
  let connected = false
  const send = (channel: string, payload: unknown) => getWin()?.webContents.send(channel, payload)

  // "She texts you first" — idle-aware proactive messages, in-app only. Fires a hidden
  // nudge through this same client so her opener is in-character and lands in the app.
  const proactive = setupProactive({
    getWin,
    isConnected: () => connected && client !== null,
    sendNudge: async (text) => {
      if (client) await client.send(text)
    },
  })

  function ensureClient(): ChatClient {
    if (client) return client
    const c = createChatClient({
      system,
      WebSocketImpl: WebSocket as unknown as typeof globalThis.WebSocket,
    })
    c.on('reply', (m: ChatMessage) => {
      connected = true
      proactive.noteActivity({ role: 'assistant', text: m.text })
      send('chat:message', m)
    })
    c.on('status', (state, detail) => {
      connected = state === 'ready' || state === 'sending'
      send('chat:status', { state, detail })
    })
    c.on('error', (message) => {
      connected = false
      send('chat:status', { state: 'error', detail: message })
    })
    client = c
    return c
  }

  ipcMain.handle('chat:connect', async (): Promise<ChatConnectResult> => {
    try {
      const c = ensureClient()
      await c.connect()
      connected = true
      const history = await c.history(40)
      proactive.seedFromHistory(history)
      proactive.start()
      // Hidden proactive nudges are our own OOC directives — never show them in the UI.
      const shown = history.filter((m) => !(m.role === 'user' && isProactiveNudge(m.text)))
      return { ok: true, history: shown }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e), history: [] }
    }
  })

  ipcMain.handle('chat:send', async (_e, text: string): Promise<{ ok: boolean; message?: string }> => {
    try {
      if (!client) return { ok: false, message: 'not connected' }
      proactive.noteActivity({ role: 'user', text })
      await client.send(text)
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) }
    }
  })
}
