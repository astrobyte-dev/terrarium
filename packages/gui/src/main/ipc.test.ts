import { beforeEach, expect, it, vi } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

const fake = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => unknown>() }))
vi.mock('electron', () => ({ ipcMain: {
  handle: (channel: string, fn: (...args: any[]) => unknown) => fake.handlers.set(channel, fn),
  on: (channel: string, fn: (...args: any[]) => unknown) => fake.handlers.set(channel, fn),
} }))
import { configureIpcSecurity, trustedIpc } from './ipc'

const url = 'file:///C:/Terrarium/out/renderer/index.html'
const mainFrame = { url }
const contents = { mainFrame }
const win = { webContents: contents, isDestroyed: () => false }
const validEvent = () => ({ sender: contents, senderFrame: mainFrame })

beforeEach(() => {
  fake.handlers.clear()
  mainFrame.url = url
  configureIpcSecurity(() => win as never, url)
})

it('authorizes the real window main frame before invoking a service', () => {
  const service = vi.fn()
  trustedIpc.handle('characters:activate', service)
  fake.handlers.get('characters:activate')!(validEvent(), 'ella')
  expect(service).toHaveBeenCalledExactlyOnceWith(validEvent(), 'ella')
})

it('rejects other windows, child frames, and a main frame navigated away from the app', () => {
  const service = vi.fn()
  trustedIpc.handle('characters:activate', service)
  const invoke = fake.handlers.get('characters:activate')!
  expect(() => invoke({ sender: {}, senderFrame: mainFrame }, 'ella')).toThrow('Untrusted')
  expect(() => invoke({ sender: contents, senderFrame: { url } }, 'ella')).toThrow('Untrusted')
  mainFrame.url = 'https://example.com'
  expect(() => invoke(validEvent(), 'ella')).toThrow('Untrusted')
  expect(service).not.toHaveBeenCalled()
})

it('rejects invalid file paths before any service code runs', () => {
  const service = vi.fn()
  trustedIpc.handle('characters:activate', service)
  expect(() => fake.handlers.get('characters:activate')!(validEvent(), '../other')).toThrow('Invalid request')
  expect(service).not.toHaveBeenCalled()
})

it('drops unauthorized fire-and-forget events without crashing the app', () => {
  const quit = vi.fn()
  trustedIpc.on('app:quit', quit)
  fake.handlers.get('app:quit')!({ sender: {}, senderFrame: mainFrame })
  expect(quit).not.toHaveBeenCalled()
  fake.handlers.get('app:quit')!(validEvent())
  expect(quit).toHaveBeenCalledTimes(1)
})

it('keeps all desktop handlers behind the shared authorization wrapper', () => {
  const folder = new URL('.', import.meta.url)
  for (const file of readdirSync(folder).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'ipc.ts')) {
    const source = readFileSync(new URL(file, folder), 'utf8')
    expect(source, file).not.toMatch(/import\s*\{[^}]*\bipcMain\b[^}]*\}\s*from\s*['"]electron['"]/) 
  }
})
