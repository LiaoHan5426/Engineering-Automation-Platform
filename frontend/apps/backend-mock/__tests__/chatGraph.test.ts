import { expect, it } from 'vite-plus/test'
import { randomUUID } from 'node:crypto'
import { createMockChatBackend } from '../src/chatBackend'
import type { AiConversation, ChatGraph, ChatGraphRequest } from '@eap/runtime-client/contracts'
it('deduplicates operations, preserves root edits and regenerates beneath the same user', async () => {
  const backend = createMockChatBackend()
  const conversation = (await backend.handle('POST', '/ai/conversations')).data as AiConversation
  const route = '/ai/conversations/' + conversation.conversationId
  const send: ChatGraphRequest = {
    operationId: randomUUID(),
    expectedRevision: 0,
    kind: 'send',
    targetMessageId: null,
    parentMessageId: null,
    message: 'question',
    toolMode: 'none',
  }
  expect((await backend.handle('POST', route + '/messages', send)).status).toBe(200)
  expect((await backend.handle('POST', route + '/messages', send)).status).toBe(200)
  expect(
    (await backend.handle('POST', route + '/messages', { ...send, message: 'changed' })).status,
  ).toBe(409)
  let graph = (await backend.handle('GET', route + '/graph')).data as ChatGraph
  expect(graph.nodes).toHaveLength(2)
  const user = graph.nodes[0]!,
    assistant = graph.nodes[1]!
  expect(
    (
      await backend.handle('POST', route + '/messages', {
        ...send,
        operationId: randomUUID(),
        expectedRevision: graph.revision,
        kind: 'regenerate',
        targetMessageId: assistant.id,
        parentMessageId: user.id,
        message: '',
      })
    ).status,
  ).toBe(200)
  graph = (await backend.handle('GET', route + '/graph')).data as ChatGraph
  expect(graph.nodes.filter((node) => node.parentId === user.id)).toHaveLength(2)
  expect(
    (
      await backend.handle('POST', route + '/messages', {
        ...send,
        operationId: randomUUID(),
        expectedRevision: graph.revision,
        kind: 'edit',
        targetMessageId: user.id,
        message: 'edited root',
      })
    ).status,
  ).toBe(200)
  graph = (await backend.handle('GET', route + '/graph')).data as ChatGraph
  expect(graph.nodes.filter((node) => node.parentId === null)).toHaveLength(2)
  expect(graph.nodes.find((node) => node.id === user.id)?.content).toBe('question')
  expect(
    (await backend.handle('GET', route + '/operations/' + send.operationId)).data,
  ).toMatchObject({ userMessageId: user.id, assistantMessageId: assistant.id })
})
