import { vi } from 'vite-plus/test'
import {
  runtimeApi,
  type AiMessageResult,
  type ChatGraph,
  type ChatGraphRequest,
} from '@eap/runtime-client'
import type { ChatApi, ChatTurn } from '../../../src/features/chat/chatSession'

export function canonicalGraph(conversationId: string, turns: ChatTurn[] = []): ChatGraph {
  const graph: ChatGraph = { conversationId, revision: 0, nodes: [], operations: [] }
  for (const turn of turns) {
    if (turn.role === 'assistant' && graph.nodes.at(-1)?.role !== 'user')
      graph.nodes.push({
        id: `user-${graph.nodes.length}`,
        parentId: graph.nodes.at(-1)?.id ?? null,
        role: 'user',
        content: '',
        executionId: null,
        operationId: '',
        status: 'SUCCEEDED',
        response: null,
      })
    const id = `message-${graph.nodes.length}`
    const response: AiMessageResult | null =
      turn.role === 'assistant'
        ? { ...turn, answer: turn.text, executionId: turn.executionId ?? null }
        : null
    graph.nodes.push({
      id,
      parentId: graph.nodes.at(-1)?.id ?? null,
      role: turn.role,
      content: turn.text,
      executionId: turn.executionId ?? null,
      operationId: '',
      status: turn.status,
      response,
    })
    if (turn.role === 'assistant') {
      const user = graph.nodes.at(-2)!
      const assistant = graph.nodes.at(-1)!
      const operationId = `history-operation-${graph.operations.length}`
      const executionId = turn.executionId ?? `history-execution-${graph.operations.length}`
      user.operationId = assistant.operationId = operationId
      assistant.executionId = executionId
      if (response) response.executionId = executionId
      graph.operations.push({
        operationId,
        userMessageId: user.id,
        assistantMessageId: id,
        executionId,
        graphRevision: ++graph.revision,
      })
    }
  }
  return graph
}

/** A server-owned graph: acceptance creates identities; completion is read back via GET. */
export function graphServer(initial: ChatGraph = canonicalGraph('c1')) {
  const graphs = new Map([[initial.conversationId, initial]])
  const read = async (id: string) => structuredClone(graphs.get(id) ?? canonicalGraph(id))
  function accept(id: string, request: ChatGraphRequest) {
    const graph = graphs.get(id) ?? canonicalGraph(id)
    graphs.set(id, graph)
    const binding = {
      operationId: request.operationId,
      userMessageId: `user-${request.operationId}`,
      assistantMessageId: `assistant-${request.operationId}`,
      executionId: 'execution',
      graphRevision: ++graph.revision,
    }
    graph.operations.push(binding)
    graph.nodes.push(
      {
        id: binding.userMessageId,
        parentId: request.parentMessageId,
        role: 'user',
        content: request.message,
        operationId: request.operationId,
        executionId: null,
        status: 'SUCCEEDED',
        response: null,
      },
      {
        id: binding.assistantMessageId,
        parentId: binding.userMessageId,
        role: 'assistant',
        content: '',
        operationId: request.operationId,
        executionId: binding.executionId,
        status: 'RUNNING',
        response: null,
      },
    )
    return binding
  }
  function complete(id: string, request: ChatGraphRequest, result: AiMessageResult) {
    const graph = graphs.get(id)!
    const node = graph.nodes.find(
      (item) => item.operationId === request.operationId && item.role === 'assistant',
    )!
    node.response = result
    node.content = result.answer
    node.status = result.status
  }
  const send = vi.fn<ChatApi['sendAiMessage']>(async (id, request, options) => {
    const binding = accept(id, request)
    options?.onEvent?.({
      type: 'execution.accepted',
      conversationId: id,
      executionId: binding.executionId,
      sequence: 0,
      text: '',
      code: '',
      status: 'RUNNING',
      payload: binding,
    })
    const result: AiMessageResult = {
      answer: 'answer',
      error: '',
      status: 'SUCCEEDED',
      executionId: binding.executionId,
      approval: '',
      verification: '',
      toolEvents: [],
      artifacts: [],
      artifactError: '',
    }
    complete(id, request, result)
    return result
  })
  const api: ChatApi = {
    aiStatus: async () => ({
      state: 'disabled',
      provider: 'none',
      model: '',
      configurationRevision: '',
      lastObservedAt: null,
      errorCode: '',
      tools: { git_status: false },
      workspaceLabel: '',
    }),
    openAiConversation: async () => ({
      conversationId: initial.conversationId,
      workspaceLabel: '',
      memory: '',
    }),
    chatGraph: read,
    chatOperation: async () => {
      throw { response: { status: 404 } }
    },
    cancelAiExecution: async (_id, executionId) => ({ cancelled: true, executionId }),
    sendAiMessage: send,
  }
  return {
    api,
    send,
    read,
    accept,
    complete,
    install: () => vi.spyOn(runtimeApi, 'chatGraph').mockImplementation(read),
  }
}
