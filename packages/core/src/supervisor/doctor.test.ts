import { describe, expect, it } from 'vitest'
import { buildDoctorReport, type DoctorFacts } from './doctor'

const GOOD: DoctorFacts = {
  configExists: true,
  configDiffs: [],
  missingSecrets: [],
  owned: true,
  taskStates: [{ name: 'OpenClaw Gateway', state: 'Disabled' }],
  brainPrimary: 'arliai/Mistral-Medium-3.5-128B',
}

const check = (facts: Partial<DoctorFacts>, id: string) =>
  buildDoctorReport({ ...GOOD, ...facts }).checks.find((c) => c.id === id)!

describe('buildDoctorReport', () => {
  it('reports healthy when everything matches the known-good state', () => {
    const report = buildDoctorReport(GOOD)
    expect(report.healthy).toBe(true)
    expect(report.checks.every((c) => c.status === 'ok')).toBe(true)
  })

  it('fails and offers a regenerate fix when the config is missing', () => {
    const c = check({ configExists: false }, 'config')
    expect(c.status).toBe('fail')
    expect(c.fix).toBe('regenerate-config')
    expect(buildDoctorReport({ ...GOOD, configExists: false }).healthy).toBe(false)
  })

  it('warns and offers a regenerate fix when the config has drifted', () => {
    const c = check({ configDiffs: ['channels.telegram.botToken', 'agents.defaults.model.primary'] }, 'config')
    expect(c.status).toBe('warn')
    expect(c.fix).toBe('regenerate-config')
    expect(c.detail).toMatch(/2/)
  })

  it('fails when a required secret is missing', () => {
    const c = check({ missingSecrets: ['telegram-bot-token'] }, 'secrets')
    expect(c.status).toBe('fail')
    expect(c.detail).toMatch(/telegram-bot-token/)
    expect(c.fix).toBeNull()
  })

  it('warns when Terrarium owns the stack but a scheduled task is still enabled', () => {
    const c = check({ owned: true, taskStates: [{ name: 'OpenClaw Gateway', state: 'Ready' }] }, 'ownership')
    expect(c.status).toBe('warn')
    expect(c.detail).toMatch(/fight|enabled/i)
  })

  it('warns when released but the scheduled tasks are left disabled', () => {
    const c = check({ owned: false, taskStates: [{ name: 'OpenClaw Gateway', state: 'Disabled' }] }, 'ownership')
    expect(c.status).toBe('warn')
    expect(c.detail).toMatch(/on its own|autostart|won't start/i)
  })

  it('is ok when released and the scheduled tasks are enabled', () => {
    const c = check({ owned: false, taskStates: [{ name: 'OpenClaw Gateway', state: 'Ready' }] }, 'ownership')
    expect(c.status).toBe('ok')
  })

  it('always reports the active brain for visibility', () => {
    const c = check({}, 'brain')
    expect(c.status).toBe('ok')
    expect(c.detail).toContain('arliai/Mistral-Medium-3.5-128B')
  })
})
