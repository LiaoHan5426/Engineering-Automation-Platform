// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import axios from 'axios'
import { createChatApi } from '../src/index'
afterEach(() => vi.unstubAllGlobals())
import { isChatPlanSnapshot } from '../src/contracts/chatPlan'
it('uses direct snapshot/null GET and rejects cross-scope readback', async () => {
  let data: unknown = plan()
  let url = ''
  const transport = axios.create({
    adapter: async (config) => {
      url = config.url ?? ''
      return { data, status: 200, statusText: 'OK', headers: {}, config }
    },
  })
  const api = createChatApi('http://local/api', transport)
  expect(await api.chatPlan(uuid, uuid)).toEqual(plan())
  expect(url).toBe(`/ai/conversations/${uuid}/executions/${uuid}/plan`)
  data = null
  expect(await api.chatPlan(uuid, uuid)).toBeNull()
  data = { ...plan(), executionId: '22222222-2222-4222-8222-222222222222' }
  await expect(api.chatPlan(uuid, uuid)).rejects.toMatchObject({
    response: { data: { code: 'AI_RESPONSE_INVALID' } },
  })
})
it('parses plan.updated through the production stream and rejects illegal item states', async () => {
  let payload: unknown = plan()
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          [
            {
              eventId: 'accepted',
              executionId: uuid,
              conversationId: uuid,
              sequence: 0,
              type: 'accepted',
              protocolVersion: '1',
              occurredAt: '2026-11-14T12:00:00Z',
              text: '',
              code: '',
              status: 'RUNNING',
              payload: { operationId: uuid, executionId: uuid },
            },
            {
              eventId: 'e1',
              executionId: uuid,
              conversationId: uuid,
              sequence: 1,
              type: 'plan.updated',
              protocolVersion: '1',
              occurredAt: '2026-11-14T12:00:00Z',
              text: '',
              code: '',
              status: 'RUNNING',
              payload,
            },
            {
              eventId: 'e2',
              executionId: uuid,
              conversationId: uuid,
              sequence: 2,
              type: 'final',
              protocolVersion: '1',
              occurredAt: '2026-11-14T12:00:00Z',
              text: 'done',
              code: '',
              status: 'SUCCEEDED',
            },
          ]
            .map((event) => 'data: ' + JSON.stringify(event) + '\n\n')
            .join(''),
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
    ),
  )
  const onEvent = vi.fn()
  const api = createChatApi('http://local/api')
  await api.sendAiMessage(uuid, request, { onEvent })
  expect(onEvent.mock.calls.find(([event]) => event.type === 'plan.updated')?.[0]).toMatchObject({
    type: 'plan.updated',
    status: 'RUNNING',
    payload: plan(),
  })
  payload = { ...plan(), items: [{ ...plan().items[0], status: 'UNKNOWN' }] }
  await expect(api.sendAiMessage(uuid, request)).rejects.toMatchObject({
    response: { data: { code: 'AI_RESPONSE_INVALID' } },
  })
})
const uuid = '11111111-1111-4111-8111-111111111111'
const request = {
  operationId: uuid,
  expectedRevision: 0,
  kind: 'send' as const,
  parentMessageId: null,
  targetMessageId: null,
  message: 'hello',
  toolMode: 'none' as const,
}
const plan = () => ({
  schemaVersion: 1,
  planId: uuid,
  conversationId: uuid,
  executionId: uuid,
  revision: 1,
  updatedAt: '2026-11-14T12:00:00Z',
  items: [{ id: uuid, content: 'Check', status: 'pending' }],
})
it('accepts empty snapshots and Unicode budgets while rejecting illegal states/identity/revision', () => {
  expect(isChatPlanSnapshot(plan())).toBe(true)
  expect(isChatPlanSnapshot({ ...plan(), items: [] })).toBe(true)
  for (const invalid of [
    { ...plan(), revision: 0 },
    { ...plan(), executionId: 'bad' },
    { ...plan(), schemaVersion: 2 },
    { ...plan(), updatedAt: 'today' },
    { ...plan(), items: [plan().items[0], plan().items[0]] },
    { ...plan(), items: [{ ...plan().items[0], status: 'UNKNOWN' }] },
    { ...plan(), items: [{ ...plan().items[0], content: '😀'.repeat(501) }] },
    {
      ...plan(),
      items: Array.from({ length: 33 }, (_, i) => ({
        ...plan().items[0],
        id: `${String(i).padStart(8, '0')}-1111-4111-8111-111111111111`,
      })),
    },
    { ...plan(), diagnostic: 'x'.repeat(32768) },
  ])
    expect(isChatPlanSnapshot(invalid)).toBe(false)
  expect(
    isChatPlanSnapshot({ ...plan(), items: [{ ...plan().items[0], content: '😀'.repeat(500) }] }),
  ).toBe(true)
})
