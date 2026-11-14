// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import {
  ChatExecutionStatus,
  runtimeApi,
  type AiMessageResult,
  type ModelConnection,
} from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import ChatWorkspace from '../../../src/features/chat/ChatWorkspace.vue'
import { chatBinding, workbench } from '../../../src/features/shell/workbench'
import { chatStorage } from '../../../src/features/chat/chatService'
import type { ChatTurn } from '../../../src/features/chat/chatSession'
import { mockChatStartup } from './chatStartup.fixture'

let app: App, host: HTMLDivElement
const originalLocale = i18n.global.locale.value
const originalWorkMode = workbench.workMode
function answer(status: ChatTurn['status'], text = '', error = ''): ChatTurn {
  return {
    role: 'assistant',
    text,
    error,
    status,
    approval: '',
    verification: '',
    toolEvents: [],
    artifactError: '',
    artifacts: [],
  }
}
afterEach(() => {
  app?.unmount()
  host?.remove()
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  chatBinding.value = null
  workbench.sessionExtras = {}
  workbench.workMode = originalWorkMode
  i18n.global.locale.value = originalLocale
})
async function mount(turns: ChatTurn[] = []) {
  workbench.executionMode = 'chat'
  workbench.workMode = 'code'
  workbench.pendingBoardDraft = null
  workbench.sessionExtras = {}
  chatStorage(localStorage).setItem(
    'eap.chat.history.v1',
    JSON.stringify({
      version: 1,
      activeId: 'answer-state',
      items: [
        {
          id: 'answer-state',
          title: 'Answer state',
          draft: 'Question',
          archived: false,
          connectionId: 'mock',
          model: 'm',
        },
      ],
      transcripts: { 'answer-state': turns },
    }),
  )
  mockChatStartup().mockResolvedValue({
    effectiveDefaultId: 'mock',
    items: [
      {
        id: 'mock',
        name: 'Mock',
        enabled: true,
        kind: 'api-key',
        baseUrl: 'http://mock.local',
        defaultModel: 'm',
        models: [{ id: 'm', reasoningEfforts: [] }],
        allowedModels: ['m'],
        discoveredAt: '',
        discoveryError: '',
        secretPresent: false,
        revision: 1,
        defaultSelected: true,
        configurationRevision: 'r',
      } satisfies ModelConnection,
    ],
  })
  vi.spyOn(runtimeApi, 'aiConversation').mockResolvedValue({
    conversationId: 'answer-state',
    connectionId: 'mock',
    model: 'm',
    workspaceLabel: '',
    memory: '',
  })
  host = document.createElement('div')
  document.body.append(host)
  app = createApp(ChatWorkspace)
  app.use(i18n).mount(host)
  await vi.waitFor(() => expect(chatBinding.value?.draft).toBe('Question'))
  await nextTick()
}
const bubbles = () => Array.from(host.querySelectorAll('.turn-assistant'))
it.each([
  ['zh-CN', 'Final answer'],
  ['en-US', 'Final answer'],
  ['zh-CN', ''],
  ['en-US', ''],
] as const)(
  'shows waiting only for the live empty turn, then real text and the final outcome (%s, %s)',
  async (locale, finalAnswer) => {
    i18n.global.locale.value = locale
    let finish!: (result: AiMessageResult) => void
    let stream!: NonNullable<Parameters<typeof runtimeApi.sendAiMessage>[4]>['onEvent']
    const send = vi
      .spyOn(runtimeApi, 'sendAiMessage')
      .mockImplementation((_id, _text, _mode, _context, options) => {
        stream = options!.onEvent
        return new Promise((resolve) => {
          finish = resolve
        })
      })
    await mount([
      { ...answer(ChatExecutionStatus.SUCCEEDED, 'Earlier question'), role: 'user' },
      answer(ChatExecutionStatus.RUNNING),
    ])
    expect(chatBinding.value?.sending).toBe(false)
    expect(chatBinding.value?.latestExecution).toMatchObject({
      conversationId: 'answer-state',
      status: ChatExecutionStatus.RUNNING,
      executionId: null,
      observing: false,
    })
    expect(bubbles()[0]!.textContent).toContain(i18n.global.t('chat.noAnswer'))
    expect(bubbles()[0]!.textContent).not.toContain(i18n.global.t('chat.waitingForAnswer'))
    ;(host.querySelector('[data-testid=send-message]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    await nextTick()
    expect(chatBinding.value?.sending).toBe(true)
    expect(chatBinding.value?.latestExecution).toMatchObject({ executionId: null, observing: true })
    expect(bubbles()[0]!.textContent).toContain(i18n.global.t('chat.noAnswer'))
    expect(bubbles()[0]!.textContent).not.toContain(i18n.global.t('chat.waitingForAnswer'))
    expect(bubbles()[1]!.textContent).toContain(i18n.global.t('chat.waitingForAnswer'))
    expect(bubbles()[1]!.textContent).not.toContain(i18n.global.t('chat.noAnswer'))
    stream!({
      sequence: 1,
      executionId: 'execution',
      type: 'answer.delta',
      text: 'Partial answer',
      code: '',
      status: ChatExecutionStatus.RUNNING,
    })
    await nextTick()
    expect(chatBinding.value?.latestExecution).toMatchObject({
      executionId: 'execution',
      status: ChatExecutionStatus.RUNNING,
      observing: true,
    })
    expect(bubbles()[1]!.textContent).toContain('Partial answer')
    expect(bubbles()[1]!.textContent).not.toContain(i18n.global.t('chat.waitingForAnswer'))
    finish({
      executionId: 'execution',
      answer: finalAnswer,
      error: '',
      status: ChatExecutionStatus.SUCCEEDED,
      approval: '',
      verification: '',
      toolEvents: [],
      artifactError: '',
      artifacts: [],
    })
    await vi.waitFor(() =>
      expect(bubbles()[1]!.textContent).toContain(finalAnswer || i18n.global.t('chat.noAnswer')),
    )
    expect(bubbles()[1]!.textContent).not.toContain(i18n.global.t('chat.waitingForAnswer'))
    expect(bubbles()[0]!.textContent).toContain(i18n.global.t('chat.noAnswer'))
    expect(chatBinding.value?.latestExecution).toMatchObject({
      executionId: 'execution',
      status: ChatExecutionStatus.SUCCEEDED,
      observing: false,
    })
  },
)
it('keeps finished empty, failed and cancelled turns out of the waiting state', async () => {
  const send = vi.spyOn(runtimeApi, 'sendAiMessage')
  await mount([
    answer(ChatExecutionStatus.SUCCEEDED),
    answer(ChatExecutionStatus.FAILED, '', 'MODEL_CALL_FAILED'),
    answer(ChatExecutionStatus.CANCELLED, '', 'CANCELLED'),
    answer(ChatExecutionStatus.CANCELLED, 'Partial text retained', 'CANCELLED'),
  ])
  expect(bubbles()).toHaveLength(4)
  for (const bubble of bubbles().slice(0, 3)) {
    expect(bubble.textContent).toContain(i18n.global.t('chat.noAnswer'))
    expect(bubble.textContent).not.toContain(i18n.global.t('chat.waitingForAnswer'))
  }
  expect(bubbles()[1]!.textContent).toContain('MODEL_CALL_FAILED')
  expect(bubbles()[2]!.textContent).toContain('CANCELLED')
  expect(bubbles()[3]!.textContent).toContain('Partial text retained')
  expect(bubbles()[3]!.textContent).toContain('CANCELLED')
  expect(bubbles()[3]!.textContent).not.toContain(i18n.global.t('chat.noAnswer'))
  expect(send).not.toHaveBeenCalled()
})
