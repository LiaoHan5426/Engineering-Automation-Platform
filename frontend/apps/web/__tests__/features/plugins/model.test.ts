import { describe, expect, it } from 'vite-plus/test'
import {
  GRANTS,
  INSTALLATION_KEY,
  enabledHashes,
  isKnownHash,
  isShellPage,
  memoryStore,
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
    expect(INSTALLATION_KEY.startsWith('eap.console.')).toBe(false)
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
