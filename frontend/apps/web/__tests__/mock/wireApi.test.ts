import { expect, it } from 'vite-plus/test'
import type { AiConversation, ModelConnection, ModelConnectionList } from '@eap/runtime-client'
import { createMockChatBackend } from '../../mock/chatBackend'

it('validates, defaults and preserves protocol, retaining catalog on protocol-only edits', async () => {
  const api = createMockChatBackend()
  const input = { name: 'protocol', baseUrl: 'https://example.test', enabled: true }
  expect(
    (await api.handle('POST', '/ai/connections', { ...input, wireApi: 'invalid' })).status,
  ).toBe(400)
  const saved = (await api.handle('POST', '/ai/connections', input)).data as ModelConnection
  expect(saved.wireApi).toBe('chat-completions')
  const path = '/ai/connections/' + saved.id
  await api.handle('POST', path + '/models', {
    models: [{ id: 'manual', reasoningEfforts: [] }],
    allowedModels: ['manual'],
    defaultModel: 'manual',
  })
  const revision = saved.revision
  await api.handle('POST', path, { ...input, wireApi: 'responses' })
  expect(saved.wireApi).toBe('responses')
  expect(saved.revision).toBe(revision + 1)
  expect(saved.allowedModels).toEqual(['manual'])
  expect(saved.defaultModel).toBe('manual')
  await api.handle('POST', path, input)
  expect(saved.wireApi).toBe('responses')
  expect(saved.revision).toBe(revision + 1)
  expect((await api.handle('POST', path, { ...input, wireApi: null })).status).toBe(400)
})

it('exposes the effective account protocol without changing OAuth simulation', async () => {
  const api = createMockChatBackend()
  await api.handle('POST', '/ai/chatgpt/login')
  const list = (await api.handle('GET', '/ai/connections')).data as ModelConnectionList
  expect(list.items.find((item) => item.kind === 'chatgpt-plan')?.wireApi).toBe('responses')
})

it('requires explicit rebind after protocol changes and refuses Git without blocking text/code', async () => {
  const api = createMockChatBackend()
  const conversation = (await api.handle('POST', '/ai/conversations')).data as AiConversation
  const route = '/ai/conversations/' + conversation.conversationId
  const input = { name: 'mock', baseUrl: 'http://mock.local', enabled: true, wireApi: 'responses' }
  await api.handle('POST', '/ai/connections/mock-local', input)
  expect(
    (await api.handle('POST', route + '/messages', { message: 'stale', toolMode: 'none' })).status,
  ).toBe(409)
  expect(
    (
      await api.handle('POST', route + '/connection', {
        connectionId: 'mock-local',
        model: 'reasoning-demo',
      })
    ).status,
  ).toBe(409)
  const rebound = await api.handle('POST', route + '/connection', {
    connectionId: 'mock-local',
    model: 'reasoning-demo',
    confirmTargetChange: true,
  })
  expect(rebound.data).toMatchObject({ memoryCleared: true })
  expect(
    (await api.handle('POST', route + '/messages', { message: 'git', toolMode: 'git_status' }))
      .data,
  ).toMatchObject({ detail: 'AI_PROTOCOL_TOOLS_UNAVAILABLE' })
  for (const mode of ['chat', 'code'])
    expect(
      (
        await api.handle('POST', route + '/messages', {
          message: 'text',
          toolMode: 'none',
          context: { mode, approval: 'read_only' },
        })
      ).status,
    ).toBe(200)
})

it('does not allow rebind or delete while a mock turn is active', async () => {
  const api = createMockChatBackend()
  const conversation = (await api.handle('POST', '/ai/conversations')).data as AiConversation
  const route = '/ai/conversations/' + conversation.conversationId
  const active = api.handle('POST', route + '/messages', { message: 'text', toolMode: 'none' })
  const competing = [
    ['POST', '/connection'],
    ['DELETE', ''],
    ['POST', '/messages'],
  ].map(([method, suffix]) =>
    api.handle(method, route + suffix, {
      connectionId: 'mock-local',
      model: 'reasoning-demo',
      confirmTargetChange: true,
    }),
  )
  for (const response of await Promise.all(competing))
    expect(response.data).toMatchObject({ detail: 'CONVERSATION_BUSY' })
  await active
})
