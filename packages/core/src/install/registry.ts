import type { SystemPort } from '../system/system-port'
import type { ComponentInstaller } from './types'
import { createOllamaInstaller } from './ollama'
import { createOpenclawInstaller } from './openclaw'
import { createComfyuiInstaller } from './comfyui'

export function componentInstallers(system: SystemPort): ComponentInstaller[] {
  return [createOllamaInstaller(system), createOpenclawInstaller(system), createComfyuiInstaller({ system })]
}
