import { describe, expect, it } from 'vite-plus/test'
import { createPluginHost } from '../../../src/features/plugins/host'
import { INSTALLATION_KEY, memoryStore, readInstallation } from '../../../src/features/plugins/model'

describe('plugin host board contribution', () => {
  it('hides board nav when disabled and restores after refresh', () => {
    const store = memoryStore()
    const host = createPluginHost(store)
    expect(host.entries.value.some((item) => item.id === 'board')).toBe(true)
    host.setEnabled('board', false)
    expect(host.boardContributionVisible.value).toBe(false)
    expect(host.entries.value.some((item) => item.id === 'board')).toBe(false)
    expect(readInstallation(store).enabled.board).toBe(false)
    host.setEnabled('board', true)
    expect(host.entries.value.some((item) => item.id === 'board')).toBe(true)
  })

  it('rolls back activation when persistence fails', () => {
    let fail = false
    const store = {
      getItem: (key: string) => (key === INSTALLATION_KEY ? '{"enabled":{"chat":true,"builder":true,"board":true}}' : null),
      setItem: () => {
        if (fail) throw new Error('quota')
      },
    }
    const host = createPluginHost(store)
    expect(host.installation.value.enabled.board).toBe(true)
    fail = true
    expect(() => host.setEnabled('board', false)).toThrow(/PERSIST_FAILED/)
    expect(host.installation.value.enabled.board).toBe(true)
  })
})
