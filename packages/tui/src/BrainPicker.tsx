import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import {
  MODEL_CATALOG,
  SECRET_NAMES,
  resolveBrainChoice,
  trafficLight,
  type CatalogEntry,
  type Hardware,
  type Supervisor,
} from '@terrarium/core'

const lightColor = { green: 'green', amber: 'yellow', red: 'red' } as const

// Selectable brains first (configured + non-reasoning), guidance rows after.
const ENTRIES = MODEL_CATALOG

export function BrainPicker(props: { supervisor: Supervisor; onExit: () => void }) {
  const [hw, setHw] = useState<Hardware | null>(null)
  const [current, setCurrent] = useState<string>('')
  const [cursor, setCursor] = useState(0)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [claudeReady, setClaudeReady] = useState(false)

  useEffect(() => {
    void props.supervisor
      .detectSystem()
      .then((r) => setHw({ vramMb: r.gpus[0]?.vramMb ?? 0, ramMb: r.ramMb }))
      .catch(() => setHw({ vramMb: 0, ramMb: 0 }))
    void props.supervisor.currentBrain().then(setCurrent)
    void props.supervisor
      .secrets()
      .get(SECRET_NAMES.anthropicApiKey)
      .then((v) => setClaudeReady(v !== null))
      .catch(() => setClaudeReady(false))
  }, [props.supervisor])

  useInput((input, key) => {
    if (key.escape) {
      props.onExit()
      return
    }
    if (busy) return
    if (key.upArrow || input === 'k') setCursor((c) => Math.max(0, c - 1))
    else if (key.downArrow || input === 'j') setCursor((c) => Math.min(ENTRIES.length - 1, c + 1))
    else if (key.return) void choose(ENTRIES[cursor]!)
  })

  async function choose(entry: CatalogEntry) {
    setBusy(true)
    setMessage(null)
    const result = await props.supervisor.setBrain(entry.id)
    setMessage(result.message)
    if (result.ok) setCurrent(await props.supervisor.currentBrain())
    setBusy(false)
  }

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan"> Pick a brain{hw === null ? '' : ` · ${Math.round(hw.vramMb / 1024)} GB VRAM · ${Math.round(hw.ramMb / 1024)} GB RAM`}</Text>
      </Box>
      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        {ENTRIES.map((entry, i) => {
          const light = hw === null ? null : trafficLight(entry, hw, { comfyResidentMb: 1024 })
          const choice = resolveBrainChoice(entry, { anthropicConfigured: claudeReady })
          const isCurrent = entry.configRef === current
          return (
            <Box key={entry.id}>
              <Box width={2} flexShrink={0}>
                <Text color="cyan">{i === cursor ? '▶' : ' '}</Text>
              </Box>
              <Box width={2} flexShrink={0}>
                <Text color={light === null ? 'gray' : lightColor[light.color]}>●</Text>
              </Box>
              <Box width={44} flexShrink={0}>
                <Text bold={isCurrent} color={choice.ok ? undefined : 'gray'} wrap="truncate">
                  {entry.label}
                  {isCurrent ? ' ‹current›' : ''}
                </Text>
              </Box>
              <Box flexGrow={1}>
                <Text dimColor wrap="truncate-end">
                  [{entry.refusalTier}] {choice.ok ? (light?.reason ?? '') : choice.reason}
                </Text>
              </Box>
            </Box>
          )
        })}
      </Box>
      {message !== null ? <Text color={message.startsWith('brain set') ? 'green' : 'red'} wrap="truncate-end"> {message}</Text> : null}
      <Text dimColor> ↑↓ move · enter select{busy ? ' · applying…' : ''} · esc back · restart gateway after switching</Text>
    </Box>
  )
}
