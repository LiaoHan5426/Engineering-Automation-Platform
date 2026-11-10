// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
const { reply, requests } = vi.hoisted(() => ({
  reply: { data: {} as unknown },
  requests: [] as { url?: string; method?: string; params?: unknown; signal?: unknown }[],
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
            requests.push({
              url: config.url,
              method: config.method,
              params: config.params,
              signal: config.signal,
            })
            return { status: 200, statusText: 'OK', headers: {}, config, data: reply.data }
          },
        }),
    },
  }
})
import { runtimeApi, type BoardRuntimeSnapshot } from '../src/index'
function snapshot(): BoardRuntimeSnapshot {
  return {
    projectId: 'scope / one',
    observedAt: '2026-11-10T04:00:00Z',
    taskCount: 1,
    runCount: 1,
    activeRunCount: 0,
    unknownRunCount: 1,
    activeVerificationCount: 0,
    unknownVerificationCount: 0,
    activeWriteCount: 0,
    unknownWriteCount: 0,
    items: [{ taskId: 'task', id: 'run', kind: 'RUN', status: 'UNKNOWN', storedStatus: 'RUNNING' }],
    truncated: false,
  }
}
beforeEach(() => {
  requests.length = 0
  reply.data = snapshot()
})
describe('read-only board runtime contract', () => {
  it('keeps scope in GET params, propagates abort, and preserves unknown and stored state', async () => {
    const controller = new AbortController()
    const result = await runtimeApi.boardRuntime('scope / one', controller.signal)
    expect(result).toEqual(snapshot())
    expect(requests).toEqual([
      {
        url: '/board/runtime',
        method: 'get',
        params: { projectId: 'scope / one' },
        signal: controller.signal,
      },
    ])
  })
  it.each([
    { projectId: 'other' },
    { observedAt: 'invalid' },
    { observedAt: null },
    { runCount: -1 },
    { taskCount: Number.MAX_SAFE_INTEGER + 1 },
    { unknownRunCount: '1' },
    { items: null },
    { items: Array.from({ length: 21 }, () => snapshot().items[0]) },
    { items: [{ ...snapshot().items[0], kind: 'TOOL' }] },
    { items: [{ ...snapshot().items[0], status: 'SUCCEEDED' }] },
    { items: [{ ...snapshot().items[0], storedStatus: undefined }] },
    { truncated: 'false' },
  ])('rejects an invalid successful HTTP response: %j', async (override) => {
    reply.data = { ...snapshot(), ...override }
    await expect(runtimeApi.boardRuntime('scope / one')).rejects.toThrow(
      'INVALID_BOARD_RUNTIME_RESPONSE',
    )
  })
})
