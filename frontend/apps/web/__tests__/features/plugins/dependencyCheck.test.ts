import { runtimeSnapshot } from './runtimeSnapshot'
import { describe, expect, it, vi } from 'vite-plus/test'
import { runtimeApi } from '@eap/runtime-client'
import { createPluginHost } from '../../../src/features/plugins/host'
import { memoryStore } from '../../../src/features/plugins/model'

describe('explicit read-only board dependency observation (simulated API)', () => {
  it('rejects unbounded query scope and malformed successful responses', async () => {
    const query = vi
      .spyOn(runtimeApi, 'boardRuntime')
      .mockResolvedValue({} as Awaited<ReturnType<typeof runtimeApi.boardRuntime>>)
    try {
      const host = createPluginHost(memoryStore())
      await host.checkBoardDependencies(' ')
      await host.checkBoardDependencies('x'.repeat(121))
      expect(query).not.toHaveBeenCalled()
      await host.checkBoardDependencies('bounded')
      expect(host.boardDependencyCheck.value).toMatchObject({
        status: 'failed',
        reason: 'INVALID_BOARD_RUNTIME_RESPONSE',
      })
    } finally {
      query.mockRestore()
    }
  })

  it('does not re-enable a board disabled during an in-flight read', async () => {
    let finish!: (page: ReturnType<typeof runtimeSnapshot>) => void
    const query = vi.spyOn(runtimeApi, 'boardRuntime').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    try {
      const host = createPluginHost(memoryStore())
      const pending = host.checkBoardDependencies('one')
      host.setEnabled('board', false)
      finish(runtimeSnapshot('one'))
      await pending
      expect(host.boardDependencyCheck.value.status).toBe('available')
      expect(host.installation.value.enabled.board).toBe(false)
      expect(host.runtimeOf('board').kind).toBe('disabled')
    } finally {
      query.mockRestore()
    }
  })

  it('ignores late reads after center disposal and deduplicates double clicks', async () => {
    let finish!: (page: ReturnType<typeof runtimeSnapshot>) => void
    const query = vi.spyOn(runtimeApi, 'boardRuntime').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    try {
      const host = createPluginHost(memoryStore())
      const pending = host.checkBoardDependencies('one')
      await host.checkBoardDependencies('two')
      expect(query).toHaveBeenCalledTimes(1)
      expect(host.boardDependencyCheck.value.status).toBe('checking')
      host.cancelBoardDependencyCheck()
      query.mockImplementationOnce(async (project) => runtimeSnapshot(project))
      await host.checkBoardDependencies('new')
      finish(runtimeSnapshot('one'))
      await pending
      expect(host.boardDependencyCheck.value.source).toContain('projectId=new')
      expect(host.boardDependencyCheck.value.status).toBe('available')
    } finally {
      query.mockRestore()
    }
  })

  it('reports failed observations without claiming missing or changing enabled/config/activation', async () => {
    const query = vi.spyOn(runtimeApi, 'boardRuntime').mockRejectedValue(new Error('HTTP 503'))
    try {
      const store = memoryStore()
      const host = createPluginHost(store)
      host.saveBuilder({ ...host.readBuilder('alpha'), draftTitle: 'retained' })
      await host.checkBoardDependencies('one')
      expect(host.boardDependencyCheck.value).toMatchObject({
        status: 'failed',
        reason: 'HTTP 503',
      })
      expect(host.runtimeOf('board').kind).toBe('dependency_check_failed')
      expect(host.boardContributionVisible.value).toBe(true)
      expect(host.installation.value.enabled.board).toBe(true)
      host.setEnabled('board', false)
      host.armActivationFailure('sticky')
      expect(() => host.setEnabled('board', true)).toThrow(/ACTIVATION_FAILED/)
      query.mockImplementationOnce(async (project) => runtimeSnapshot(project))
      await host.checkBoardDependencies('one')
      expect(host.runtimeOf('board').kind).toBe('activation_failed')
      expect(host.activationFailure.value?.message).toBe('sticky')
      expect(host.installation.value.enabled.board).toBe(false)
      expect(host.readBuilder('alpha').draftTitle).toBe('retained')
      host.setServiceAvailable('runtime.board-api', true)
      expect(host.activationFailure.value?.message).toBe('sticky')
    } finally {
      query.mockRestore()
    }
  })

  it('starts unchecked without network and records only the scoped GET observation', async () => {
    const query = vi
      .spyOn(runtimeApi, 'boardRuntime')
      .mockImplementation(async (project) => runtimeSnapshot(project))
    try {
      const host = createPluginHost(memoryStore())
      expect(host.boardDependencyCheck.value.status).toBe('unchecked')
      expect(host.runtimeOf('board').kind).toBe('dependency_unchecked')
      expect(host.boardContributionVisible.value).toBe(true)
      expect(query).not.toHaveBeenCalled()
      await host.checkBoardDependencies('project one')
      expect(query).toHaveBeenCalledExactlyOnceWith('project one', expect.any(AbortSignal))
      expect(host.boardDependencyCheck.value).toMatchObject({
        status: 'available',
        source: 'GET /api/board/runtime?projectId=project%20one',
      })
      expect(host.boardDependencyCheck.value.observedAt).toEqual(expect.any(String))
      expect(host.runtimeOf('board').kind).toBe('ready')
    } finally {
      query.mockRestore()
    }
  })
})
