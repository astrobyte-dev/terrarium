import { describe, expect, it } from 'vitest'
import { parseScheduledTasksJson } from './autostart'

describe('parseScheduledTasksJson', () => {
  it('parses task arrays and maps state numbers to names', () => {
    const json = JSON.stringify([
      { TaskName: 'OpenClaw Gateway', State: 4 },
      { TaskName: 'OpenClaw Service Watchdog', State: 3 },
      { TaskName: 'OpenClaw Pic Daemon', State: 1 },
    ])
    expect(parseScheduledTasksJson(json)).toEqual([
      { kind: 'scheduled-task', name: 'OpenClaw Gateway', state: 'Running' },
      { kind: 'scheduled-task', name: 'OpenClaw Service Watchdog', state: 'Ready' },
      { kind: 'scheduled-task', name: 'OpenClaw Pic Daemon', state: 'Disabled' },
    ])
  })

  it('wraps the single-object form and tolerates empty output', () => {
    expect(parseScheduledTasksJson('{"TaskName":"OpenClaw Gateway","State":4}')).toHaveLength(1)
    expect(parseScheduledTasksJson('')).toEqual([])
  })
})
