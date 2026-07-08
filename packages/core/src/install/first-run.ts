import type { SystemPort } from '../system/system-port'
import type { SecretStore } from '../secrets/store'
import { SECRET_NAMES } from '../secrets/store'
import type { ComponentId, ComponentInstaller } from './types'

export interface OnboardingFacts {
  /** Components whose plan reports nothing installed. */
  missingComponents: ComponentId[]
  /** All credentials the stack cannot run without are stored. */
  requiredSecretsPresent: boolean
}

const REQUIRED_SECRETS = [
  SECRET_NAMES.telegramBotToken,
  SECRET_NAMES.arliaiApiKey,
  SECRET_NAMES.ollamaApiKey,
  SECRET_NAMES.gatewayAuthToken,
]

/** A blank slate needs the wizard; a set-up machine goes straight to the dashboard. Pure. */
export function needsOnboarding(facts: OnboardingFacts): boolean {
  return facts.missingComponents.length > 0 || !facts.requiredSecretsPresent
}

/** One human line explaining the decision. Pure. */
export function onboardingReason(facts: OnboardingFacts): string {
  const parts: string[] = []
  if (facts.missingComponents.length > 0) parts.push(`not installed: ${facts.missingComponents.join(', ')}`)
  if (!facts.requiredSecretsPresent) parts.push('required credentials not captured')
  return parts.length === 0 ? 'the stack is set up and ready' : parts.join('; ')
}

/** Gather the onboarding decision inputs from the live machine. */
export async function gatherOnboardingFacts(
  installers: ComponentInstaller[],
  store: SecretStore,
): Promise<OnboardingFacts> {
  const missingComponents: ComponentId[] = []
  for (const installer of installers) {
    const plan = await installer.plan()
    if (plan.installed === null) missingComponents.push(installer.id)
  }
  let requiredSecretsPresent = true
  for (const name of REQUIRED_SECRETS) if ((await store.get(name)) === null) requiredSecretsPresent = false
  return { missingComponents, requiredSecretsPresent }
}
