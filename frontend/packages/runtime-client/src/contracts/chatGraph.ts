import type { AiMessageResult, TaskContext } from './chatModels'
import type { AiToolMode } from './aiToolMode'
import { isChatExecutionStatus } from './chatExecution'

export type ChatGraphRequest = {
  transientAttachments?: import('./chatModels').TransientAttachment[]
  operationId: string
  expectedRevision: number
  kind: 'send' | 'edit' | 'regenerate'
  parentMessageId: string | null
  targetMessageId: string | null
  message: string
  toolMode: AiToolMode
  context?: TaskContext
}
export type ChatGraphBinding = {
  operationId: string
  userMessageId: string
  assistantMessageId: string
  executionId: string
  graphRevision: number
}
export type ChatGraphOperation = ChatGraphBinding & {
  status: string
  response: AiMessageResult | null
}
export type ChatGraphNode = {
  id: string
  parentId: string | null
  role: 'user' | 'assistant'
  content: string
  attachmentRefs?: import('./chatModels').AttachmentRef[]
  executionId: string | null
  operationId: string
  status: string
  response: AiMessageResult | null
  generationId?: string | null
  observationAvailable?: boolean
}
export type ChatGraph = {
  conversationId: string
  revision: number
  nodes: ChatGraphNode[]
  operations: ChatGraphBinding[]
}
/** Reject corrupt graphs instead of projecting a partial or invented history. */
export function validateChatGraph(value: ChatGraph, conversationId: string): ChatGraph {
  if (
    !value ||
    value.conversationId !== conversationId ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !Array.isArray(value.nodes) ||
    !Array.isArray(value.operations)
  )
    throw new Error('INVALID_CHAT_GRAPH')
  const nodes = new Map(value.nodes.map((node) => [node.id, node]))
  if (nodes.size !== value.nodes.length) throw new Error('INVALID_CHAT_GRAPH')
  for (const node of value.nodes) {
    if (
      !node.id ||
      typeof node.content !== 'string' ||
      !['user', 'assistant'].includes(node.role) ||
      !isChatExecutionStatus(node.status)
    )
      throw new Error('INVALID_CHAT_GRAPH')
    if (
      node.response &&
      (!isChatExecutionStatus(node.response.status) ||
        typeof node.response.answer !== 'string' ||
        typeof node.response.error !== 'string')
    )
      throw new Error('INVALID_CHAT_GRAPH')
    const parent = node.parentId === null ? null : nodes.get(node.parentId)
    if (
      (node.parentId !== null && !parent) ||
      (parent && parent.role === node.role) ||
      (!parent && node.role !== 'user')
    )
      throw new Error('INVALID_CHAT_GRAPH')
    const seen = new Set([node.id])
    let ancestor = parent
    while (ancestor) {
      if (seen.has(ancestor.id)) throw new Error('INVALID_CHAT_GRAPH')
      seen.add(ancestor.id)
      ancestor = ancestor.parentId === null ? null : nodes.get(ancestor.parentId)
    }
  }
  return value
}
