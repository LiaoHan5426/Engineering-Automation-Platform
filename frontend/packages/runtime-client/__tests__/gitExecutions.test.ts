// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
const { requests } = vi.hoisted(() => ({
  requests: [] as { url?: string; method?: string; data?: unknown }[],
}))
vi.mock('axios', async (original) => {
  const actual = await original<typeof import('axios')>()
  return {
    ...actual,
    default: {
      ...actual.default,
      create: (options: object) =>
        actual.default.create({
          ...options,
          adapter: async (config) => {
            requests.push({ url: config.url, method: config.method, data: config.data })
            return {
              status: 200,
              statusText: 'OK',
              headers: {},
              config,
              data: { id: 'execution', items: [] },
            }
          },
        }),
    },
  }
})
import { runtimeApi } from '../src/index'
beforeEach(() => {
  requests.length = 0
})
describe('bounded Git execution client', () => {
  it.each(['git-status', 'git-diff'] as const)(
    'routes %s and sends only the request ID',
    async (operation) => {
      await runtimeApi.startGitOperationExecution(operation, 'request')
      await runtimeApi.gitOperationExecutions(operation)
      await runtimeApi.gitOperationExecution(operation, 'id/with slash')
      await runtimeApi.cancelGitOperationExecution(operation, 'id/with slash')
      const base = '/cli-programs/git/operations/' + operation + '/executions'
      expect(requests.map(({ method, url }) => [method, url])).toEqual([
        ['post', base],
        ['get', base],
        ['get', base + '/id%2Fwith%20slash'],
        ['post', base + '/id%2Fwith%20slash/cancel'],
      ])
      expect(JSON.parse(requests[0]!.data as string)).toEqual({ requestId: 'request' })
    },
  )
  it('reads process clues only from the captured execution route', async () => {
    await runtimeApi.gitExecutionProcessReview('git-diff', 'id/with slash')
    expect(requests).toEqual([
      {
        method: 'get',
        url: '/cli-programs/git/operations/git-diff/executions/id%2Fwith%20slash/process-review',
        data: undefined,
      },
    ])
  })
  it('binds unknown review to one operation and execution without extra fields', async () => {
    const review = {
      requestId: 'review',
      note: 'Verified all related processes stopped',
      processTreeStopped: true as const,
    }
    await runtimeApi.resolveUnknownGitExecution('git-diff', 'id/with slash', review)
    expect(requests[0]?.url).toBe(
      '/cli-programs/git/operations/git-diff/executions/id%2Fwith%20slash/resolve-unknown',
    )
    expect(JSON.parse(requests[0]!.data as string)).toEqual(review)
  })
  it('preserves status wrappers and rejects unknown runtime operation values before HTTP', async () => {
    await runtimeApi.startTrustedGitExecution('request')
    await runtimeApi.trustedGitExecutions()
    await runtimeApi.trustedGitExecution('id')
    await runtimeApi.cancelTrustedGitExecution('id')
    expect(requests.every(({ url }) => url?.includes('/git-status/executions'))).toBe(true)
    requests.length = 0
    expect(() => runtimeApi.gitOperationExecution('git-log' as 'git-diff', 'id')).toThrow(
      'TOOL_OPERATION_NOT_FOUND',
    )
    expect(requests).toEqual([])
  })
})
