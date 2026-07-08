import { useInput } from 'ink'
import type { ServiceId } from '@terrarium/core'
import { SERVICE_IDS } from '@terrarium/core'

export interface PendingAction {
  kind: 'stop' | 'restart' | 'migrate' | 'release' | 'quit'
  id?: ServiceId
}

export function Controls(props: {
  pending: PendingAction | null
  busy: boolean
  selected: ServiceId | null
  onSelect: (id: ServiceId | null) => void
  onStart: (id: ServiceId) => void
  onRequest: (action: PendingAction) => void
  onConfirm: () => void
  onCancel: () => void
  onQuit: () => void
  onChat: () => void
  onBrains: () => void
  onDoctor: () => void
  onHint: (message: string) => void
  onShowLog: () => void
}) {
  useInput((input, key) => {
    if (props.pending !== null) {
      if (input === 'y') props.onConfirm()
      else if (input === 'n' || key.escape) props.onCancel()
      return
    }
    if (input === 'q') {
      props.onQuit()
      return
    }
    if (input === 'c') {
      props.onChat()
      return
    }
    if (input === 'b') {
      props.onBrains()
      return
    }
    if (input === 'l') {
      props.onShowLog()
      return
    }
    if (input === 'd') {
      props.onDoctor()
      return
    }
    if (props.busy) return

    if (input === 'a' || input === '0') {
      props.onSelect(null)
      return
    }
    const index = Number(input)
    if (index >= 1 && index <= SERVICE_IDS.length) {
      props.onSelect(SERVICE_IDS[index - 1]!)
      return
    }

    const needsSelection = () => {
      if (props.selected === null) {
        props.onHint('select a service first (1-4)')
        return true
      }
      return false
    }
    if (input === 's') {
      if (!needsSelection()) props.onStart(props.selected!)
    } else if (input === 'x') {
      if (!needsSelection()) props.onRequest({ kind: 'stop', id: props.selected! })
    } else if (input === 'r') {
      if (!needsSelection()) props.onRequest({ kind: 'restart', id: props.selected! })
    } else if (input === 'm') {
      props.onRequest({ kind: 'migrate' })
    } else if (input === 'g') {
      props.onRequest({ kind: 'release' })
    }
  })
  return null
}
