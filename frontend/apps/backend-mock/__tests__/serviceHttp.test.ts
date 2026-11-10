import { createServer, type Server } from 'node:http'
import { afterEach, expect, it } from 'vite-plus/test'
import { createChatApi } from '@eap/runtime-client'
import { createMockHandler } from '../src/handler'

let server: Server
afterEach(async () => {
  if (server)
    await new Promise<void>((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections()
    })
})
async function service() {
  server = createServer(createMockHandler())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing mock port')
  return `http://127.0.0.1:${address.port}`
}
it('serves the normal runtime contract and SSE from an independent loopback HTTP service', async () => {
  const origin = await service()
  const health = await fetch(origin + '/api/health')
  expect(health.headers.get('X-EAP-Simulation')).toBe('true')
  expect(await health.json()).toMatchObject({
    status: 'ok',
    service: 'eap-backend-mock (simulation)',
  })
  const api = createChatApi(origin + '/api')
  const conversation = await api.openAiConversation()
  const reply = await api.sendAiMessage(
    conversation.conversationId,
    'Read the selected text',
    'none',
  )
  expect(reply.status).toBe('SUCCEEDED')
  expect(reply.answer).toBeTruthy()
  const failure = await fetch(origin + '/api/not-implemented', {
    headers: { 'Accept-Language': 'en-US' },
  })
  expect(failure.status).toBe(404)
  expect(failure.headers.get('Content-Type')).toContain('application/problem+json')
  expect(await failure.json()).toMatchObject({
    status: 404,
    code: expect.any(String),
    detail: expect.any(String),
  })
  expect((await fetch(origin + '/outside-api')).status).toBe(404)
})
it('arms faults on the service and preserves UNKNOWN blocking without frontend switches or alternate status values', async () => {
  const origin = await service()
  const path = '/api/cli-programs/git/operations/git-diff/executions'
  const send = async (path: string, data: unknown) =>
    fetch(origin + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
  expect((await send('/__mock/faults', { method: 'POST', path, outcome: 'unknown' })).status).toBe(
    200,
  )
  const started = await send(path, { requestId: crypto.randomUUID() })
  expect(started.status).toBe(202)
  const record = (await started.json()) as { id: string; status: string }
  expect(record.status).toBe('UNKNOWN')
  const blocked = await send(path, { requestId: crypto.randomUUID() })
  expect(blocked.status).toBe(409)
  expect(await blocked.json()).toMatchObject({
    code: 'TOOL_EXECUTION_BLOCKED',
    execution: { id: record.id, status: 'UNKNOWN' },
  })
  const readback = await fetch(origin + path + '/' + record.id)
  expect(await readback.json()).toMatchObject({ id: record.id, status: 'UNKNOWN' })
  expect(
    (
      await send('/__mock/faults', {
        method: 'POST',
        path: 'https://example.com',
        outcome: 'success',
      })
    ).status,
  ).toBe(400)
})
