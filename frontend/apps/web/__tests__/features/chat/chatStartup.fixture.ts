import { vi } from 'vite-plus/test'
import { runtimeApi, type ChatGraph, type ChatMessageNode } from '@eap/runtime-client'
import { chatStorage } from '../../../src/features/chat/chatService'

/**
 * Test-fixture bridge: the product no longer restores transcripts from localStorage (the backend
 * graph is authoritative), but component tests pre-seed turns there to exercise display behavior.
 * This mock projects those seeded turns into a graph response so select/restore still finds them.
 */
export function mockConversationGraphFromStorage() {
  return vi.spyOn(runtimeApi, 'conversationGraph').mockImplementation(async (id: string) => {
    const raw = chatStorage(localStorage).getItem('eap.chat.history.v1')
    let turns: Array<{
      role: string
      text: string
      executionId?: string | null
      nodeId?: string
      parentId?: string | null
    }> = []
    try {
      const parsed = raw ? JSON.parse(raw) : null
      turns = parsed?.transcripts?.[id] ?? []
    } catch {
      turns = []
    }
    const all: ChatMessageNode[] = turns.map((turn, index) => ({
      id: turn.nodeId ?? `${id}-node-${index}`,
      parentId: turn.parentId ?? (index > 0 ? `${id}-node-${index - 1}` : null),
      role: turn.role === 'user' ? 'USER' : 'ASSISTANT',
      version: 1,
      text: turn.text,
      executionId: turn.executionId ?? null,
      sequence: index + 1,
      // Test-only: carry the original rich turn so evidence-display tests stay faithful.
      // The real backend never sends this field; the projection ignores it in production.
      ...({ _turn: turn } as Record<string, unknown>),
    } as ChatMessageNode))
    const graph: ChatGraph = { conversationId: id, path: all, all }
    return graph
  })
}

/** Only startup reads; each test owns conversation, send and evidence behavior. */
export function mockChatStartup() {
  // Restore seeded turns through the new authoritative graph path (see helper above).
  mockConversationGraphFromStorage()
  vi.spyOn(runtimeApi, 'aiStatus').mockResolvedValue({
    state: 'disabled',
    provider: 'none',
    model: '',
    configurationRevision: '',
    lastObservedAt: null,
    errorCode: '',
    tools: { git_status: false },
    workspaceLabel: '',
  })
  return vi.spyOn(runtimeApi, 'modelConnections').mockResolvedValue({
    effectiveDefaultId: null,
    items: [],
  })
}
