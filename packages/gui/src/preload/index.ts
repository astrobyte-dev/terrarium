import { contextBridge, ipcRenderer } from 'electron'
import type {
  ActionRequest,
  ActionResult,
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
  GalleryEntry,
  DoctorReportView,
  DoctorRepairResult,
  DraftFieldKey,
  DraftFieldResult,
  DraftResult,
  DraftSeedInput,
  LogLine,
  MetaView,
  PortraitGenInput,
  PortraitGenResult,
  PortraitSaveResult,
  RosterView,
  ServiceView,
} from '../shared/contract'

// A subscribe helper that returns its own unsubscribe.
function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: unknown, payload: T) => cb(payload)
  ipcRenderer.on(channel, handler as never)
  return () => ipcRenderer.off(channel, handler as never)
}

// The ONLY bridge between renderer and Node. The renderer never touches
// child_process / DPAPI / the core directly — everything crosses here.
const api = {
  platform: process.platform,
  minimize: () => ipcRenderer.send('window:minimize'),
  hideToTray: () => ipcRenderer.send('window:hide'),
  quit: () => ipcRenderer.send('app:quit'),
  core: {
    getState: (): Promise<CoreState> => ipcRenderer.invoke('core:getState'),
    action: (req: ActionRequest): Promise<ActionResult> => ipcRenderer.invoke('core:action', req),
    onServices: (cb: (s: ServiceView[]) => void) => on<ServiceView[]>('core:services', cb),
    onMeta: (cb: (m: MetaView) => void) => on<MetaView>('core:meta', cb),
    onLog: (cb: (l: LogLine) => void) => on<LogLine>('core:log', cb),
  },
  chat: {
    connect: (): Promise<ChatConnectResult> => ipcRenderer.invoke('chat:connect'),
    send: (text: string): Promise<{ ok: boolean; message?: string }> => ipcRenderer.invoke('chat:send', text),
    onMessage: (cb: (m: ChatMsg) => void) => on<ChatMsg>('chat:message', cb),
    onStatus: (cb: (s: ChatStatus) => void) => on<ChatStatus>('chat:status', cb),
  },
  inbox: {
    // Recent pics (persisted) to replay into a freshly-connected chat, merged by ts.
    recent: (): Promise<ChatMsg[]> => ipcRenderer.invoke('inbox:recent'),
  },
  gallery: {
    list: (): Promise<GalleryEntry[]> => ipcRenderer.invoke('gallery:list'),
  },
  brains: {
    list: (): Promise<BrainsList> => ipcRenderer.invoke('brains:list'),
    probe: (): Promise<BrainLiveness> => ipcRenderer.invoke('brains:probe'),
    set: (ref: string): Promise<{ ok: boolean; message: string }> => ipcRenderer.invoke('brains:set', ref),
  },
  bots: {
    preview: (spec: BotSpecInput): Promise<BotPreview> => ipcRenderer.invoke('bots:preview', spec),
    create: (spec: BotSpecInput): Promise<BotCreateResult> => ipcRenderer.invoke('bots:create', spec),
    draft: (seed: DraftSeedInput): Promise<DraftResult> => ipcRenderer.invoke('bots:draft', seed),
    draftField: (seed: DraftSeedInput, field: DraftFieldKey): Promise<DraftFieldResult> =>
      ipcRenderer.invoke('bots:draftField', seed, field),
  },
  doctor: {
    report: (): Promise<DoctorReportView> => ipcRenderer.invoke('doctor:report'),
    repair: (): Promise<DoctorRepairResult> => ipcRenderer.invoke('doctor:repair'),
  },
  characters: {
    list: (): Promise<RosterView> => ipcRenderer.invoke('characters:list'),
    remove: (heading: string): Promise<CharRemoveResult> => ipcRenderer.invoke('characters:remove', heading),
    get: (slug: string): Promise<CharGetResult> => ipcRenderer.invoke('characters:get', slug),
    update: (spec: BotSpecInput, originalSlug: string, originalHeading: string): Promise<CharUpdateResult> =>
      ipcRenderer.invoke('characters:update', spec, originalSlug, originalHeading),
  },
  portraits: {
    generate: (input: PortraitGenInput): Promise<PortraitGenResult> => ipcRenderer.invoke('portraits:generate', input),
    saveRef: (slug: string, url: string): Promise<PortraitSaveResult> => ipcRenderer.invoke('portraits:saveRef', slug, url),
  },
}

contextBridge.exposeInMainWorld('terrarium', api)

export type TerrariumApi = typeof api
