/// <reference types="vite/client" />
import type {
  ActionRequest,
  ActionResult,
  ArchetypeRegenResult,
  BotCreateResult,
  BotPreview,
  BotSpecInput,
  BrainLiveness,
  BrainsList,
  CharGetResult,
  CharRemoveResult,
  CharUpdateResult,
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
  GalleryEntry,
  GenSettings,
  LogLine,
  MemoryView,
  VoiceCatalogView,
  VoiceSay,
  MetaView,
  PortraitGenInput,
  PortraitGenResult,
  PortraitSaveResult,
  ProactiveSettings,
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
      proactive: {
        get: () => Promise<ProactiveSettings>
        set: (patch: Partial<ProactiveSettings>) => Promise<ProactiveSettings>
      }
      gen: {
        get: () => Promise<GenSettings>
        set: (patch: Partial<GenSettings>) => Promise<GenSettings>
      }
      memory: {
        list: () => Promise<MemoryView>
        save: (memories: string[]) => Promise<{ ok: boolean; message?: string }>
      }
      voice: {
        catalog: () => Promise<VoiceCatalogView>
        setVoice: (slug: string, voiceId: string) => Promise<{ ok: boolean }>
        say: (text: string, slug?: string) => Promise<VoiceSay>
        preview: (voiceId: string) => Promise<VoiceSay>
      }
      inbox: {
        recent: () => Promise<ChatMsg[]>
      }
      gallery: {
        list: () => Promise<GalleryEntry[]>
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
        get: (slug: string) => Promise<CharGetResult>
        update: (spec: BotSpecInput, originalSlug: string, originalHeading: string) => Promise<CharUpdateResult>
      }
      portraits: {
        generate: (input: PortraitGenInput) => Promise<PortraitGenResult>
        saveRef: (slug: string, url: string) => Promise<PortraitSaveResult>
        regenerateArchetype: (id: string, look: string, outfit: string) => Promise<ArchetypeRegenResult>
      }
    }
  }
}

export {}
