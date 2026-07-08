import { describe, expect, it } from 'vitest'
import { needsOnboarding, onboardingReason } from './first-run'

describe('needsOnboarding', () => {
  it('is false when everything is installed and secrets are present', () => {
    expect(needsOnboarding({ missingComponents: [], requiredSecretsPresent: true })).toBe(false)
  })

  it('is true when a component is missing', () => {
    expect(needsOnboarding({ missingComponents: ['comfyui'], requiredSecretsPresent: true })).toBe(true)
  })

  it('is true when required secrets are absent even if everything is installed', () => {
    expect(needsOnboarding({ missingComponents: [], requiredSecretsPresent: false })).toBe(true)
  })
})

describe('onboardingReason', () => {
  it('names the missing components', () => {
    expect(onboardingReason({ missingComponents: ['ollama', 'comfyui'], requiredSecretsPresent: true })).toMatch(/ollama.*comfyui|comfyui.*ollama/)
  })

  it('calls out missing credentials', () => {
    expect(onboardingReason({ missingComponents: [], requiredSecretsPresent: false })).toMatch(/credential/i)
  })

  it('says ready when nothing is needed', () => {
    expect(onboardingReason({ missingComponents: [], requiredSecretsPresent: true })).toMatch(/ready|set up/i)
  })
})
