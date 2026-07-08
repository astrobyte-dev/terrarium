import { Box, Text } from 'ink'
import type { LogEvent } from '@terrarium/core'
import { levelColor, serviceColor } from './colors'

function timeOf(e: LogEvent): string {
  const d = new Date(e.ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function LogPane({ logs, height }: { logs: LogEvent[]; height: number }) {
  const visible = logs.slice(-height)
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1} flexGrow={1}>
      {visible.length === 0 ? (
        <Text dimColor>waiting for log activity…</Text>
      ) : (
        visible.map((e, i) => (
          <Box key={`${e.ts}-${i}`}>
            <Box width={9} flexShrink={0}>
              <Text dimColor>{timeOf(e)}</Text>
            </Box>
            <Box width={10} flexShrink={0}>
              <Text color={serviceColor[e.service]}>{e.service}</Text>
            </Box>
            <Box flexGrow={1} flexShrink={1}>
              <Text color={levelColor[e.level]} wrap="truncate-end">
                {e.line}
              </Text>
            </Box>
          </Box>
        ))
      )}
    </Box>
  )
}
