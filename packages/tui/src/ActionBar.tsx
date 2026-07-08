import { Box, Text } from 'ink'
import type { ExplainedError, ServiceId } from '@terrarium/core'
import type { PendingAction } from './Controls'

const CONFIRM_NOTES: Record<PendingAction['kind'], string> = {
  stop: 'service goes offline until started again',
  restart: 'brief outage while it relaunches',
  migrate: 'disables the OpenClaw scheduled tasks and takes ownership (reversible with g)',
  release: 'stops owned services and hands the stack back to the scheduled tasks',
  quit: 'owned services will be stopped before exit',
}

export function ActionBar(props: {
  busy: string | null
  message: string | null
  problem: ExplainedError | null
  pending: PendingAction | null
  filter: ServiceId | null
}) {
  return (
    <Box flexDirection="column">
      {props.busy !== null ? (
        <Text color="yellow"> ⏳ {props.busy}…</Text>
      ) : props.pending !== null ? (
        <Text color="yellow">
          {' '}
          confirm {props.pending.kind}
          {props.pending.id === undefined ? '' : ` ${props.pending.id}`} — {CONFIRM_NOTES[props.pending.kind]}
          {'  '}
          <Text bold>y</Text>/<Text bold>n</Text>
        </Text>
      ) : props.problem !== null ? (
        <Box flexDirection="column">
          <Text color="red" wrap="truncate-end">
            {' ✗ '}
            {props.problem.summary}
          </Text>
          <Text color="yellow" wrap="truncate-end">
            {'   → '}
            {props.problem.remedy}
            {props.problem.logHint === null ? '' : `  ·  press l for ${props.problem.logHint} log`}
          </Text>
        </Box>
      ) : props.message !== null ? (
        <Text color={props.message.endsWith('✓') ? 'green' : 'red'} wrap="truncate-end">
          {' '}
          {props.message}
        </Text>
      ) : null}
      <Text dimColor>
        {' q quit · c chat · b brains · d doctor · l log · 1-4 select · s/x/r start/stop/restart · m migrate · g release'}
        {props.filter === null ? '' : ` · showing ${props.filter}`}
      </Text>
    </Box>
  )
}
