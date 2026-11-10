// @vitest-environment happy-dom
import { beforeEach, expect, it, vi } from 'vite-plus/test'
const { reply, requests } = vi.hoisted(() => ({
  reply: { data: {} as unknown },
  requests: [] as { method?: string; url?: string; signal?: unknown }[],
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
            requests.push({ method: config.method, url: config.url, signal: config.signal })
            return { status: 200, statusText: 'OK', headers: {}, config, data: reply.data }
          },
        }),
    },
  }
})
import { runtimeApi } from '../src/index'
const snapshot = () => ({
  contractVersion: 1,
  workflow: 'prototype-to-code',
  observedAt: '2026-11-10T09:00:00Z',
  plugins: [
    { id: 'builder', required: true },
    { id: 'board', required: false },
  ],
  services: [{ id: 'prototype-versions', state: 'READABLE' }],
  resources: [{ id: 'prototype-version', required: true, count: 2 }],
})
beforeEach(() => {
  reply.data = snapshot()
  requests.length = 0
})
it('reads only the fixed trusted workflow contract and propagates observation cancellation', async () => {
  const abort = new AbortController()
  expect(await runtimeApi.scenarioWorkflowDependencies(abort.signal)).toEqual(snapshot())
  expect(requests).toEqual([
    {
      method: 'get',
      url: '/scenarios/workflows/prototype-to-code/dependencies',
      signal: abort.signal,
    },
  ])
})
it.each([
  { contractVersion: 2 },
  { workflow: 'arbitrary' },
  { observedAt: 'invalid' },
  {
    plugins: [
      { id: 'builder', required: false },
      { id: 'board', required: false },
    ],
  },
  { services: [{ id: 'prototype-versions', state: 'MISSING' }] },
  { resources: [{ id: 'prototype-version', required: true, count: -1 }] },
  { resources: [{ id: 'prototype-version', required: true, count: Number.MAX_SAFE_INTEGER + 1 }] },
])('rejects inconsistent successful HTTP evidence: %j', async (override) => {
  reply.data = { ...snapshot(), ...override }
  await expect(runtimeApi.scenarioWorkflowDependencies()).rejects.toThrow(
    'INVALID_SCENARIO_DEPENDENCY_RESPONSE',
  )
})
