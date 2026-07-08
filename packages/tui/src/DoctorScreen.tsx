import { Box, Text, useInput } from 'ink'
import { useEffect, useState } from 'react'
import type { CheckStatus, DoctorReport, Supervisor } from '@terrarium/core'

const ICON: Record<CheckStatus, string> = { ok: '✓', warn: '!', fail: '✗' }
const COLOR: Record<CheckStatus, string> = { ok: 'green', warn: 'yellow', fail: 'red' }

export function DoctorScreen(props: { supervisor: Supervisor; onExit: () => void }) {
  const [report, setReport] = useState<DoctorReport | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = () => {
    setBusy(true)
    void props.supervisor
      .doctor()
      .then((r) => setReport(r))
      .catch((e) => setMessage(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false))
  }

  useEffect(run, [props.supervisor])

  useInput((input, key) => {
    if (key.escape) {
      props.onExit()
      return
    }
    if (busy) return
    if (input === 'r') void repair()
  })

  async function repair() {
    setBusy(true)
    setMessage(null)
    try {
      const result = await props.supervisor.repair()
      setMessage(result.message)
      setReport(await props.supervisor.doctor())
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    }
    setBusy(false)
  }

  const canRepair = report?.checks.some((c) => c.fix !== null) ?? false

  return (
    <Box flexDirection="column">
      <Box borderStyle="round" borderColor="cyan" paddingX={1}>
        <Text bold color="cyan"> Doctor — reset to working state</Text>
      </Box>
      <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        {report === null ? (
          <Text dimColor>checking…</Text>
        ) : (
          report.checks.map((c) => (
            <Box key={c.id}>
              <Box width={2} flexShrink={0}>
                <Text color={COLOR[c.status]}>{ICON[c.status]}</Text>
              </Box>
              <Box width={14} flexShrink={0}>
                <Text bold>{c.title}</Text>
              </Box>
              <Box flexGrow={1}>
                <Text dimColor wrap="truncate-end">{c.detail}</Text>
              </Box>
            </Box>
          ))
        )}
      </Box>
      {message !== null ? <Text color="green" wrap="truncate-end"> {message}</Text> : null}
      <Text dimColor>
        {canRepair ? ' r regenerate config (backs up first) · ' : ' '}
        {busy ? 'working… · ' : ''}esc back
      </Text>
    </Box>
  )
}
