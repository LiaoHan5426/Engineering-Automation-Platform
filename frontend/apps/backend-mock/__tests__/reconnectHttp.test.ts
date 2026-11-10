import { createServer } from 'node:http'
import { expect, it } from 'vite-plus/test'
import { createChatApi } from '@eap/runtime-client'
import { createMockChatBackend } from '../src/chatBackend'

it('explicitly reconnects the same id with exact confirmation and saved workspace, binding only the explicit target in one request', async () => {
  const backend = createMockChatBackend()
  const requests: unknown[] = []
  const server = createServer(async (req, res) => {
    let raw = ''
    for await (const chunk of req) raw += chunk.toString()
    const body = raw ? JSON.parse(raw) : {}
    requests.push([req.method, req.url, body])
    const reply = await backend.handle(req.method ?? 'GET', req.url ?? '/', body)
    res.writeHead(reply.status, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(reply.data))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing port')
    const api = createChatApi(`http://127.0.0.1:${address.port}`)
    const old = await api.openAiConversation()
    const live = await api.reconnectAiConversation(
      old.conversationId,
      old.workspaceLabel,
      old.connectionId!,
      old.model!,
    )
    expect(live).toEqual({ ...old, contextReset: false, memoryCleared: false })
    await api.deleteAiConversation(old.conversationId)
    await expect(
      api.reconnectAiConversation(
        old.conversationId,
        'other-workspace',
        old.connectionId!,
        old.model!,
      ),
    ).rejects.toMatchObject({
      response: { status: 409, data: { code: 'CONVERSATION_WORKSPACE_CHANGED' } },
    })
    await expect(api.aiConversation(old.conversationId)).rejects.toMatchObject({
      response: { status: 404 },
    })
    const restored = await api.reconnectAiConversation(
      old.conversationId,
      old.workspaceLabel,
      old.connectionId!,
      old.model!,
    )
    expect(restored).toMatchObject({
      conversationId: old.conversationId,
      contextReset: true,
      connectionId: old.connectionId,
      model: old.model,
    })
    expect(await api.aiConversation(old.conversationId)).toMatchObject({
      conversationId: old.conversationId,
      connectionId: old.connectionId,
    })
    expect(requests).toContainEqual([
      'POST',
      `/ai/conversations/${old.conversationId}/reconnect`,
      {
        confirmContextReset: true,
        expectedWorkspaceLabel: old.workspaceLabel,
        connectionId: old.connectionId,
        model: old.model,
      },
    ])
    expect(
      (
        await backend.handle('POST', `/ai/conversations/${old.conversationId}/reconnect`, {
          confirmContextReset: true,
        })
      ).status,
    ).toBe(400)
    expect(
      (
        await backend.handle('POST', `/ai/conversations/${old.conversationId}/reconnect`, {
          confirmContextReset: true,
          expectedWorkspaceLabel: old.workspaceLabel,
          connectionId: old.connectionId,
          model: old.model,
          extra: true,
        })
      ).status,
    ).toBe(400)
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})
