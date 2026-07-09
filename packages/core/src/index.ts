export * from './types'
export type { DirEntry, SpawnHandle, SpawnSpec, SystemPort } from './system/system-port'
export { createWindowsSystem } from './system/windows'
export { createSupervisor, type Supervisor } from './supervisor/create'
export type { Monitor, MonitorEvents } from './supervisor/monitor'
export type { OwnedState } from './supervisor/owned'
export type { OwnedView, StartAllReport } from './supervisor/lifecycle'
export type { MigrationReport, OwnershipLedger } from './supervisor/migration'
export { computeHealth, type HealthSignals, type HealthVerdict } from './health/ladder'
export type { ServiceDefinition, EnvReader, SecretReader } from './services/definitions'
export { createDpapiSecretStore, SECRET_NAMES, type SecretStore } from './secrets/store'
export { applyConfig, type ApplyResult } from './config/apply'
export { buildOpenclawConfig, type SecretsMode, type TemplateSecrets } from './config/template'
export { getBotIdentity, type BotIdentity } from './telegram/identity'
export { componentInstallers } from './install/registry'
export {
  runInstallSequence,
  summarizeInstallPlan,
  type InstallPlanSummary,
  type StepPlan,
  type StepResult,
  type StepStatus,
  type RunOptions,
} from './install/orchestrator'
export {
  needsOnboarding,
  onboardingReason,
  gatherOnboardingFacts,
  type OnboardingFacts,
} from './install/first-run'
export { listLocalModels, pullModel, type LocalModel } from './install/models'
export { OPENCLAW_PIN, createOpenclawInstaller } from './install/openclaw'
export type { ComponentId, ComponentInstaller, ComponentPlan, InstallOutcome, InstallProgress } from './install/types'
export { downloadFile, type DownloadProgress, type DownloadResult } from './install/download'
export { COMFYUI_VERSION, MANAGED_COMFY_PORT, createComfyuiInstaller, managedComfySpawn } from './install/comfyui'
export { MODEL_ASSETS, installModel, type ModelAsset, type InstallModelResult } from './install/comfy-models'
export { CUSTOM_NODES, installBundledNode, installGitNode, type CustomNode, type NodeInstallResult } from './install/comfy-nodes'
export { planModelAssembly, executeCopy, type AssemblyAction, type AssemblyDirs } from './install/comfy-assemble'
export { buildTxt2ImgWorkflow, type Txt2ImgOptions, type ComfyWorkflow } from './render/workflow'
export { buildFaceWorkflow, buildUpscaleWorkflow, PHOTOREAL_CHECKPOINT, ANIME_CHECKPOINTS, type FaceWorkflowOptions } from './render/face-workflow'
export { renderImage, uploadImage, type RenderResult, type RenderedImage, type UploadResult } from './render/client'
export { MODEL_CATALOG, type CatalogEntry, type BrainProvider } from './catalog/models'
export { trafficLight, type Hardware, type Light, type TrafficOptions } from './catalog/traffic'
export { resolveBrainChoice, resolveFallbacks, type BrainChoice } from './catalog/brain'
export { readBrainSelection, writeBrainSelection, type StoredBrain } from './catalog/brain-store'
export { validateBotSpec, type BotSpec } from './bots/spec'
export { buildDraftPrompt, parseDraft, draftPersona, type DraftSeed, type DraftMode, type DraftedPersona } from './bots/draft'
export { createOllamaChat, DEFAULT_DRAFT_MODEL, type OllamaChatOptions } from './bots/ollama-chat'
export { renderCompactCard, renderFullCard } from './bots/render'
export { AGENTS_LIMIT, SAFETY_MARGIN, planInsert, insertCompactCard, type InsertPlan } from './bots/agents-file'
export { parseRoster, removeCard, type RosterCard } from './bots/roster'
export { createBot, type CreateBotResult } from './bots/workspace'
export { createChatClient, MAIN_SESSION_KEY, type ChatClient, type ChatMessage, type ChatClientOptions } from './chat/client'
export { loadDeviceIdentity, type DeviceIdentity } from './gateway/identity'
export { TerrariumError, type ErrorCode, type ExplainedError } from './errors/terrarium-error'
export { explainError } from './errors/explain'
export { buildDoctorReport, gatherDoctorFacts, repairConfig, type DoctorCheck, type DoctorReport, type CheckStatus } from './supervisor/doctor'
