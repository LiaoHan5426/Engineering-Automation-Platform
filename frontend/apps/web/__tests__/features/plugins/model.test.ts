import { describe, expect, it } from 'vite-plus/test'
import {
  GRANTS,
  INSTALLATION_KEY,
  enabledHashes,
  isKnownHash,
  isShellPage,
  memoryStore,
  resolveAreaView,
  readInstallation,
  writeInstallation,
} from '../../../src/features/plugins/model'

describe('plugin prototype store', () => {
  it('keeps shell hashes and gives the two builders different storage keys', () => {
    expect(isShellPage('sql')).toBe(true)
    expect(isShellPage('capabilities')).toBe(true)
    expect(isShellPage('model-settings')).toBe(true)
    expect(isKnownHash('model-settings')).toBe(true)
    expect(isShellPage('chat')).toBe(false)
    expect(isKnownHash('plugins')).toBe(true)
    expect(isKnownHash('builder-alpha')).toBe(true)
    expect(isShellPage('patterns')).toBe(true)
    expect(isKnownHash('patterns')).toBe(true)
    expect(INSTALLATION_KEY.startsWith('eap.console.')).toBe(false)
  })

  it('maps the five prototype area hashes onto a landing view', () => {
    // Ardot five-entry shell: #code / #work / #scenes / #experts / #settings.
    expect(resolveAreaView('code')).toBe('chat')
    expect(resolveAreaView('settings')).toBe('model-settings')
    expect(resolveAreaView('work')).toBe('work')
    expect(resolveAreaView('scenes')).toBe('scenes')
    expect(resolveAreaView('experts')).toBe('experts')
    expect(resolveAreaView('expert-catalog')).toBe('experts')
    // Canonical view hashes and unrelated values pass through unchanged.
    expect(resolveAreaView('chat')).toBe('chat')
    expect(resolveAreaView('rules')).toBe('rules')
    expect(resolveAreaView('anything-else')).toBe('anything-else')
    // Work document workspace is a prototype-symmetric standalone surface.
    expect(resolveAreaView('workdoc')).toBe('workdoc')
    expect(isKnownHash('workdoc')).toBe(true)
  })

  it('hides and restores contributions without granting requested permissions', () => {
    const store = memoryStore()
    writeInstallation(store, { enabled: { chat: true, builder: false, board: true } })
    expect(enabledHashes(readInstallation(store))).not.toContain('builder-alpha')
    writeInstallation(store, { enabled: { chat: false, builder: true, board: false } })
    expect(enabledHashes(readInstallation(store))).toEqual(['builder-alpha', 'builder-beta'])
    expect(GRANTS).toEqual([])
  })
})
