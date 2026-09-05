import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { AGENTS_LIMIT, parseRoster, renderFullCard } from '@terrarium/core'
import { activateCharacter } from './character-activation'

const dirs: string[] = []
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }) })
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'terrarium-activation-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'characters'))
  writeFileSync(join(dir, 'AGENTS.md'), '# Workspace\n\nKeep this instruction.\n')
  for (const name of ['Alpha', 'Beta']) writeFileSync(join(dir, 'characters', `${name.toLowerCase()}.md`), renderFullCard({
    slug: name.toLowerCase(), displayName: name, age: 30, look: 'Brown hair', vibe: 'Friendly',
    loves: 'Walking', relationship: 'Friend', speechStyle: ['Brief'], backstory: 'A fictional test character',
    hardRules: ['Be kind'], photo: { identity: 'woman', outfit: 'coat', shot: 'portrait' }, openerIdeas: ['Hello'],
  }))
  return dir
}
it('switches actual card files while preserving instructions and exact backups', () => {
  const dir = fixture()
  expect(activateCharacter(dir, 'alpha').ok).toBe(true)
  const first = readFileSync(join(dir, 'AGENTS.md'), 'utf8')
  expect(parseRoster(first).map(c => c.name)).toEqual(['Alpha'])
  expect(activateCharacter(dir, 'beta').ok).toBe(true)
  const second = readFileSync(join(dir, 'AGENTS.md'), 'utf8')
  expect(parseRoster(second).map(c => c.name)).toEqual(['Beta'])
  expect(second).toContain('Keep this instruction.')
  const backups = readdirSync(dir).filter(f => f.includes('.bak.'))
  expect(backups).toHaveLength(2)
  expect(backups.map(f => readFileSync(join(dir, f), 'utf8'))).toContain(first)
})
it('leaves workspace untouched when the prompt budget or identity is invalid', () => {
  const dir = fixture()
  const oversized = '# Workspace\n' + 'x'.repeat(AGENTS_LIMIT)
  writeFileSync(join(dir, 'AGENTS.md'), oversized)
  expect(activateCharacter(dir, 'alpha').ok).toBe(false)
  expect(activateCharacter(dir, '../alpha').ok).toBe(false)
  expect(readFileSync(join(dir, 'AGENTS.md'), 'utf8')).toBe(oversized)
  expect(readdirSync(dir).filter(f => f.includes('.bak.'))).toHaveLength(0)
})
