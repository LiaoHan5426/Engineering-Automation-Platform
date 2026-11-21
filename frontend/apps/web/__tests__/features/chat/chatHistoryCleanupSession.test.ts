import { expect, it, vi } from 'vite-plus/test'
import { clearLegacyChatHistory } from '../../../src/features/chat/chatHistory'
import { createChatSession, type ChatApi } from '../../../src/features/chat/chatSession'
import type { AiStatus } from '@eap/runtime-client'

const conversation = {
  conversationId: 'new',
  workspaceLabel: 'workspace',
  memory: '',
  connectionId: 'desk',
  model: 'm',
}

it('starts with an empty session after legacy history is cleared, then keeps fresh writes', async () => {
  const data = new Map<string, string>([
    [
      'eap.chat.history.v1',
      JSON.stringify({ version: 1, items: [{ id: 'old', title: 'legacy', draft: '' }], transcripts: {} }),
    ],
  ])
  const storage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
  }
  const api: ChatApi = {
    aiStatus: vi.fn(async () => ({ state: 'available' }) as AiStatus),
    openAiConversation: vi.fn(async () => conversation),
    sendAiMessage: vi.fn(async () => ({
      executionId: '',
      answer: '',
      error: '',
      status: 'UNKNOWN',
      approval: '',
      verification: '',
      toolEvents: [],
      artifactError: '',
      artifacts: [],
    })),
  }

  // Same order as ChatWorkspace setup: clear before creating the session.
  expect(clearLegacyChatHistory(storage)).toBe(true)
  const session = createChatSession(api, storage)
  expect(session.history.value).toHaveLength(0)
  expect(session.transcripts.value).toEqual({})

  // A refresh reruns cleanup (sentinel present) but must retain this new session.
  expect(clearLegacyChatHistory(storage)).toBe(false)
  const refreshed = createChatSession(api, storage)
  expect(refreshed.history.value.some((row) => row.id === 'old')).toBe(false)
})
