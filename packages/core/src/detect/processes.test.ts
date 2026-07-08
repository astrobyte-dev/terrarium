import { describe, expect, it } from 'vitest'
import { parseCimProcesses } from './processes'

describe('parseCimProcesses', () => {
  it('parses an array of processes', () => {
    const json = JSON.stringify([
      { ProcessId: 100, Name: 'node.exe', CommandLine: 'node x.js' },
      { ProcessId: 200, Name: 'ollama.exe', CommandLine: null },
    ])
    expect(parseCimProcesses(json)).toEqual([
      { pid: 100, name: 'node.exe', commandLine: 'node x.js' },
      { pid: 200, name: 'ollama.exe', commandLine: '' },
    ])
  })

  it('wraps the single-object form ConvertTo-Json emits for one result', () => {
    const json = JSON.stringify({ ProcessId: 5, Name: 'pythonw.exe', CommandLine: 'p' })
    expect(parseCimProcesses(json)).toHaveLength(1)
  })

  it('returns empty for empty or invalid output', () => {
    expect(parseCimProcesses('')).toEqual([])
    expect(parseCimProcesses('garbage')).toEqual([])
  })
})
