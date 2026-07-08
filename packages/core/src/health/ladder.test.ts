import { describe, expect, it } from 'vitest'
import { computeHealth, type HealthSignals } from './ladder'

const MIN = 60_000
const HOUR = 60 * MIN

function gatewayLike(overrides: Partial<HealthSignals> = {}): HealthSignals {
  return {
    installed: true,
    processRunning: true,
    port: 18789,
    portOpen: true,
    lastLogAgeMs: 30_000,
    quietAfterMs: 15 * MIN,
    wedgedAfterMs: 60 * MIN,
    ...overrides,
  }
}

describe('computeHealth', () => {
  it('reports not-installed before anything else', () => {
    const v = computeHealth(gatewayLike({ installed: false }))
    expect(v.health).toBe('not-installed')
  })

  it('reports stopped when nothing is running', () => {
    const v = computeHealth(gatewayLike({ processRunning: false, portOpen: false }))
    expect(v.health).toBe('stopped')
  })

  it('reports starting when the process is up but the port is not answering', () => {
    const v = computeHealth(gatewayLike({ portOpen: false }))
    expect(v.health).toBe('starting')
    expect(v.detail).toContain('18789')
  })

  it('reports live when responding with fresh logs', () => {
    expect(computeHealth(gatewayLike()).health).toBe('live')
  })

  it('reports quiet when logs pass the quiet threshold', () => {
    const v = computeHealth(gatewayLike({ lastLogAgeMs: 20 * MIN }))
    expect(v.health).toBe('quiet')
    expect(v.detail).toContain('20 min')
  })

  it('flags the silent-hang signature: port 200 but logs dead for hours', () => {
    // Regression: gateway once served HTTP 200 for 16 h while wedged on a
    // stalled provider stream. Port checks alone must never report live.
    const v = computeHealth(gatewayLike({ lastLogAgeMs: 16 * HOUR }))
    expect(v.health).toBe('wedged')
    expect(v.detail).toMatch(/silent/i)
  })

  it('reports port-open when responding but no log has been observed', () => {
    const v = computeHealth(gatewayLike({ lastLogAgeMs: null }))
    expect(v.health).toBe('port-open')
  })

  it('treats log silence as normal when no quiet threshold is set (ollama)', () => {
    const v = computeHealth(
      gatewayLike({ port: 11434, lastLogAgeMs: 72 * HOUR, quietAfterMs: null, wedgedAfterMs: null }),
    )
    expect(v.health).toBe('live')
  })

  it('treats an open port as responding even when the process was not identified', () => {
    const v = computeHealth(gatewayLike({ processRunning: false }))
    expect(v.health).toBe('live')
  })

  it('rates portless services (pic daemon) by process presence', () => {
    const running = computeHealth(
      gatewayLike({ port: null, portOpen: false, quietAfterMs: null, wedgedAfterMs: null }),
    )
    expect(running.health).toBe('live')
    const gone = computeHealth(
      gatewayLike({ port: null, portOpen: false, processRunning: false }),
    )
    expect(gone.health).toBe('stopped')
  })
})
