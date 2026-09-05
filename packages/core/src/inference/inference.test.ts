import { afterEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { RequestQueue } from './queue'
import { helperContext } from './settings'
import { activeCharacter, compactMessages, retrieveMemories } from './context'
import { createInferenceProxy } from './proxy'
import { buildOpenclawConfig } from '../config/template'
import { extractUserTuning } from '../config/user-tuning'

const temporary: string[] = []
const temp = () => { const path = mkdtempSync(join(tmpdir(), 'terrarium-inference-')); temporary.push(path); return path }
afterEach(() => { for (const path of temporary.splice(0)) rmSync(path, { recursive: true, force: true }) })
describe('inference resource queue', () => {
  it('serializes work and lets waiting interactive work precede background requests', async () => {
    const q = new RequestQueue(); const order: number[] = []
    let release!: () => void
    const first = q.run(async () => { await new Promise<void>(r => { release = r }); order.push(1) })
    const bg = q.run(async () => { order.push(3) }, undefined, 10)
    const foreground = q.run(async () => { order.push(2) })
    release(); await Promise.all([first, bg, foreground]); expect(order).toEqual([1, 2, 3])
  })
  it('does not execute cancelled pending work', async () => {
    const q = new RequestQueue(); let release!: () => void
    const first = q.run(() => new Promise<void>(r => { release = r }))
    const controller = new AbortController(); let ran = false
    const pending = q.run(async () => { ran = true }, controller.signal)
    controller.abort(); release(); await first
    await expect(pending).rejects.toThrow('cancelled'); expect(ran).toBe(false)
  })
})
describe('bounded context and memory', () => {
  it('keeps explicit memories and scene state with the active character', () => {
    const workspace = temp(); mkdirSync(join(workspace, 'characters'))
    writeFileSync(join(workspace, 'characters/maya.md'), 'Maya')
    writeFileSync(join(workspace, 'AGENTS.md'), 'Active adult character: Maya')
    writeFileSync(join(workspace, 'active-character.json'), '{"character":"maya"}')
    expect(activeCharacter(workspace)).toBe('maya')
    const result = compactMessages([{ role: 'user', content: '/remember My dog is Pip' }], workspace)
    expect(result.character).toBe('maya')
    expect(readFileSync(join(workspace, 'memory/characters/maya.md'), 'utf8')).toContain('Pip')
    compactMessages([{ role: 'user', content: '/scene At the cafe' }], workspace)
    expect(JSON.parse(readFileSync(join(workspace, 'memory/characters/maya.scene.json'), 'utf8')).scene).toBe('At the cafe')
  })
  it('allows template/output headroom and rejects inputs instead of silently truncating', () => {
    expect(helperContext('Caption a forest', 128)).toBe(4096)
    expect(helperContext('字'.repeat(1500), 512)).toBe(8192)
    expect(() => helperContext('x'.repeat(25000))).toThrow('budget')
  })
  it('retrieves a bounded relevant subset with provenance and deduplication', () => {
    expect(retrieveMemories('dog', [{ source: 'facts', text: '- My dog is Pip\n- I like coffee\n- My dog is Pip' }], 1)).toEqual(['- My dog is Pip [facts]'])
  })
  it('preserves the latest user message and curated instructions while replacing framework boilerplate', () => {
    const workspace = temp(); writeFileSync(join(workspace, 'AGENTS.md'), 'A fictional adult companion, witty and concise.')
    writeFileSync(join(workspace, 'MEMORY.md'), '- The user has a dog named Pip')
    const result = compactMessages([{ role: 'system', content: 'framework'.repeat(4000) }, { role: 'user', content: 'How is my dog?' }], workspace)
    expect(result.afterChars).toBeLessThan(result.beforeChars)
    expect(result.messages.at(-1)?.content).toBe('How is my dog?')
    expect(result.messages[0]?.content).toContain('Pip')
  })
})
describe('durable Venice configuration', () => {
  it('preserves provider and overrides across coordinated regeneration without writing its key', () => {
    const config = buildOpenclawConfig('env-refs', null, { veniceEnabled: true, coordinated: true, primaryModel: 'venice/venice-uncensored-1-2' })
    const again = buildOpenclawConfig('env-refs', null, { veniceEnabled: true, coordinated: true, tuning: extractUserTuning(config) })
    expect(again).toEqual(config)
    expect((again.models as any).providers.venice.baseUrl).toContain('18790/chat/venice/v1')
    expect((again.models as any).providers.venice.apiKey).toBe('terrarium-coordinator')
  })
})
describe('coordinator HTTP behavior', () => {
  it('declines local GPU work during external training without interrupting training or calling the backend', async () => {
    let called = false
    const broker = createInferenceProxy({ port: 0, dataDir: temp(), externalGpuBusy: async () => true,
      fetchImpl: (async () => { called = true; return Response.json({}) }) as typeof fetch })
    await broker.listen()
    try {
      const response = await fetch(`http://127.0.0.1:${(broker.server.address() as { port: number }).port}/comfy/prompt`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"prompt":{}}' })
      expect(response.status).toBe(503); expect(await response.text()).toContain('training')
      expect(called).toBe(false)
    } finally { await broker.close() }
  })
  it('retains the GPU lease after asynchronous render acceptance and handles an empty free response', async () => {
    let rendering = true; const calls: string[] = []
    const broker = createInferenceProxy({ port: 0, dataDir: temp(), fetchImpl: (async (url) => {
      const path = new URL(String(url)).pathname; calls.push(path)
      if (path === '/api/ps') return Response.json({ models: [] })
      if (path === '/prompt') return Response.json({ prompt_id: 'test-job' })
      if (path === '/queue') return Response.json({ queue_running: rendering ? ['test-job'] : [], queue_pending: [] })
      if (path === '/free') return new Response('')
      return Response.json({ message: { content: 'Ready' }, done: true })
    }) as typeof fetch })
    await broker.listen(); const base = `http://127.0.0.1:${(broker.server.address() as { port: number }).port}`
    const post = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    try {
      await (await post('/comfy/prompt', { prompt: {} })).text()
      const local = post('/ollama/api/chat', { model: 'dolphin3:8b', messages: [] })
      await new Promise(r => setTimeout(r, 50))
      expect(calls).not.toContain('/api/chat')
      rendering = false
      expect((await local).status).toBe(200)
      expect(calls.indexOf('/free')).toBeLessThan(calls.indexOf('/api/chat'))
    } finally { rendering = false; await broker.close() }
  })
  it('allows local chat when ComfyUI is stopped, without hiding other backend failures', async () => {
    const broker = createInferenceProxy({ port: 0, dataDir: temp(), fetchImpl: (async (url) => {
      if (String(url).endsWith('/queue')) throw new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } })
      return Response.json({ message: { content: 'Offline reply' } })
    }) as typeof fetch })
    await broker.listen()
    try {
      const r = await fetch(`http://127.0.0.1:${(broker.server.address() as { port: number }).port}/ollama/api/chat`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: 'dolphin3:8b' }) })
      expect(r.status).toBe(200)
    } finally { await broker.close() }
  })
  it('enforces budget before inference and never forwards arbitrary routes', async () => {
    let called = false
    const broker = createInferenceProxy({ port: 0, dataDir: temp(), budgetUsd: 0,
      credentials: { venice: 'test-secret' }, fetchImpl: (async () => { called = true; return new Response('{}') }) as typeof fetch })
    await broker.listen(); const port = (broker.server.address() as { port: number }).port
    try {
      const r = await fetch(`http://127.0.0.1:${port}/venice/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'venice-uncensored-1-2', messages: [{ role: 'user', content: 'hello' }] }) })
      expect(r.status).toBe(429); expect(called).toBe(false)
      expect((await fetch(`http://127.0.0.1:${port}/ollama/api/delete`, { method: 'POST' })).status).toBe(404)
    } finally { await broker.close() }
  })
  it('forwards Venice options, streams data, and records usage without logging content or keys', async () => {
    const dir = temp(); let body: any
    const broker = createInferenceProxy({ port: 0, dataDir: dir, budgetUsd: 1, credentials: { venice: 'secret-credential' },
      fetchImpl: (async (_url, init) => { body = JSON.parse(String(init?.body)); return new Response('data: {"choices":[{"delta":{"content":"private-response"}}]}\n\ndata: {"usage":{"prompt_tokens":5,"completion_tokens":3}}\n\ndata: [DONE]\n', { headers: { 'content-type': 'text/event-stream' } }) }) as typeof fetch })
    await broker.listen(); const port = (broker.server.address() as { port: number }).port
    try {
      const r = await fetch(`http://127.0.0.1:${port}/venice/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'venice-uncensored-1-2', max_completion_tokens: 256, stream: true, messages: [{ role: 'user', content: 'private-prompt' }] }) })
      expect(await r.text()).toContain('private-response')
      expect(body.venice_parameters.disable_thinking).toBe(true)
      expect(body.max_tokens).toBe(256)
      expect(body.max_completion_tokens).toBeUndefined()
      expect(broker.status().venice.spentUsd).toBeCloseTo(0.0000037, 8)
      const log = readFileSync(join(dir, 'performance.jsonl'), 'utf8')
      expect(log).not.toMatch(/secret-credential|private-prompt|private-response/)
    } finally { await broker.close() }
  })
})
