import type { MetaView, ServiceView, LogLine } from './types'

// Pre-connect placeholder shown for the split-second before the live core
// answers. Neutral/empty so nothing stale is ever mistaken for real state.
export const INITIAL_META: MetaView = {
  bot: null,
  owner: 'tasks',
  brain: '—',
  gpu: null,
}

export const INITIAL_SERVICES: ServiceView[] = []

export const INITIAL_LOGS: LogLine[] = []
