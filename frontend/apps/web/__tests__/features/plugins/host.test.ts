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
      getItem: (key: string) =>
        key === INSTALLATION_KEY ? '{"enabled":{"chat":true,"builder":true,"board":true}}' : null,
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

  it('hides board contribution when service dependency is missing', () => {
    const host = createPluginHost(memoryStore())
    expect(host.boardContributionVisible.value).toBe(true)
    host.setServiceAvailable('runtime.board-api', false)
    expect(host.runtimeOf('board').kind).toBe('dependency_missing')
    expect(host.boardContributionVisible.value).toBe(false)
    expect(host.entries.value.some((item) => item.id === 'board')).toBe(false)
    expect(host.installation.value.enabled.board).toBe(true)
  })

  it('rolls back board enable on armed activation failure', () => {
    const store = memoryStore()
    const host = createPluginHost(store)
    host.setEnabled('board', false)
    host.armActivationFailure('mock boom')
    expect(() => host.setEnabled('board', true)).toThrow(/ACTIVATION_FAILED/)
    expect(host.installation.value.enabled.board).toBe(false)
    expect(readInstallation(store).enabled.board).toBe(false)
    expect(host.activationFailure.value?.message).toBe('mock boom')
    expect(host.runtimeOf('board').kind).toBe('activation_failed')
    expect(host.boardContributionVisible.value).toBe(false)
  })

  it('keeps builder instance drafts isolated across board dependency refresh', () => {
    const store = memoryStore()
    const host = createPluginHost(store)
    host.saveBuilder({
      ...host.readBuilder('alpha'),
      draftTitle: '隔离标题-alpha',
    })
    host.saveBuilder({
      ...host.readBuilder('beta'),
      draftTitle: '隔离标题-beta',
    })
    host.setServiceAvailable('runtime.board-api', false)
    host.refreshFromStore()
    expect(host.readBuilder('alpha').draftTitle).toBe('隔离标题-alpha')
    expect(host.readBuilder('beta').draftTitle).toBe('隔离标题-beta')
    host.setServiceAvailable('runtime.board-api', true)
    expect(host.boardContributionVisible.value).toBe(true)
  })
})
