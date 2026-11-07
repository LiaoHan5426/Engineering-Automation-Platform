import { expect, it, vi } from 'vite-plus/test'
import { createChatSession } from '../../../src/features/chat/chatSession'
import type { ModelConnection } from '@eap/runtime-client'

it.each(['api-key', 'chatgpt-plan'])(
  'blocks retained Git mode for %s Responses without changing draft or target',
  async (kind) => {
    const send = vi.fn()
    const open = vi.fn()
    const session = createChatSession({
      aiStatus: vi.fn(),
      openAiConversation: open,
      sendAiMessage: send,
    })
    session.connections.value = [
      {
        id: 'responses',
        kind,
        wireApi: kind === 'api-key' ? 'responses' : undefined,
      } as ModelConnection,
    ]
    session.pendingConnectionId.value = 'responses'
    session.pendingModel.value = 'chosen'
    session.draft.value = 'retain me'
    session.toolMode.value = 'git_status'
    await session.send()
    expect(send).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
    expect(session.failure.value).toBe('protocol-tools-unavailable')
    expect(session.toolMode.value).toBe('git_status')
    expect(session.pendingConnectionId.value).toBe('responses')
    expect(session.draft.value).toBe('retain me')
  },
)

it('maps a server protocol denial to an actionable failure rather than target change', async () => {
  const session = createChatSession({
    aiStatus: vi.fn(),
    openAiConversation: async () => ({ conversationId: 'c', workspaceLabel: '', memory: '' }),
    sendAiMessage: async () => {
      throw { response: { status: 409, data: { detail: 'AI_PROTOCOL_TOOLS_UNAVAILABLE' } } }
    },
  })
  await session.openConversation()
  session.draft.value = 'retain'
  await session.send()
  expect(session.failure.value).toBe('protocol-tools-unavailable')
  expect(session.draft.value).toBe('retain')
})
