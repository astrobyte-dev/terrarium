import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import { useEffect, useState } from 'react'
import { createChatClient, type ChatClient, type ChatMessage } from '@terrarium/core'
import { createWindowsSystem } from '@terrarium/core'

export function ChatScreen({ onExit, botLabel }: { onExit: () => void; botLabel: string | null }) {
  const [client, setClient] = useState<ChatClient | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState('connecting…')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const c = createChatClient({ system: createWindowsSystem() })
    c.on('history', (msgs) => setMessages(msgs))
    c.on('reply', (m) => setMessages((prev) => dedupeTail([...prev, m])))
    c.on('status', (s, d) => setStatus(s === 'ready' ? 'connected' : `${s} · ${d}`))
    c.on('error', (m) => setStatus(`error: ${m}`))
    c.connect()
      .then(() => c.history(30))
      .catch((err: Error) => setStatus(`error: ${err.message}`))
    setClient(c)
    return () => c.close()
  }, [])

  useInput((_input, key) => {
    if (key.escape) {
      client?.close()
      onExit()
    }
  })

  async function submit(text: string) {
    const trimmed = text.trim()
    if (trimmed === '' || client === null || busy) return
    setDraft('')
    setBusy(true)
    try {
      await client.send(trimmed)
    } catch (err) {
      setStatus(`send failed: ${err instanceof Error ? err.message : String(err)}`)
    }
    setBusy(false)
  }

  const visible = messages.slice(-16)
  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan">
          {' '}Chat{botLabel === null ? '' : ` · ${botLabel}`} — {status}
        </Text>
      </Box>
      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} minHeight={10}>
        {visible.length === 0 ? (
          <Text dimColor>no messages yet — say something below</Text>
        ) : (
          visible.map((m, i) => (
            <Box key={i} flexDirection="column" marginBottom={1}>
              <Text bold color={m.role === 'user' ? 'green' : 'magenta'}>
                {m.role === 'user' ? 'you' : 'bot'}
              </Text>
              <Text wrap="wrap">{m.text}</Text>
            </Box>
          ))
        )}
      </Box>
      <Box>
        <Text color="green">{busy ? '  … ' : '❯ '}</Text>
        <TextInput value={draft} onChange={setDraft} onSubmit={submit} placeholder="type a message" />
      </Box>
      <Text dimColor> enter send · esc back to dashboard{busy ? ' · waiting for reply…' : ''}</Text>
    </Box>
  )
}

// The user echo plus a reconciled history entry can arrive as a pair; drop an
// immediate exact-duplicate tail so the same line never shows twice.
function dedupeTail(list: ChatMessage[]): ChatMessage[] {
  const n = list.length
  if (n >= 2 && list[n - 1]!.role === list[n - 2]!.role && list[n - 1]!.text === list[n - 2]!.text) {
    return list.slice(0, n - 1)
  }
  return list
}
