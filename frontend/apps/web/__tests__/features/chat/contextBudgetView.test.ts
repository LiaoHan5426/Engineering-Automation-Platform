import { describe, expect, it } from 'vite-plus/test'
import {
  contextBudgetFromError,
  contextBudgetNoteTone,
  includedSourceSummary,
  isContextBudgetObservation,
} from '../../../src/features/chat/contextBudgetView'
import { createChatSession, type ChatApi } from '../../../src/features/chat/chatSession'
import type { AiStatus, ContextBudgetObservation } from '@eap/runtime-client'

const budget: ContextBudgetObservation = {
  platformLimit: 96000,
  outputReserve: 16384,
  inputMaterialLimit: 64000,
  usedChars: 1200,
  materialChars: 800,
  remainingChars: 78416,
  metering: 'CHAR_ESTIMATE',
  sources: [
    { source: 'system', chars: 400, metering: 'CHAR_ESTIMATE', disposition: 'included' },
    { source: 'user', chars: 800, metering: 'CHAR_ESTIMATE', disposition: 'included' },
    { source: 'files', chars: 100, metering: 'CHAR_ESTIMATE', disposition: 'detail' },
  ],
  notes: [],
}

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

describe('context budget view', () => {
  it('accepts observation shapes and summarizes included sources', () => {
    expect(isContextBudgetObservation(budget)).toBe(true)
    expect(isContextBudgetObservation({ usedChars: 1 })).toBe(false)
    expect(includedSourceSummary(budget)).toContain('system:400')
    expect(includedSourceSummary(budget)).toContain('files:100')
  })

  it('maps stable CE notes to warning badges and keeps prose neutral', () => {
    expect(contextBudgetNoteTone('COMPRESSION_NOT_ENABLED')).toBe('warning')
    expect(contextBudgetNoteTone('CHAT_MEMORY_NOT_METERED')).toBe('warning')
    expect(contextBudgetNoteTone('DERIVED_CLEARED_BEFORE_SEND')).toBe('warning')
    expect(contextBudgetNoteTone('CONTEXT_BUDGET_EXCEEDED')).toBe('danger')
    expect(contextBudgetNoteTone('mock：会话历史未精确计量，非真实 token')).toBe('neutral')
  })

  it('maps CONTEXT_BUDGET_EXCEEDED with observation on the session', async () => {
    const session = createChatSession({
      aiStatus: async () => status(),
      openAiConversation: async () => ({
        conversationId: 'c1',
        workspaceLabel: 'ws',
        memory: 'note',
      }),
      sendAiMessage: async () => {
        throw Object.assign(new Error('CONTEXT_BUDGET_EXCEEDED'), {
          response: {
            status: 400,
            data: { detail: 'CONTEXT_BUDGET_EXCEEDED', contextBudget: budget },
          },
        })
      },
    } satisfies ChatApi)
    await session.openConversation()
    session.draft.value = 'hello'
    await session.send()
    expect(session.failure.value).toBe('context-budget-exceeded')
    expect(session.lastContextBudget.value?.usedChars).toBe(1200)
    expect(contextBudgetFromError({ response: { data: { contextBudget: budget } } })?.usedChars).toBe(
      1200,
    )
  })

  it('keeps successful contextBudget on the assistant turn', async () => {
    const session = createChatSession({
      aiStatus: async () => status(),
      openAiConversation: async () => ({
        conversationId: 'c2',
        workspaceLabel: 'ws',
        memory: 'note',
      }),
      sendAiMessage: async () => ({
        executionId: 'e1',
        answer: 'ok',
        error: '',
        status: 'SUCCEEDED',
        approval: 'NOT_REQUIRED',
        verification: 'UNVERIFIED',
        toolEvents: [],
        artifactError: '',
        artifacts: [],
        contextBudget: budget,
      }),
    } satisfies ChatApi)
    await session.openConversation()
    session.draft.value = 'hi'
    await session.send()
    expect(session.failure.value).toBe('')
    expect(session.turns.value.at(-1)?.contextBudget?.remainingChars).toBe(78416)
    expect(session.lastContextBudget.value?.metering).toBe('CHAR_ESTIMATE')
  })
})
