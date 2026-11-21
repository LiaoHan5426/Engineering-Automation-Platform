import { expect, it } from 'vite-plus/test'
import { createMockChatBackend } from '../src/chatBackend'
import type { AiConversation, AiMessageResult, ChatGraph } from '@eap/runtime-client'

it('records successful turns in the authoritative graph and reads a branch path', async () => {
  const api = createMockChatBackend()
  const conversation = (await api.handle('POST', '/ai/conversations')).data as AiConversation
  const base = '/ai/conversations/' + conversation.conversationId

  const first = (await api.handle('POST', base + '/messages', {
    message: 'question one',
    toolMode: 'none',
  })).data as AiMessageResult
  expect(first.status).toBe('SUCCEEDED')

  const graph = (await api.handle('GET', base + '/graph')).data as ChatGraph
  expect(graph.all).toHaveLength(2)
  expect(graph.path.map((node) => node.text)).toEqual(['question one', first.answer])
  expect(graph.path[0].role).toBe('USER')
  expect(graph.path[1].role).toBe('ASSISTANT')
  expect(graph.path[1].executionId).toBe(first.executionId)
})

it('edit and regenerate append immutable sibling branches', async () => {
  const api = createMockChatBackend()
  const conversation = (await api.handle('POST', '/ai/conversations')).data as AiConversation
  const base = '/ai/conversations/' + conversation.conversationId
  await api.handle('POST', base + '/messages', { message: 'original', toolMode: 'none' })
  let graph = (await api.handle('GET', base + '/graph')).data as ChatGraph
  const question = graph.path[0]

  const edited = (await api.handle('POST', base + '/messages/edit', {
    message: 'edited',
    toolMode: 'none',
    targetNodeId: question.id,
  })).data as AiMessageResult
  expect(edited.status).toBe('SUCCEEDED')
  graph = (await api.handle('GET', base + '/graph')).data as ChatGraph
  expect(graph.all).toHaveLength(4)
  const editedRoot = graph.all.find((node) => node.text === 'edited')
  expect(editedRoot?.version).toBe(2)
  expect(graph.all.find((node) => node.id === question.id)?.text).toBe('original')

  const regenerated = (await api.handle('POST', base + '/messages/regenerate', {
    message: 'edited',
    toolMode: 'none',
    targetNodeId: editedRoot!.id,
  })).data as AiMessageResult
  expect(regenerated.status).toBe('SUCCEEDED')
  graph = (await api.handle('GET', base + '/graph')).data as ChatGraph
  const assistantsUnderEdited = graph.all.filter(
    (node) => node.role === 'ASSISTANT' && node.parentId === editedRoot!.id,
  )
  expect(assistantsUnderEdited).toHaveLength(2)
  expect(assistantsUnderEdited.map((node) => node.version).sort()).toEqual([1, 2])
})

it('rejects edit against an assistant node', async () => {
  const api = createMockChatBackend()
  const conversation = (await api.handle('POST', '/ai/conversations')).data as AiConversation
  const base = '/ai/conversations/' + conversation.conversationId
  await api.handle('POST', base + '/messages', { message: 'q', toolMode: 'none' })
  const graph = (await api.handle('GET', base + '/graph')).data as ChatGraph
  const answer = graph.path[1]
  const rejected = await api.handle('POST', base + '/messages/edit', {
    message: 'x',
    toolMode: 'none',
    targetNodeId: answer.id,
  })
  expect(rejected.status).toBe(400)
})
