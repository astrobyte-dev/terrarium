import { describe, expect, it } from 'vitest'
import { explainError } from './explain'
import { TerrariumError } from './terrarium-error'

describe('explainError', () => {
  it('passes a TerrariumError through unchanged', () => {
    const err = new TerrariumError('not-installed', 'ComfyUI is not installed', 'Run the installer.', {
      logHint: 'comfyui',
    })
    const e = explainError(err)
    expect(e.code).toBe('not-installed')
    expect(e.summary).toBe('ComfyUI is not installed')
    expect(e.remedy).toBe('Run the installer.')
    expect(e.logHint).toBe('comfyui')
  })

  it('recognises a stray-process refusal and points at migrate + the service log', () => {
    const e = explainError(new Error('gateway: stray process running (pid 1234) — migrate to take ownership, or stop it first'))
    expect(e.code).toBe('stray-process')
    expect(e.remedy).toMatch(/migrate/i)
    expect(e.logHint).toBe('gateway')
    expect(e.detail).toContain('pid 1234')
  })

  it('recognises a missing secret', () => {
    const e = explainError(new Error('secret "telegram-bot-token" missing from the store — run secret capture first'))
    expect(e.code).toBe('secret-missing')
    expect(e.remedy).toMatch(/capture/i)
    expect(e.logHint).toBeNull()
  })

  it('recognises a not-ready timeout and keeps the service log hint', () => {
    const e = explainError(new Error('comfyui: not ready after 60000 ms'))
    expect(e.code).toBe('not-ready')
    expect(e.logHint).toBe('comfyui')
    expect(e.remedy).toMatch(/log|restart/i)
  })

  it('recognises a crash during startup', () => {
    const e = explainError(new Error('picDaemon: exited during startup'))
    expect(e.code).toBe('crashed-on-start')
    expect(e.logHint).toBe('picDaemon')
  })

  it('recognises nothing-to-spawn as not-installed', () => {
    const e = explainError(new Error('comfyui: nothing to spawn (not installed?)'))
    expect(e.code).toBe('not-installed')
    expect(e.logHint).toBe('comfyui')
  })

  it('recognises release-before-migrate', () => {
    const e = explainError(new Error('not migrated — nothing to release'))
    expect(e.code).toBe('not-migrated')
  })

  it('recognises a missing anthropic key', () => {
    const e = explainError(new Error('anthropic enabled but no anthropic-api-key in the store — capture it first'))
    expect(e.code).toBe('anthropic-missing')
    expect(e.remedy).toMatch(/set-anthropic-key/)
  })

  it('recognises an unpaired gateway identity', () => {
    const e = explainError(new Error('no paired gateway identity found — is OpenClaw set up on this machine?'))
    expect(e.code).toBe('no-paired-identity')
  })

  it('falls back to unexpected, preserving the raw message as detail', () => {
    const e = explainError(new Error('ECONNRESET socket hang up'))
    expect(e.code).toBe('unexpected')
    expect(e.detail).toBe('ECONNRESET socket hang up')
    expect(e.summary).toMatch(/something went wrong/i)
  })

  it('handles a non-Error thrown value', () => {
    const e = explainError('boom')
    expect(e.code).toBe('unexpected')
    expect(e.detail).toBe('boom')
  })
})
