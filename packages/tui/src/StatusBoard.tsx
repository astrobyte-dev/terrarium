import { Box, Text } from 'ink'
import type { ServiceId, ServiceStatus } from '@terrarium/core'
import { healthColor, serviceColor } from './colors'

function Row({ status, selected }: { status: ServiceStatus; selected: boolean }) {
  const version = status.install?.version == null ? '' : ` v${status.install.version}`
  const pid = status.process === null ? '' : ` · pid ${status.process.pid}`
  const owned = status.process?.ownedByUs === true
  return (
    <Box>
      <Box width={2} flexShrink={0}>
        <Text color="cyan">{selected ? '▶' : ' '}</Text>
      </Box>
      <Box width={15} flexShrink={0}>
        <Text color={healthColor[status.health]} wrap="truncate">
          ● {status.health}
        </Text>
      </Box>
      <Box width={18} flexShrink={0}>
        <Text bold color={serviceColor[status.id]} wrap="truncate">
          {status.name}
        </Text>
      </Box>
      <Box width={8} flexShrink={0}>
        <Text dimColor>{owned ? 'owned' : 'adopted'}</Text>
      </Box>
      <Box flexGrow={1} flexShrink={1}>
        <Text dimColor wrap="truncate-end">
          {status.detail}
          {version}
          {pid}
        </Text>
      </Box>
    </Box>
  )
}

export function StatusBoard(props: {
  statuses: ServiceStatus[]
  selected: ServiceId | null
  ownership: 'terrarium' | 'scheduled-tasks' | null
  botLabel: string | null
}) {
  const badge =
    props.ownership === 'terrarium'
      ? ' · ownership: Terrarium'
      : props.ownership === 'scheduled-tasks'
        ? ' · ownership: scheduled tasks'
        : ''
  const bot = props.botLabel === null ? '' : ` · bot: ${props.botLabel}`
  return (
    <Box flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
      <Text bold> Terrarium{badge}{bot}</Text>
      {props.statuses.length === 0 ? (
        <Text dimColor>detecting…</Text>
      ) : (
        props.statuses.map((s) => <Row key={s.id} status={s} selected={props.selected === s.id} />)
      )}
    </Box>
  )
}
