import { describe, expect, it } from 'vite-plus/test'
import { createChatSession, type ChatApi } from '../../../src/features/chat/chatSession'
import type { AiStatus, TaskWorkingMemorySnapshot } from '@eap/runtime-client'

function status(): AiStatus {
  return {
    state: 'ready',
    provider: 'openai',
    model: 'gpt',
    configurationRevision: 'rev',
    lastObservedAt: null,
    errorCode: '',
    tools: { git_status: false },
    workspaceLabel: 'ws',
  }
}

const emptyMemory: TaskWorkingMemorySnapshot = {
  goal: '',
  constraints: [],
  facts: [],
  evidenceRefs: [],
  dependencyKeys: [],
  invalidation: '',
  updatedAt: '2026-11-07T00:00:00Z',
  layers: ['display_history', 'model_window', 'task_working', 'binding'],
}

describe('working memory session', () => {
  it('saves goal through putWorkingMemory and refreshes on recheck', async () => {
    let stored = emptyMemory
    const api = {
      aiStatus: async () => status(),
      openAiConversation: async () => ({
        conversationId: 'c1',
        workspaceLabel: 'ws',
        memory: '分层说明',
        workingMemory: emptyMemory,
      }),
      aiConversation: async () => ({
        conversationId: 'c1',
        workspaceLabel: 'ws',
        memory: '分层说明',
        workingMemory: stored,
      }),
      putWorkingMemory: async (_id, body) => {
        stored = {
          ...emptyMemory,
          goal: body.goal ?? '',
          constraints: body.constraints ?? [],
          updatedAt: '2026-11-07T01:00:00Z',
        }
        return stored
      },
      sendAiMessage: async () => {
        throw new Error('unused')
      },
    } satisfies ChatApi
    const session = createChatSession(api)
    await session.openConversation()
    expect(session.workingMemory.value?.layers).toContain('task_working')
    await session.saveWorkingMemory({ goal: '交付登录页' })
    expect(session.workingMemory.value?.goal).toBe('交付登录页')
    session.workingMemory.value = null
    await session.recheckConversation()
    expect(session.workingMemory.value?.goal).toBe('交付登录页')
  })
})
