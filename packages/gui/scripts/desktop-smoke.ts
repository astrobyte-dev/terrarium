// Separate Electron entry point: loads the real built preload/renderer with fixture
// handlers only. Never imports the live supervisor or any user-data service modules.
import { app, BrowserWindow, protocol } from 'electron'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import { configureIpcSecurity, trustedIpc } from '../src/main/ipc'
import { rendererPreferences, secureWindow } from '../src/main/window-security'

const output = resolve(process.env['TERRARIUM_SMOKE_OUTPUT']!)
const built = resolve(process.env['TERRARIUM_SMOKE_BUILD']!)
app.setPath('userData', mkdtempSync(join(tmpdir(), 'terrarium-desktop-test-')))
app.disableHardwareAcceleration()
protocol.registerSchemesAsPrivileged([{ scheme: 'terrarium', privileges: { standard: true, secure: true, stream: true } }])
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms))
const checks: string[] = []
const rendererErrors: string[] = []
const sent: string[] = []
let activated = ''
let failActivation = false
let savedPreset = ''
let forgottenCharacter = ''
let win: BrowserWindow

async function evaluate<T = unknown>(code: string): Promise<T> { return win.webContents.executeJavaScript(code, true) }
async function until(code: string): Promise<void> {
  const deadline = Date.now() + 8000
  while (!await evaluate(code)) {
    if (Date.now() > deadline) throw new Error(`UI condition timed out: ${code}`)
    await pause(30)
  }
}
async function navigate(label: string): Promise<void> {
  await evaluate(`[...document.querySelectorAll('.nav-item')].find(b => b.textContent.trim() === ${JSON.stringify(label)}).click()`)
  await pause(50)
}
async function draft(text: string): Promise<void> {
  await evaluate(`(() => { const input = document.querySelector('input[aria-label="Message"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(text)});
    input.dispatchEvent(new Event('input', { bubbles: true })); })()`)
}
const note = (text: string) => { checks.push(text); console.log(`PASS ${text}`) }

app.whenReady().then(async () => {
  try {
    const url = pathToFileURL(join(built, 'renderer/index.html')).href
    win = new BrowserWindow({ width: 1280, height: 900, show: false, frame: false,
      webPreferences: { ...rendererPreferences, offscreen: true, preload: join(built, 'preload/index.js') } })
    secureWindow(win, url)
    configureIpcSecurity(() => win, url)
    win.webContents.on('console-message', ({ level, message }) => { if (level === 'error' && !message.includes('ERR_FILE_NOT_FOUND')) rendererErrors.push(message) })
    win.webContents.on('preload-error', (_e, _path, error) => rendererErrors.push(error.message))
    protocol.handle('terrarium', () => new Response(new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64')), { headers: { 'content-type': 'image/png' } }))
    const history = Array.from({ length: 40 }, (_, i) => ({ id: `fixture-${i}`, role: i % 2 ? 'assistant' : 'user',
      text: `Sample conversation ${i + 1}. This is isolated test content for reading and scroll checks.`, ts: Date.now() - (40 - i) * 1000 }))
    const roster = { cards: [{ slug: 'ella', heading: 'library:ella', name: 'Eleanor', age: 25, chars: 1200 },
      { slug: 'maya', heading: 'library:maya', name: 'Maya', age: 28, chars: 1100 }], totalChars: 1500, limit: 12000, headroom: 10300 }
    const fixtures: Record<string, unknown> = {
      'core:getState': { services: [], meta: { bot: { name: 'Ella', handle: '@test', live: true }, owner: 'tasks', brain: 'fixture/local', gpu: null } },
      'chat:connect': { ok: true, history }, 'characters:list': roster, 'inbox:recent': [], 'gallery:list': [],
      'voice:catalog': { ready: false, voices: [], default: 'af_heart', map: {} },
      'gen:get': { faceLock: true, feetFocus: false, explicitDefault: false, hdAuto: false, detailers: true, alwaysInclude: [] },
      'proactive:get': { enabled: false, minIdleMinutes: 120, cooldownMinutes: 240, maxPerDay: 2, wakingStartHour: 9, wakingEndHour: 22 },
      'brains:list': { current: 'fixture/local', models: [], veniceBudget: { limitUsd: 1, accountedUsd: 0.125 } }, 'brains:probe': {},
      'doctor:report': { healthy: true, checks: [] }, 'memory:list': { memories: ['Fixture memory'], facts: [], character: 'ella', characterMemories: ['Fixture dog is Pip'] },
    }
    for (const [channel, value] of Object.entries(fixtures)) trustedIpc.handle(channel, () => value)
    trustedIpc.handle('gen:set', (_e, patch: { preset?: string }) => { savedPreset = patch.preset ?? ''; return { ...(fixtures['gen:get'] as object), ...patch } })
    trustedIpc.handle('memory:saveCharacter', (_e, character: string) => { forgottenCharacter = character; return { ok: true } })
    trustedIpc.handle('characters:activate', (_e, slug: string) => {
      if (failActivation) return { ok: false, message: 'Test: character could not be loaded' }
      activated = slug
      return { ok: true, message: 'Activated in fixture' }
    })
    trustedIpc.handle('chat:send', async (_e, req: { id: string; text: string }) => {
      sent.push(req.text)
      win.webContents.send('chat:status', { state: 'sending', detail: 'waiting for reply' })
      await pause(60)
      win.webContents.send('chat:message', { ...req, role: 'user', ts: Date.now() })
      win.webContents.send('chat:message', { id: `reply-${req.id}`, role: 'assistant', text: `Fixture reply to: ${req.text}`, ts: Date.now() + 1 })
      win.webContents.send('chat:status', { state: 'ready', detail: 'connected' })
      return { ok: true }
    })
    await win.loadURL(url)
    await until(`document.querySelectorAll('.nav-item').length === 6`)
    await navigate('Chat')
    await until(`document.querySelectorAll('.msg-row').length >= 40`)
    assert.equal(await evaluate(`typeof window.require`), 'undefined')
    // Electron exposes this diagnostic at runtime but omits it from public typings.
    const preferences = (win.webContents as typeof win.webContents & { getLastWebPreferences(): { sandbox: boolean } }).getLastWebPreferences()
    assert.equal(preferences.sandbox, true)
    note('Built renderer and real preload work with the sandbox enabled')
    await evaluate(`(() => { const preset = document.querySelector('#image-preset'); preset.value = 'preview'; preset.dispatchEvent(new Event('change', { bubbles: true })); })()`)
    await until(`document.querySelector('#image-preset').value === 'preview'`)
    assert.equal(savedPreset, 'preview')
    win.webContents.send('chat:message', { id: 'caption-fixture', role: 'assistant', text: '', images: ['terrarium://inbox/fixture.png'], ts: Date.now() })
    await until(`document.querySelectorAll('img[src="terrarium://inbox/fixture.png"]').length === 1`)
    win.webContents.send('chat:message', { id: 'caption-fixture', role: 'assistant', text: 'A later caption', images: ['terrarium://inbox/fixture.png'], ts: Date.now() })
    await until(`document.querySelector('.chat-log').textContent.includes('A later caption')`)
    assert.equal(await evaluate(`document.querySelectorAll('img[src="terrarium://inbox/fixture.png"]').length`), 1)
    note('Image preset saves through the preload; late captions update one image bubble')
    await evaluate(`document.querySelector('button[aria-label="Memories"]').click()`)
    await until(`document.querySelector('.mem-modal')?.textContent.includes('Fixture dog is Pip')`)
    await evaluate(`document.querySelector('button[aria-label="Forget character memory"]').click()`)
    await until(`!document.querySelector('.mem-modal').textContent.includes('Fixture dog is Pip')`)
    assert.equal(forgottenCharacter, 'ella')
    await evaluate(`document.querySelector('.mem-close').click()`)
    await navigate('Brains')
    await until(`document.body.textContent.includes('US$0.875 remaining')`)
    await pause(150) // Allow the Chromium compositor to present the new screen before capture.
    writeFileSync(join(output, 'brains.png'), (await win.webContents.capturePage()).toPNG())
    await navigate('Chat')
    note('Character memory controls and Venice allowance display work in the built app')

    await draft('Draft that must survive navigation')
    await navigate('Dashboard'); await navigate('Chat')
    assert.equal(await evaluate(`document.querySelector('input[aria-label="Message"]').value`), 'Draft that must survive navigation')
    await win.loadURL(url)
    await until(`document.querySelectorAll('.nav-item').length === 6`)
    await navigate('Chat')
    assert.equal(await evaluate(`document.querySelector('input[aria-label="Message"]').value`), 'Draft that must survive navigation')
    note('Draft survives screen changes and a full renderer reload')

    win.webContents.send('chat:status', { state: 'reconnecting', detail: 'retrying in 2s' })
    await until(`document.querySelector('.chat-conn').textContent.includes('retrying in 2s')`)
    assert.equal(await evaluate(`document.querySelector('input[aria-label="Message"]').disabled`), false)
    assert.equal(await evaluate(`document.querySelector('.chat-input button[type="submit"]').disabled`), true)
    await draft('Written while offline')
    mkdirSync(output, { recursive: true })
    writeFileSync(join(output, 'reconnecting.png'), (await win.webContents.capturePage()).toPNG())
    win.webContents.send('chat:status', { state: 'ready', detail: 'connected' })
    await until(`!document.querySelector('.chat-input button[type="submit"]').disabled`)
    await evaluate(`document.querySelector('.chat-input button[type="submit"]').click()`)
    await until(`document.querySelector('.chat-log').textContent.includes('Fixture reply to: Written while offline')`)
    assert.ok(sent.includes('Written while offline'))
    note('Offline drafting, reconnect status, and sending through the preload work')

    await evaluate(`(() => { const log = document.querySelector('.chat-log'); log.scrollTop = 0; log.dispatchEvent(new Event('scroll')); })()`)
    win.webContents.send('chat:message', { id: 'new-while-reading', role: 'assistant', text: 'A new message while reading old messages', ts: Date.now() })
    await until(`document.querySelector('.chat-jump') !== null`)
    assert.ok(await evaluate<number>(`document.querySelector('.chat-log').scrollTop`) < 50)
    await evaluate(`document.querySelector('.chat-jump').click()`)
    await until(`(() => { const l = document.querySelector('.chat-log'); return l.scrollHeight - l.scrollTop - l.clientHeight < 10; })()`)
    note('Incoming messages preserve reading position; Jump to latest reaches the bottom')

    await evaluate(`document.querySelector('.chat-roster-item[title*="/be ella"]').click()`)
    await until(`document.querySelector('.chat-log').textContent.includes('Fixture reply to: /be ella')`)
    assert.equal(activated, 'ella')
    note('Renamed character uses its stable file identity when switching')
    failActivation = true
    await evaluate(`document.querySelector('.chat-roster-item[title*="/be maya"]').click()`)
    await until(`document.querySelector('[role="alert"]')?.textContent.includes('could not be loaded')`)
    assert.equal(activated, 'ella')
    note('Failed character switch shows an error and retains the active character')

    win.webContents.send('chat:status', { state: 'sending', detail: 'waiting' })
    await until(`document.querySelector('button[title="Start a real fresh conversation"]').disabled`)
    win.webContents.send('chat:status', { state: 'ready', detail: 'connected' })
    await until(`!document.querySelector('button[title="Start a real fresh conversation"]').disabled`)
    await evaluate(`document.querySelector('button[title="Start a real fresh conversation"]').click()`)
    await evaluate(`[...document.querySelectorAll('.chat-clear-yes')].find(b => b.textContent === 'New chat').click()`)
    await until(`document.querySelector('.chat-log').textContent.includes('Fixture reply to: /new')`)
    assert.equal(await evaluate(`document.querySelector('.chat-log').textContent.includes('Sample conversation')`), false)
    note('Reset is disabled while sending and clears the old view after acceptance')

    const badRequest = await evaluate(`window.terrarium.characters.activate('../outside').then(() => false, () => true)`)
    assert.equal(badRequest, true)
    assert.equal(activated, 'ella')
    assert.equal(await evaluate(`window.open('https://example.com') === null`), true)
    const currentUrl = win.webContents.getURL()
    await evaluate(`location.href = 'https://example.com'; true`)
    await pause(100)
    assert.equal(win.webContents.getURL(), currentUrl)
    note('Traversal requests, new windows, and external navigation are blocked')

    await navigate('Characters')
    await until(`document.querySelector('.chars-name')?.textContent.includes('Eleanor')`)
    await navigate('Doctor'); await until(`document.querySelector('.doctor') !== null || document.body.textContent.includes('Health')`)
    await navigate('Chat')
    writeFileSync(join(output, 'chat.png'), (await win.webContents.capturePage()).toPNG())
    // 900px is the application's supported minimum width.
    win.setSize(900, 760)
    await pause(100)
    writeFileSync(join(output, 'chat-minimum.png'), (await win.webContents.capturePage()).toPNG())
    assert.ok(await evaluate(`(() => {
      const chat = document.querySelector('.chat').getBoundingClientRect();
      const send = document.querySelector('.chat-input button[type="submit"]').getBoundingClientRect();
      return send.right <= chat.right && document.querySelector('.chat-head').scrollWidth <= chat.width;
    })()`), 'Header and Send must fit at the minimum supported window width')
    note('Chat header and composer fit at the minimum supported width')
    assert.deepEqual(rendererErrors, [])
    note('No renderer/preload errors during the desktop smoke pass')
    writeFileSync(join(output, 'results.json'), JSON.stringify({ passed: checks, rendererErrors, build: built }, null, 2))
    app.exit(0)
  } catch (error) {
    console.error(error)
    mkdirSync(output, { recursive: true })
    writeFileSync(join(output, 'failure.json'), JSON.stringify({ error: String(error), checks, rendererErrors }, null, 2))
    if (win && !win.isDestroyed()) writeFileSync(join(output, 'failure.png'), (await win.webContents.capturePage()).toPNG())
    app.exit(1)
  }
})
