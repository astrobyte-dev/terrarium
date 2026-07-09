/// <reference types="vite/client" />
import type {
  ActionRequest,
  ActionResult,
  BotCreateResult,
  BotPreview,
  BotSpecInput,
  BrainLiveness,
  BrainsList,
  CharRemoveResult,
  ChatConnectResult,
  ChatMsg,
  ChatStatus,
  CoreState,
  DoctorReportView,
  DoctorRepairResult,
  DraftFieldKey,
  DraftFieldResult,
  DraftResult,
  DraftSeedInput,
  LogLine,
  MetaView,
  RosterView,
  ServiceView,
} from '../../shared/contract'

declare global {
  interface Window {
    terrarium: {
      platform: string
      minimize: () => void
      hideToTray: () => void
      quit: () => void
      core: {
        getState: () => Promise<CoreState>
        action: (req: ActionRequest) => Promise<ActionResult>
        onServices: (cb: (s: ServiceView[]) => void) => () => void
        onMeta: (cb: (m: MetaView) => void) => () => void
        onLog: (cb: (l: LogLine) => void) => () => void
      }
      chat: {
        connect: () => Promise<ChatConnectResult>
        send: (text: string) => Promise<{ ok: boolean; message?: string }>
        onMessage: (cb: (m: ChatMsg) => void) => () => void
        onStatus: (cb: (s: ChatStatus) => void) => () => void
      }
      inbox: {
        recent: () => Promise<ChatMsg[]>
      }
      brains: {
        list: () => Promise<BrainsList>
        probe: () => Promise<BrainLiveness>
        set: (ref: string) => Promise<{ ok: boolean; message: string }>
      }
      bots: {
        preview: (spec: BotSpecInput) => Promise<BotPreview>
        create: (spec: BotSpecInput) => Promise<BotCreateResult>
        draft: (seed: DraftSeedInput) => Promise<DraftResult>
        draftField: (seed: DraftSeedInput, field: DraftFieldKey) => Promise<DraftFieldResult>
      }
      doctor: {
        report: () => Promise<DoctorReportView>
        repair: () => Promise<DoctorRepairResult>
      }
      characters: {
        list: () => Promise<RosterView>
        remove: (heading: string) => Promise<CharRemoveResult>
      }
    }
  }
}

export {}
