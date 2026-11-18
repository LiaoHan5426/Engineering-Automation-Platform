import { randomUUID } from 'node:crypto'
import type { ChatGraph, ChatGraphOperation } from '@eap/runtime-client'
import type { ChatApi } from '../../../src/features/chat/chatSession'

type MessageApi = Omit<ChatApi, 'chatGraph' | 'chatOperation' | 'cancelAiExecution'>
/** Explicit test server authority. Nodes are created by a mutation, never by browser persistence. */
export function withChatGraph(api: MessageApi): ChatApi {
  const graphs = new Map<string, ChatGraph>()
  const graph = (id: string) => {
    if (!graphs.has(id))
      graphs.set(id, { conversationId: id, revision: 0, nodes: [], operations: [] })
    return graphs.get(id)!
  }
  const result: ChatApi = {
    ...api,
    chatGraph: async (id) => structuredClone(graph(id)),
    chatOperation: async (id, operationId) => {
      const state = graph(id)
      const binding = state.operations.find((operation) => operation.operationId === operationId)
      if (!binding) throw { response: { status: 404 } }
      const node = state.nodes.find((node) => node.id === binding.assistantMessageId)!
      return {
        ...binding,
        status: node.status,
        response: node.response,
      } satisfies ChatGraphOperation
    },
    cancelAiExecution: async (_id, executionId) => ({ cancelled: true, executionId }),
    sendAiMessage: async (id, request, options) => {
      const state = graph(id)
      const userId = request.kind === 'regenerate' ? request.parentMessageId! : randomUUID()
      const assistantId = randomUUID()
      const executionId = 'run'
      if (request.kind !== 'regenerate')
        state.nodes.push({
          id: userId,
          parentId: request.parentMessageId,
          role: 'user',
          content: request.message,
          operationId: request.operationId,
          executionId,
          status: 'SUCCEEDED',
          response: null,
          attachmentRefs: request.context?.attachmentRefs,
        })
      state.nodes.push({
        id: assistantId,
        parentId: userId,
        role: 'assistant',
        content: '',
        operationId: request.operationId,
        executionId,
        status: 'RUNNING',
        response: null,
      })
      const binding = {
        operationId: request.operationId,
        userMessageId: userId,
        assistantMessageId: assistantId,
        executionId,
        graphRevision: ++state.revision,
      }
      state.operations.push(binding)
      options?.onEvent?.({
        eventId: `${executionId}:0`,
        sequence: 0,
        conversationId: id,
        executionId,
        type: 'accepted',
        protocolVersion: '1',
        occurredAt: '2026-01-01T00:00:00Z',
        text: '',
        code: '',
        status: 'RUNNING',
        payload: binding,
      })
      const result = await api.sendAiMessage(id, request, options)
      const node = state.nodes.find((node) => node.id === assistantId)!
      node.content = result.answer
      node.status = result.status
      node.response = result
      return result
    },
  }
  const owned = new Set<PropertyKey>([
    'chatGraph',
    'chatOperation',
    'cancelAiExecution',
    'sendAiMessage',
  ])
  return new Proxy(result, {
    get: (target, key, receiver) =>
      owned.has(key) ? Reflect.get(target, key, receiver) : Reflect.get(api, key, receiver),
  })
}
