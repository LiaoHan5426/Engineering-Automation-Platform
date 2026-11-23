// @vitest-environment happy-dom
/** F3: merged ChatWorkspace facet tests that share mockChatStartup. */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
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

describe('ChatWorkspace / answerState', () => {
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
      expect(bubbles()[0]!.textContent).toContain(i18n.global.t('chat.noAnswer'))
      expect(bubbles()[0]!.textContent).not.toContain(i18n.global.t('chat.waitingForAnswer'))
      ;(host.querySelector('[data-testid=send-message]') as HTMLButtonElement).click()
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
      await nextTick()
      expect(chatBinding.value?.sending).toBe(true)
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

})

describe('ChatWorkspace / knowledge', () => {
  let app: App, host: HTMLDivElement
  afterEach(() => {
    app?.unmount()
    host?.remove()
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    workbench.sessionExtras = {}
    chatBinding.value = null
    i18n.global.locale.value = 'zh-CN'
  })
  function button(id: string) {
    const value = document.querySelector<HTMLButtonElement>(`[data-testid=${id}]`)
    expect(value, id).not.toBeNull()
    return value!
  }
  it('replays nullable server knowledgeContext without a knowledge evidence section', async () => {
    chatStorage(localStorage).setItem(
      'eap.chat.history.v1',
      JSON.stringify({
        version: 1,
        activeId: 'c1',
        items: [
          {
            id: 'c1',
            title: 'plain chat',
            archived: false,
            draft: '',
            workspaceLabel: '',
            memory: '',
          },
        ],
        transcripts: {
          c1: [
            {
              role: 'assistant',
              text: 'ordinary answer',
              error: '',
              status: 'SUCCEEDED',
              approval: '',
              verification: '',
              toolEvents: [],
              artifactError: '',
              artifacts: [],
              knowledgeContext: null,
              knowledgeMemoryCleared: false,
            },
          ],
        },
      }),
    )
    mockChatStartup()
    vi.spyOn(runtimeApi, 'aiConversation').mockResolvedValue({
      workspaceLabel: '',
      memory: '',
    } as never)
    host = document.createElement('div')
    document.body.append(host)
    app = createApp(ChatWorkspace)
    app.use(i18n).mount(host)
    await vi.waitFor(() => expect(host.textContent).toContain('ordinary answer'))
    expect(host.querySelector('[data-testid=turn-knowledge]')).toBeNull()
    expect(host.textContent).not.toContain('不是持久会话保证')
  })
  it('shows a rejected send memory notice only when the originating session is active', async () => {
    workbench.executionMode = 'chat'
    workbench.sessionExtras = {}
    chatStorage(localStorage).setItem(
      'eap.chat.history.v1',
      JSON.stringify({
        version: 1,
        activeId: 'c1',
        items: ['c1', 'c2'].map((id) => ({
          id,
          title: id,
          archived: false,
          updatedAt: '',
          draft: id === 'c1' ? 'keep draft' : 'other draft',
          workspaceLabel: '',
          memory: '',
          connectionId: null,
          context: { mode: 'chat', knowledgeExpertRef: { id: 'saved', revision: 4 } },
        })),
        transcripts: { c1: [], c2: [] },
      }),
    )
    mockChatStartup().mockResolvedValue({
      effectiveDefaultId: 'mock-local',
      items: [
        {
          id: 'mock-local',
          name: 'Test model',
          kind: 'mock',
          enabled: true,
          models: [{ id: 'reasoning-demo', reasoningEfforts: [] }],
          allowedModels: ['reasoning-demo'],
          defaultModel: 'reasoning-demo',
        },
      ],
    } as never)
    vi.spyOn(runtimeApi, 'aiConversation').mockResolvedValue({
      workspaceLabel: '',
      memory: '',
      connectionId: 'mock-local',
      model: 'reasoning-demo',
    } as never)
    let reject!: (reason: unknown) => void
    const send = vi.spyOn(runtimeApi, 'sendAiMessage').mockImplementation(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail
        }),
    )
    host = document.createElement('div')
    document.body.append(host)
    app = createApp(ChatWorkspace)
    app.use(i18n).mount(host)
    await vi.waitFor(() => expect(chatBinding.value?.draft).toBe('keep draft'))
    button('send-message').click()
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    chatBinding.value!.select('c2')
    await nextTick()
    reject({
      response: {
        status: 409,
        data: { code: 'EXPERT_CONTEXT_STALE', knowledgeMemoryCleared: true },
      },
    })
    await vi.waitFor(() => expect(chatBinding.value?.sending).toBe(false))
    await nextTick()
    expect(host.textContent).not.toContain('不是持久会话保证')
    expect(chatBinding.value?.draft).toBe('other draft')
    chatBinding.value!.select('c1')
    await vi.waitFor(() => expect(host.textContent).toContain('不是持久会话保证'))
    expect(chatBinding.value?.draft).toBe('keep draft')
    expect(host.querySelector('[data-testid=turn-knowledge]')).toBeNull()
  })
  it.each([
    ['zh-CN', ''],
    ['zh-CN', 'MODEL_CALL_FAILED'],
    ['en-US', ''],
    ['en-US', 'MODEL_CALL_FAILED'],
  ] as const)(
    'renders retrieved material without claiming provider delivery or citation (%s, %s)',
    async (locale, error) => {
      i18n.global.locale.value = locale
      localStorage.clear()
      sessionStorage.clear()
      workbench.executionMode = 'chat'
      workbench.sessionExtras = {}
      mockChatStartup().mockResolvedValue({
        effectiveDefaultId: 'mock-local',
        items: [
          {
            id: 'mock-local',
            name: 'Test model',
            kind: 'mock',
            enabled: true,
            models: [{ id: 'reasoning-demo', reasoningEfforts: [] }],
            allowedModels: ['reasoning-demo'],
            defaultModel: 'reasoning-demo',
          },
        ],
      } as never)
      vi.spyOn(runtimeApi, 'openAiConversation').mockResolvedValue({
        conversationId: 'c1',
        workspaceLabel: '',
        memory: '',
        connectionId: 'mock-local',
        model: 'reasoning-demo',
      })
      vi.spyOn(runtimeApi, 'assignConversationConnection').mockResolvedValue({
        connectionId: 'mock-local',
        memoryCleared: false,
        connectionName: 'test',
        model: 'reasoning-demo',
      } as never)
      vi.spyOn(runtimeApi, 'experts').mockResolvedValue({
        items: [JSON.stringify({ id: 'saved', name: 'Saved' })],
        states: { saved: { enabled: true, builtin: false, revision: 4 } },
      })
      vi.spyOn(runtimeApi, 'aiConversation').mockResolvedValue({
        conversationId: 'c1',
        workspaceLabel: '',
        memory: '',
        connectionId: 'mock-local',
        model: 'reasoning-demo',
      })
      const expertRef = { id: 'saved', revision: 4 }
      const preview = vi
        .spyOn(runtimeApi, 'previewExpertContext')
        .mockResolvedValue({ expertRef, status: 'no_matches', references: [] })
      const send = vi.spyOn(runtimeApi, 'sendAiMessage').mockResolvedValue({
        answer: error ? '' : 'answer',
        error,
        status: error ? 'FAILED' : 'SUCCEEDED',
        executionId: null,
        approval: '',
        verification: '',
        toolEvents: [],
        artifacts: [],
        artifactError: '',
        knowledgeMemoryCleared: true,
        knowledgeContext: {
          expertRef,
          status: 'ready',
          references: [
            {
              id: 'K9',
              source: 'Server source',
              knowledgeBase: 'Actual scope',
              excerpt: 'server-only excerpt',
              retrievalMode: 'keyword',
            },
          ],
        },
      })
      host = document.createElement('div')
      document.body.append(host)
      app = createApp(ChatWorkspace)
      app.use(i18n).mount(host)
      await vi.waitFor(() => expect(host.querySelector('.composer-draft')).not.toBeNull())
      const draft = host.querySelector('.composer-draft') as HTMLTextAreaElement
      draft.value = 'original question'
      draft.dispatchEvent(new Event('input', { bubbles: true }))
      await nextTick()
      button('composer-add').click()
      await nextTick()
      button('composer-cat-experts').click()
      await nextTick()
      button('knowledge-open').click()
      await vi.waitFor(() =>
        expect(document.querySelector('[data-testid=knowledge-candidate-saved]')).not.toBeNull(),
      )
      button('knowledge-candidate-saved').click()
      await nextTick()
      button('knowledge-preview').click()
      await vi.waitFor(() =>
        expect(document.querySelector('[data-testid=knowledge-preview-result]')).not.toBeNull(),
      )
      expect(preview).toHaveBeenCalledWith(expertRef, 'original question')
      button('knowledge-use').click()
      await nextTick()
      expect(send).not.toHaveBeenCalled()
      button('send-message').click()
      await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
      expect(send.mock.calls[0]?.[3]?.knowledgeExpertRef).toEqual(expertRef)
      await vi.waitFor(() => expect(host.textContent).toContain('server-only excerpt'))
      expect(host.textContent).toContain(
        locale === 'zh-CN' ? '已检索 / 准备' : 'retrieved / prepared',
      )
      expect(host.textContent).toContain(
        locale === 'zh-CN'
          ? '不证明已发送给模型提供方或被模型引用'
          : 'not proof of delivery to the model provider or model citation',
      )
      expect(host.textContent).not.toContain(
        locale === 'zh-CN' ? '已提供给模型' : 'provided to the model',
      )
      expect(host.textContent).toContain(
        locale === 'zh-CN' ? '不是持久会话保证' : 'not a durable session guarantee',
      )
    },
  )

})

describe('ChatWorkspace / reconnect', () => {
  let app: App, host: HTMLDivElement
  async function flush() {
    for (let i = 0; i < 12; i++) await nextTick()
  }
  afterEach(() => {
    app?.unmount()
    host?.remove()
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    chatBinding.value = null
    workbench.sessionExtras = {}
    workbench.executionMode = 'chat'
    workbench.panel = null
  })
  async function mount(draft = 'retry this', mismatch = false) {
    chatStorage(localStorage).setItem(
      'eap.chat.history.v1',
      JSON.stringify({
        version: 1,
        activeId: 'old',
        items: [
          {
            id: 'old',
            title: 'Keep history',
            draft,
            archived: false,
            workspaceLabel: 'saved-ws',
            memory: 'memory',
            connectionId: 'desk',
            model: 'm',
            context: {
              instructions: 'Original instruction',
              files: [{ name: 'keep.md', content: 'attachment' }],
            },
          },
        ],
        transcripts: { old: [] },
      }),
    )
    mockChatStartup().mockResolvedValue({
      effectiveDefaultId: 'desk',
      items: [
        {
          id: 'desk',
          name: 'Desk',
          enabled: true,
          kind: 'api-key',
          baseUrl: 'http://mock.local',
          defaultModel: 'm',
          discoveredAt: '',
          discoveryError: '',
          secretPresent: false,
          revision: 1,
          defaultSelected: true,
          configurationRevision: 'r',
          models: [{ id: 'm', reasoningEfforts: [] }],
          allowedModels: ['m'],
        } satisfies ModelConnection,
      ],
    })
    vi.spyOn(runtimeApi, 'aiConversation').mockRejectedValue({ response: { status: 404 } })
    const reconnect = vi.spyOn(runtimeApi, 'reconnectAiConversation')
    if (mismatch)
      reconnect.mockRejectedValue({
        response: { status: 409, data: { code: 'CONVERSATION_WORKSPACE_CHANGED' } },
      })
    else
      reconnect.mockResolvedValue({
        conversationId: 'old',
        workspaceLabel: 'saved-ws',
        memory: '',
        connectionId: 'desk',
        model: 'm',
        contextReset: true,
        memoryCleared: false,
      })
    const assign = vi.spyOn(runtimeApi, 'assignConversationConnection').mockResolvedValue({
      conversationId: 'old',
      connectionId: 'desk',
      model: 'm',
      connectionName: 'Desk',
      endpoint: 'http://mock.local',
      revision: 1,
      memoryCleared: false,
    })
    const send = vi.spyOn(runtimeApi, 'sendAiMessage').mockResolvedValue({
      executionId: 'e',
      answer: 'ok',
      error: '',
      status: 'SUCCEEDED',
      approval: '',
      verification: '',
      toolEvents: [],
      artifactError: '',
      artifacts: [],
    })
    workbench.executionMode = 'chat'
    workbench.sessionExtras.old = {
      projectId: 'project',
      scenarioId: null,
      experts: [],
      resources: [],
      executionMode: 'chat',
    }
    host = document.createElement('div')
    document.body.append(host)
    app = createApp(ChatWorkspace)
    app.use(i18n).mount(host)
    await vi.waitFor(() =>
      expect(host.querySelector('[data-testid="reconnect-session"]')).not.toBeNull(),
    )
    await flush()
    return { reconnect, assign, send }
  }
  function click(selector: string) {
    ;(document.querySelector(selector) as HTMLButtonElement).click()
  }

  it('requires a visible confirmation before reconnect and sends the preserved draft exactly once through the usual task flow', async () => {
    const { reconnect, assign, send } = await mount()
    expect((host.querySelector('textarea.composer-draft') as HTMLTextAreaElement).disabled).toBe(
      false,
    )
    workbench.sessionExtras.old.experts = [
      {
        id: 'expert',
        name: 'Expert',
        category: '',
        version: '1',
        resources: '',
        guidance: 'Preserve expert guidance',
        mine: true,
      },
    ]
    workbench.panel = 'summary'
    await flush()
    const feed = host.querySelector('[data-testid="chat-feed"]') as HTMLElement
    feed.scrollTop = 97
    click('[data-testid="reconnect-session"]')
    await flush()
    expect(reconnect).not.toHaveBeenCalled()
    expect(document.querySelector('.eap-confirm')?.textContent).toContain('服务端模型上下文')
    expect(document.querySelector('.eap-confirm')?.textContent).toContain('不会自动重放')
    click('[data-confirm-cancel]')
    await flush()
    expect(reconnect).not.toHaveBeenCalled()
    click('[data-testid="reconnect-session"]')
    await flush()
    click('.eap-confirm__actions button')
    click('.eap-confirm__actions button')
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    expect(reconnect).toHaveBeenCalledExactlyOnceWith('old', 'saved-ws', 'desk', 'm')
    expect(assign).not.toHaveBeenCalled()
    expect(send).toHaveBeenCalledWith(
      'old',
      'retry this',
      'none',
      expect.objectContaining({
        instructions: expect.stringContaining('Preserve expert guidance'),
        files: [{ name: 'keep.md', content: 'attachment' }],
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal), onEvent: expect.any(Function) }),
    )
    expect(send.mock.calls[0][3]?.instructions).toContain('Original instruction')
    expect(workbench.panel).toBe('summary')
    expect(feed.scrollTop).toBe(97)
    expect(chatBinding.value?.activeId).toBe('old')
    expect(chatBinding.value?.history).toHaveLength(1)
    expect(workbench.sessionExtras.old.projectId).toBe('project')
  })

  it('does not offer ordinary retry after a message failure confirms server expiry', async () => {
    const { send } = await mount()
    vi.mocked(runtimeApi.aiConversation).mockResolvedValueOnce({
      conversationId: 'old',
      workspaceLabel: 'saved-ws',
      memory: '',
      connectionId: 'desk',
      model: 'm',
    })
    click('[data-testid="recheck-session"]')
    await vi.waitFor(() => expect(host.querySelector('[data-testid="reconnect-session"]')).toBeNull())
    send.mockRejectedValueOnce({ response: { status: 404 } })
    click('[data-testid="send-message"]')
    await vi.waitFor(() =>
      expect(host.querySelector('[data-testid="reconnect-session"]')).not.toBeNull(),
    )
    expect(host.querySelector('[data-testid="retry-send"]')).toBeNull()
    expect((host.querySelector('[data-testid="ribbon-retry"]') as HTMLButtonElement).disabled).toBe(
      true,
    )
  })

  it('does not restore the old task context into a new selection when reconnect retry finishes in the background', async () => {
    const { send } = await mount()
    let finish!: (value: Awaited<ReturnType<typeof runtimeApi.sendAiMessage>>) => void
    send.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    click('[data-testid="reconnect-session"]')
    await flush()
    click('.eap-confirm__actions button')
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    chatBinding.value!.create()
    await flush()
    expect(chatBinding.value?.activeId).toBeNull()
    finish({
      executionId: 'e',
      answer: 'ok',
      error: '',
      status: 'SUCCEEDED',
      approval: '',
      verification: '',
      toolEvents: [],
      artifactError: '',
      artifacts: [],
    })
    await flush()
    expect(host.querySelector('[data-testid="outgoing-preview"]')?.textContent).not.toContain(
      'Original instruction',
    )
  })

  it('offers reconnect-only for an empty draft and never sends', async () => {
    const { reconnect, send } = await mount('')
    expect(host.querySelector('[data-testid="reconnect-session"]')?.textContent).toBe('重新连接')
    click('[data-testid="reconnect-session"]')
    await flush()
    click('.eap-confirm__actions button')
    await vi.waitFor(() => expect(reconnect).toHaveBeenCalledTimes(1))
    await flush()
    expect(send).not.toHaveBeenCalled()
  })

  it('shows actionable different-workspace denial and keeps the editable local draft', async () => {
    const { send } = await mount('keep draft', true)
    click('[data-testid="reconnect-session"]')
    await flush()
    click('.eap-confirm__actions button')
    await vi.waitFor(() =>
      expect(host.querySelector('[data-testid="reconnect-error"]')?.textContent).toContain(
        '不同工作区',
      ),
    )
    expect(send).not.toHaveBeenCalled()
    expect((host.querySelector('textarea.composer-draft') as HTMLTextAreaElement).value).toBe(
      'keep draft',
    )
    expect(host.textContent).toContain('切回原工作区')
    expect(host.textContent).not.toContain(i18n.global.t('desktop.retrySame'))
  })

})

describe('ChatWorkspace / skill', () => {
  let app: App, host: HTMLDivElement
  afterEach(() => {
    app?.unmount()
    host?.remove()
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    chatBinding.value = null
    workbench.sessionExtras = {}
  })
  it('replays server-prepared Skill evidence as escaped text and one unified memory notice', async () => {
    const skillRef = { id: 'guide', version: '1.0.0', digest: 'a'.repeat(64), stateRevision: 2 }
    chatStorage(localStorage).setItem(
      'eap.chat.history.v1',
      JSON.stringify({
        version: 1,
        activeId: 'c1',
        items: [
          {
            id: 'c1',
            title: 'chat',
            draft: '',
            archived: false,
            workspaceLabel: '',
            memory: '',
            contextMemoryCleared: true,
            knowledgeMemoryCleared: true,
          },
        ],
        transcripts: {
          c1: [
            {
              role: 'assistant',
              text: 'answer',
              error: '',
              status: 'FAILED',
              approval: '',
              verification: '',
              toolEvents: [],
              artifacts: [],
              artifactError: '',
              skillContext: {
                skillRef,
                instructions: '<script>prepared only</script>',
                resources: [
                  { path: 'guide.txt', mediaType: 'text/plain', content: 'explicit resource' },
                ],
                dependencies: [],
              },
              contextMemoryCleared: true,
              knowledgeMemoryCleared: true,
            },
          ],
        },
      }),
    )
    mockChatStartup()
    vi.spyOn(runtimeApi, 'aiConversation').mockResolvedValue({
      workspaceLabel: '',
      memory: '',
    } as never)
    host = document.createElement('div')
    document.body.append(host)
    app = createApp(ChatWorkspace)
    app.use(i18n).mount(host)
    await vi.waitFor(() => expect(host.querySelector('[data-testid=turn-skill]')).not.toBeNull())
    expect(host.textContent).toContain('不证明模型收到或采用')
    expect(host.textContent).toContain('explicit resource')
    expect(host.querySelector('[data-testid=turn-skill] script')).toBeNull()
    expect(host.querySelectorAll('[data-testid=context-cleared]')).toHaveLength(1)
    expect(host.textContent).not.toContain('不是持久会话保证')
  })

})

describe('ChatWorkspace / task', () => {
  let app: App, host: HTMLDivElement
  afterEach(() => {
    app?.unmount()
    host?.remove()
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    workbench.pendingBoardDraft = null
    workbench.sessionExtras = {}
    chatBinding.value = null
  })
  it('requires explicit adoption and cancels without consuming or overwriting; adoption replaces the task context as a unit', async () => {
    localStorage.clear()
    sessionStorage.clear()
    mockChatStartup()
    const send = vi.spyOn(runtimeApi, 'sendAiMessage'),
      create = vi.spyOn(runtimeApi, 'openAiConversation')
    host = document.createElement('div')
    document.body.append(host)
    app = createApp(ChatWorkspace)
    app.use(i18n).mount(host)
    await vi.waitFor(() => expect(host.querySelector('.composer-draft')).not.toBeNull())
    const input = host.querySelector('.composer-draft') as HTMLTextAreaElement
    input.value = 'Existing unsent draft'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    workbench.sessionExtras.scratch = {
      scenarioId: 'old-scene',
      experts: [],
      resources: ['old-resource'],
      projectId: 'other-project',
      delivery: { versionId: 'old-design', pagePath: 'old.vue', pageLabel: 'old' },
    }
    const taskRef = {
      projectId: 'new-project',
      taskId: '12345678-1234-1234-1234-123456789abc',
      revision: 3,
    }
    workbench.pendingBoardDraft = {
      executionMode: 'chat',
      sessionId: '',
      title: 'New saved task',
      taskRef,
      prototypeVersionId: '',
    }
    await nextTick()
    expect(host.querySelector('[data-testid=board-draft-note]')?.textContent).toBe(
      i18n.global.t('generation.pendingTask'),
    )
    expect(input.value).toBe('Existing unsent draft')
    expect(workbench.pendingBoardDraft).not.toBeNull()
    ;(host.querySelector('[data-testid=adopt-board-draft]') as HTMLButtonElement).click()
    await nextTick()
    ;(document.querySelector('[data-confirm-cancel]') as HTMLButtonElement).click()
    await nextTick()
    expect(input.value).toBe('Existing unsent draft')
    expect(workbench.pendingBoardDraft?.taskRef).toEqual(taskRef)
    ;(host.querySelector('[data-testid=adopt-board-draft]') as HTMLButtonElement).click()
    await nextTick()
    ;(document.querySelector('.eap-confirm__actions button') as HTMLButtonElement).click()
    await nextTick()
    expect(input.value).toBe('New saved task')
    expect(workbench.pendingBoardDraft).toBeNull()
    expect(host.querySelector('[data-testid=composer-task-binding]')?.textContent).toContain(
      taskRef.taskId,
    )
    expect((host.querySelector('[data-testid=generation-target]') as HTMLInputElement).value).toBe('')
    expect(workbench.sessionExtras.scratch).toMatchObject({
      projectId: 'new-project',
      scenarioId: null,
      resources: [],
      experts: [],
    })
    expect(workbench.sessionExtras.scratch?.delivery).toBeUndefined()
    expect(send).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

})

describe('ChatWorkspace / toolbar', () => {
  let app: App | undefined
  let host: HTMLDivElement | undefined
  afterEach(() => {
    app?.unmount()
    host?.remove()
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    workbench.panel = null
    workbench.sessionPanels = {}
    workbench.sessionExtras = {}
    chatBinding.value = null
  })

  async function mount() {
    localStorage.clear()
    sessionStorage.clear()
    workbench.panel = null
    workbench.sessionPanels = {}
    mockChatStartup()
    vi.spyOn(runtimeApi, 'workspaceFiles').mockResolvedValue({
      path: '',
      entries: [],
      denial: '',
      truncated: false,
    })
    host = document.createElement('div')
    document.body.append(host)
    app = createApp(ChatWorkspace)
    app.use(i18n).mount(host)
    await vi.waitFor(() => expect(host!.querySelector('.composer-draft')).not.toBeNull())
    const draft = host.querySelector<HTMLTextAreaElement>('.composer-draft')!
    draft.value = 'Keep this unsent draft'
    draft.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    return draft
  }

  async function click(id: string) {
    const button = document.querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)
    expect(button).not.toBeNull()
    button!.click()
    await nextTick()
  }

  it('exposes one complete source browser and preserves the draft when closing it', async () => {
    const draft = await mount()
    expect(host!.querySelector('[data-testid="open-workspace-tree"]')).toBeNull()
    expect(host!.querySelectorAll('[data-testid="open-files"]')).toHaveLength(1)
    await click('open-files')
    await vi.waitFor(() => expect(document.querySelector('.repository-browser')).not.toBeNull())
    expect(workbench.panel).toBe('files')
    expect(document.querySelector('[data-testid="files-local-uploads"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="files-design-version"]')).not.toBeNull()
    expect(document.querySelector('[data-testid="workspace-tree-rail"]')).toBeNull()
    await click('close-files')
    expect(workbench.panel).toBeNull()
    expect(document.querySelector('[data-testid="files-overlay"]')).toBeNull()
    expect(draft.value).toBe('Keep this unsent draft')
    const trigger = host!.querySelector<HTMLButtonElement>('[data-testid="open-files"]')!
    trigger.focus()
    await click('open-files')
    const dialog = document.querySelector<HTMLElement>('.eap-drawer [role="dialog"]')!
    await vi.waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true))
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(workbench.panel).toBeNull()
    await vi.waitFor(() => expect(document.activeElement).toBe(trigger))
    expect(draft.value).toBe('Keep this unsent draft')
  })

  it('switches and toggles summary, changes and terminal through the same panel state without losing a draft', async () => {
    const draft = await mount()
    for (const panel of ['summary', 'changes', 'terminal'] as const) {
      await click(`open-${panel}`)
      expect(workbench.panel).toBe(panel)
      const expected = panel === 'terminal' ? 'terminal-dock' : `${panel}-rail`
      expect(host!.querySelector(`[data-testid="${expected}"]`)).not.toBeNull()
      for (const other of ['summary-rail', 'changes-rail', 'terminal-dock']) {
        if (other !== expected) expect(host!.querySelector(`[data-testid="${other}"]`)).toBeNull()
      }
      expect(draft.value).toBe('Keep this unsent draft')
    }
    await click('open-terminal')
    expect(workbench.panel).toBeNull()
    await click('open-summary')
    await click('close-summary')
    expect(workbench.panel).toBeNull()
    await click('open-changes')
    await click('close-changes')
    expect(workbench.panel).toBeNull()
    await click('open-terminal')
    await click('close-terminal')
    expect(workbench.panel).toBeNull()
    expect(draft.value).toBe('Keep this unsent draft')
  })

})

describe('ChatWorkspace / wireApi', () => {
  let app: App, host: HTMLDivElement
  async function flush() {
    for (let i = 0; i < 12; i++) await nextTick()
  }
  afterEach(() => {
    app?.unmount()
    host?.remove()
    vi.restoreAllMocks()
    localStorage.clear()
    sessionStorage.clear()
    chatBinding.value = null
    workbench.sessionExtras = {}
  })
  it.each(['responses', 'chat-completions', 'plan'] as const)(
    'gates the Git choice by effective %s protocol',
    async (protocol) => {
      chatStorage(localStorage).setItem(
        'eap.chat.history.v1',
        JSON.stringify({
          version: 1,
          activeId: 'c',
          items: [
            {
              id: 'c',
              title: 'chat',
              draft: '',
              archived: false,
              connectionId: 'selected',
              model: 'm',
            },
          ],
          transcripts: { c: [] },
        }),
      )
      mockChatStartup().mockResolvedValue({
        effectiveDefaultId: 'selected',
        items: [
          {
            id: 'selected',
            name: 'selected',
            kind: protocol === 'plan' ? 'chatgpt-plan' : 'api-key',
            wireApi: protocol === 'plan' ? undefined : protocol,
            enabled: true,
            models: [{ id: 'm', reasoningEfforts: [] }],
            allowedModels: ['m'],
            defaultModel: 'm',
            baseUrl: 'http://mock.local',
            discoveredAt: '',
            discoveryError: '',
            secretPresent: false,
            revision: 1,
            defaultSelected: true,
            configurationRevision: 'r',
          } satisfies ModelConnection,
        ],
      })
      vi.mocked(runtimeApi.aiStatus).mockResolvedValue({
        state: 'available',
        provider: 'mock',
        model: 'm',
        configurationRevision: 'r',
        lastObservedAt: null,
        errorCode: '',
        tools: { git_status: true },
        workspaceLabel: '',
      })
      const live = {
        conversationId: 'c',
        connectionId: 'selected',
        model: 'm',
        workspaceLabel: '',
        memory: '',
      }
      vi.spyOn(runtimeApi, 'aiConversation').mockResolvedValue(live)
      host = document.createElement('div')
      document.body.append(host)
      app = createApp(ChatWorkspace)
      app.use(i18n).mount(host)
      await vi.waitFor(() =>
        expect(host.querySelector('[data-testid="composer-add"]')).not.toBeNull(),
      )
      await flush()
      ;(host.querySelector('[data-testid="composer-add"]') as HTMLButtonElement).click()
      await flush()
      ;(document.querySelector('[data-testid="composer-cat-files"]') as HTMLButtonElement).click()
      await flush()
      const git = Array.from(
        document.querySelectorAll<HTMLButtonElement>('[data-testid="chat-tool-settings"] button'),
      ).find((button) => button.textContent === i18n.global.t('chat.toolGit'))
      expect(git).toBeDefined()
      expect(git!.disabled).toBe(protocol !== 'chat-completions')
    },
  )

})
