import { useCallback, useState } from 'react'
import { useTheme } from './theme/useTheme'
import { useLiveDashboard } from './hooks/useLiveDashboard'
import { useChat, useUnread } from './hooks/useChat'
import { TitleBar } from './components/TitleBar'
import { NavRail, type SectionId } from './components/NavRail'
import { Dashboard } from './components/Dashboard'
import { ChatScreen } from './components/ChatScreen'
import { BrainsScreen } from './components/BrainsScreen'
import { BotBuilderScreen } from './components/BotBuilderScreen'
import { CharactersScreen } from './components/CharactersScreen'
import { DoctorScreen } from './components/DoctorScreen'
import { Placeholder } from './components/Placeholder'
import { Toast, type ToastMsg } from './components/Toast'
import type { ActionRequest } from './data/types'

export function App() {
  const { theme, change } = useTheme()
  const { meta, services, logs, connected, doAction } = useLiveDashboard()
  const chat = useChat()
  const [section, setSection] = useState<SectionId>('dashboard')
  const unread = useUnread(chat.messages, section === 'chat')
  const [toast, setToast] = useState<ToastMsg | null>(null)
  const [editTarget, setEditTarget] = useState<{ slug: string; heading: string } | null>(null)
  const [editNonce, setEditNonce] = useState(0)

  const goEditCharacter = useCallback((slug: string, heading: string) => {
    setEditTarget({ slug, heading })
    setEditNonce((n) => n + 1)
    setSection('bots')
  }, [])

  const onAction = useCallback(
    async (req: ActionRequest) => {
      const res = await doAction(req)
      if (res.message !== 'Cancelled') setToast(res)
      return res
    },
    [doAction],
  )

  return (
    <div className="app">
      <TitleBar theme={theme} onTheme={change} />
      <div className="body">
        <NavRail active={section} onSelect={setSection} owner={meta.owner} onAction={onAction} unread={unread} />
        <main className="main">
          {section === 'dashboard' ? (
            <Dashboard meta={meta} services={services} logs={logs} connected={connected} onAction={onAction} />
          ) : section === 'chat' ? (
            <ChatScreen
              botName={meta.bot?.name ?? 'Ella'}
              messages={chat.messages}
              status={chat.status}
              connected={chat.connected}
              send={chat.send}
            />
          ) : section === 'brains' ? (
            <BrainsScreen />
          ) : section === 'bots' ? (
            <BotBuilderScreen editTarget={editTarget} editNonce={editNonce} />
          ) : section === 'characters' ? (
            <CharactersScreen onEdit={goEditCharacter} />
          ) : section === 'doctor' ? (
            <DoctorScreen />
          ) : (
            <Placeholder section={section} />
          )}
        </main>
      </div>
      <Toast toast={toast} onDone={() => setToast(null)} />
    </div>
  )
}
