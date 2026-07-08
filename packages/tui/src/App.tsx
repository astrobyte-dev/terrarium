import { Box, Text, useApp, useStdin, useStdout } from 'ink'
import { useEffect, useState } from 'react'
import type { ExplainedError, LogEvent, ServiceId, ServiceStatus, Supervisor } from '@terrarium/core'
import { explainError } from '@terrarium/core'
import { StatusBoard } from './StatusBoard'
import { LogPane } from './LogPane'
import { ActionBar } from './ActionBar'
import { Controls, type PendingAction } from './Controls'
import { ChatScreen } from './ChatScreen'
import { BrainPicker } from './BrainPicker'
import { DoctorScreen } from './DoctorScreen'

const MAX_LOG_BUFFER = 500

export function App({ supervisor }: { supervisor: Supervisor }) {
  const { exit } = useApp()
  const { stdout } = useStdout()
  const { isRawModeSupported } = useStdin()
  const [statuses, setStatuses] = useState<ServiceStatus[]>([])
  const [logs, setLogs] = useState<LogEvent[]>([])
  const [selected, setSelected] = useState<ServiceId | null>(null)
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [problem, setProblem] = useState<ExplainedError | null>(null)
  const [ownership, setOwnership] = useState<'terrarium' | 'scheduled-tasks' | null>(null)
  const [botLabel, setBotLabel] = useState<string | null>(null)
  const [onboarding, setOnboarding] = useState<{ needed: boolean; reason: string } | null>(null)
  const [screen, setScreen] = useState<'dashboard' | 'chat' | 'brains' | 'doctor'>('dashboard')

  const reloadOwnership = () =>
    void supervisor.ownership().then((l) => setOwnership(l === null ? 'scheduled-tasks' : 'terrarium'))

  useEffect(() => {
    const onStatus = () => setStatuses(supervisor.statuses())
    const onLog = (e: LogEvent) => {
      setLogs((prev) => [...prev, e].slice(-MAX_LOG_BUFFER))
      if (e.service === 'gateway' && /pairing/i.test(e.line)) {
        setMessage('pairing request seen — approve with: openclaw pairing approve telegram <code>')
      }
    }
    void supervisor
      .botIdentity()
      .then((b) => setBotLabel(b === null ? null : `${b.firstName} (@${b.username})`))
    void supervisor.onboarding().then(setOnboarding)
    supervisor.on('status', onStatus)
    supervisor.on('log', onLog)
    supervisor.startMonitoring()
    reloadOwnership()
    const ageTick = setInterval(() => setStatuses(supervisor.statuses()), 5000)
    return () => {
      clearInterval(ageTick)
      supervisor.off('status', onStatus)
      supervisor.off('log', onLog)
      supervisor.stopMonitoring()
    }
  }, [supervisor])

  async function perform(action: PendingAction | { kind: 'start'; id: ServiceId }) {
    const label = 'id' in action && action.id !== undefined ? `${action.kind} ${action.id}` : action.kind
    setBusy(label)
    setMessage(null)
    setProblem(null)
    try {
      if (action.kind === 'start') await supervisor.start(action.id)
      else if (action.kind === 'stop') await supervisor.stop(action.id!)
      else if (action.kind === 'restart') await supervisor.restart(action.id!)
      else if (action.kind === 'migrate') {
        const report = await supervisor.migrate()
        if (report.warnings.length > 0) {
          setMessage(`migrate finished with warnings: ${report.warnings[0]}`)
          setBusy(null)
          reloadOwnership()
          void supervisor.refresh()
          return
        }
      } else if (action.kind === 'release') await supervisor.release()
      else if (action.kind === 'quit') {
        await supervisor.stopAll()
        supervisor.stopMonitoring()
        exit()
        return
      }
      setMessage(`${label} ✓`)
    } catch (err) {
      setProblem(explainError(err))
    }
    setBusy(null)
    reloadOwnership()
    void supervisor.refresh()
  }

  function quit() {
    const ownedRunning = statuses.some((s) => s.process?.ownedByUs === true)
    if (ownedRunning) {
      setPending({ kind: 'quit' })
      return
    }
    supervisor.stopMonitoring()
    exit()
  }

  const rows = stdout?.rows ?? 30
  const logHeight = Math.max(5, rows - 14)
  const shown = selected === null ? logs : logs.filter((e) => e.service === selected)

  if (screen === 'chat') {
    return <ChatScreen botLabel={botLabel} onExit={() => setScreen('dashboard')} />
  }
  if (screen === 'brains') {
    return <BrainPicker supervisor={supervisor} onExit={() => setScreen('dashboard')} />
  }
  if (screen === 'doctor') {
    return <DoctorScreen supervisor={supervisor} onExit={() => setScreen('dashboard')} />
  }

  return (
    <Box flexDirection="column">
      {isRawModeSupported ? (
        <Controls
          pending={pending}
          busy={busy !== null}
          selected={selected}
          onSelect={setSelected}
          onStart={(id) => void perform({ kind: 'start', id })}
          onRequest={setPending}
          onConfirm={() => {
            const action = pending
            setPending(null)
            if (action !== null) void perform(action)
          }}
          onCancel={() => setPending(null)}
          onQuit={quit}
          onChat={() => setScreen('chat')}
          onBrains={() => setScreen('brains')}
          onDoctor={() => setScreen('doctor')}
          onHint={setMessage}
          onShowLog={() => {
            if (problem?.logHint != null) setSelected(problem.logHint)
          }}
        />
      ) : null}
      {onboarding?.needed === true ? (
        <Box borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow">
            First-run setup needed ({onboarding.reason}) — run <Text bold>npm run setup</Text> to install, then{' '}
            <Text bold>npm run capture-secrets</Text>.
          </Text>
        </Box>
      ) : null}
      <StatusBoard statuses={statuses} selected={selected} ownership={ownership} botLabel={botLabel} />
      <LogPane logs={shown} height={logHeight} />
      <ActionBar busy={busy} message={message} problem={problem} pending={pending} filter={selected} />
    </Box>
  )
}
