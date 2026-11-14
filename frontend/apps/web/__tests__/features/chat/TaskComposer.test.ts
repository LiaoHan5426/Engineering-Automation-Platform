// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref, type App } from 'vue'
import {
  runtimeApi,
  type TaskContext,
  type AiMessageResult,
  type ChatGraph,
  type ChatGraphOperation,
} from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import TaskComposer from '../../../src/features/chat/TaskComposer.vue'
import { workbench } from '../../../src/features/shell/workbench'
import { createChatSession, type ChatApi } from '../../../src/features/chat/chatSession'

let app: App | undefined
let element: HTMLDivElement | undefined
afterEach(() => {
  app?.unmount()
  element?.remove()
  vi.restoreAllMocks()
  sessionStorage.clear()
  workbench.sessionExtras = {}
  workbench.modelMenuToken = 0
  location.hash = ''
})
const empty = (): TaskContext => ({
  mode: 'chat',
  expert: 'general',
  instructions: '',
  reasoning: 'default',
  approval: 'review',
  files: [],
  prototypeVersionId: '',
  targetPath: '',
})
async function mount(
  attachmentStore?: import('../../../src/features/chat/chatAttachments').ChatAttachmentStore,
) {
  const context = ref(empty())
  element = document.createElement('div')
  document.body.append(element)
  app = createApp({
    render: () =>
      h(TaskComposer, {
        context: context.value,
        attachmentStore,
        attachmentOwner: 'draft:test',
        disabled: false,
        reasoningEfforts: [],
        onUpdate: (value: TaskContext) => {
          context.value = value
        },
      }),
  })
  app.use(i18n).mount(element)
  await nextTick()
  return context
}
describe('engineering task composer', () => {
  it('selects a code target without a prototype and sends the exact target in the shared DTO', async () => {
    const graph: ChatGraph = { conversationId: 'c1', revision: 0, nodes: [], operations: [] }
    const send = vi.fn<ChatApi['sendAiMessage']>(async (_id, request) => {
      const response: AiMessageResult = {
        executionId: 'execution',
        answer: 'test only',
        error: '',
        status: 'SUCCEEDED',
        approval: 'NOT_REQUIRED',
        verification: 'UNVERIFIED',
        toolEvents: [],
        artifacts: [],
        artifactError: '',
      }
      const operation: ChatGraphOperation = {
        operationId: request.operationId,
        executionId: response.executionId,
        userMessageId: 'user',
        assistantMessageId: 'assistant',
        graphRevision: 1,
        status: response.status,
        response,
      }
      graph.revision = 1
      graph.operations = [operation]
      graph.nodes = [
        {
          id: 'user',
          parentId: null,
          role: 'user',
          content: request.message,
          executionId: null,
          operationId: request.operationId,
          status: 'SUCCEEDED',
          response: null,
        },
        {
          id: 'assistant',
          parentId: 'user',
          role: 'assistant',
          content: response.answer,
          executionId: response.executionId,
          operationId: request.operationId,
          status: response.status,
          response,
        },
      ]
      return response
    })
    const api: ChatApi = {
      aiStatus: async () => ({
        state: 'configured_unverified',
        provider: 'test',
        model: '',
        configurationRevision: 'revision',
        lastObservedAt: null,
        errorCode: '',
        tools: { git_status: false },
        workspaceLabel: 'ws',
      }),
      openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: 'ws', memory: '' }),
      chatGraph: async () => structuredClone(graph),
      chatOperation: async () => structuredClone(graph.operations[0]!),
      cancelAiExecution: async (_id, executionId) => ({ cancelled: false, executionId }),
      sendAiMessage: send,
    }
    const session = createChatSession(api)
    await session.openConversation()
    session.draft.value = 'Adjust this existing page'
    element = document.createElement('div')
    document.body.append(element)
    app = createApp({
      render: () =>
        h(TaskComposer, {
          context: session.context.value,
          disabled: false,
          reasoningEfforts: [],
          onUpdate: (value: TaskContext) => {
            session.context.value = value
          },
        }),
    })
    app.use(i18n).mount(element)
    await nextTick()
    ;(element.querySelector('[data-testid=composer-add]') as HTMLButtonElement).click()
    await nextTick()
    ;(element.querySelector('[data-testid=composer-cat-actions]') as HTMLButtonElement).click()
    await nextTick()
    const mode = element.querySelector('.composer-popup-content select') as HTMLSelectElement
    mode.value = 'code'
    mode.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    const target = element.querySelector('[data-testid=generation-target]') as HTMLInputElement
    expect(target).not.toBeNull()
    target.value = 'frontend/apps/web/src/Example.vue'
    target.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    const companions = element.querySelector(
      '[data-testid=generation-component-paths]',
    ) as HTMLTextAreaElement
    companions.value = 'frontend/apps/web/src/Summary.vue\nfrontend/apps/web/src/model.ts'
    companions.dispatchEvent(new Event('input', { bubbles: true }))
    await nextTick()
    expect(session.context.value.prototypeVersionId).toBe('')
    expect(session.draft.value).toBe('Adjust this existing page')
    expect(send).not.toHaveBeenCalled()
    await session.send()
    expect(send.mock.calls[0]).toEqual([
      session.conversationId.value,
      expect.objectContaining({
        operationId: expect.any(String),
        expectedRevision: 0,
        kind: 'send',
        parentMessageId: null,
        targetMessageId: null,
        message: 'Adjust this existing page',
        toolMode: 'none',
        context: expect.objectContaining({
          mode: 'code',
          targetPath: 'frontend/apps/web/src/Example.vue',
          componentPaths: ['frontend/apps/web/src/Summary.vue', 'frontend/apps/web/src/model.ts'],
          prototypeVersionId: '',
        }),
      }),
      { signal: expect.any(AbortSignal), onEvent: expect.any(Function) },
    ])
  })
  it('shows a disabled busy refresh action while a catalog request is in progress', async () => {
    const refresh = vi.fn(),
      busy = ref(true)
    element = document.createElement('div')
    document.body.append(element)
    app = createApp({
      render: () =>
        h(TaskComposer, {
          context: empty(),
          disabled: false,
          refreshingModels: busy.value,
          reasoningEfforts: [],
          onRefresh: refresh,
        }),
    })
    app.use(i18n).mount(element)
    await nextTick()
    ;(element.querySelector('[data-testid="model-picker"]') as HTMLButtonElement).click()
    await nextTick()
    const button = element.querySelector('[data-testid="model-refresh"]') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-busy')).toBe('true')
    button.click()
    expect(refresh).not.toHaveBeenCalled()
    busy.value = false
    await nextTick()
    button.click()
    expect(refresh).toHaveBeenCalledTimes(1)
  })
  it('references an explicitly selected workspace excerpt without sending or applying it', async () => {
    vi.spyOn(runtimeApi, 'workspaceFiles').mockResolvedValue({
      path: '',
      entries: [{ name: 'Example.vue', path: 'frontend/Example.vue', directory: false }],
      truncated: false,
      denial: '',
    })
    vi.spyOn(runtimeApi, 'workspaceSource').mockResolvedValue({
      path: 'frontend/Example.vue',
      exists: true,
      excerpt: 'selected source excerpt',
      baseHash: 'source-baseline',
      bytes: 23,
      denial: '',
    })
    const send = vi.spyOn(runtimeApi, 'sendAiMessage'),
      apply = vi.spyOn(runtimeApi, 'applyCodeProposal')
    const context = await mount()
    ;(element!.querySelector('[data-testid="composer-add"]') as HTMLButtonElement).click()
    await nextTick()
    ;(element!.querySelector('[data-testid="pick-workspace-file"]') as HTMLButtonElement).click()
    await vi.waitFor(() =>
      expect(
        element!.querySelector('[data-testid="repository-browser"] [role="treeitem"]'),
      ).not.toBeNull(),
    )
    ;(
      element!.querySelector(
        '[data-testid="repository-browser"] [role="treeitem"]',
      ) as HTMLButtonElement
    ).click()
    await vi.waitFor(() =>
      expect(element!.querySelector('[data-testid="reference-workspace-source"]')).not.toBeNull(),
    )
    ;(
      element!.querySelector('[data-testid="reference-workspace-source"]') as HTMLButtonElement
    ).click()
    await nextTick()
    expect(context.value.files).toEqual([
      {
        name: 'frontend/Example.vue',
        content:
          'Repository source excerpt: frontend/Example.vue\nSHA-256: source-baseline\nselected source excerpt',
      },
    ])
    expect(send).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
    expect(element!.querySelector('[data-testid="repository-browser"]')).toBeNull()
  })
  it('consumes a server version handoff in mock mode through the same context contract', async () => {
    const context = ref(empty())
    sessionStorage.setItem('eap.chat.prototype', 'mock-server-version')
    element = document.createElement('div')
    document.body.append(element)
    app = createApp({
      render: () =>
        h(TaskComposer, {
          context: context.value,
          disabled: false,
          reasoningEfforts: [],
          onUpdate: (value) => {
            context.value = value
          },
        }),
    })
    app.use(i18n).mount(element)
    await nextTick()
    expect(context.value.prototypeVersionId).toBe('mock-server-version')
    expect(context.value.mode).toBe('code')
    expect(sessionStorage.getItem('eap.chat.prototype')).toBeNull()
  })
  it('keeps a version handoff pending while hidden or sending, then consumes it once', async () => {
    const context = ref(empty()),
      active = ref(false),
      disabled = ref(false)
    element = document.createElement('div')
    document.body.append(element)
    app = createApp({
      render: () =>
        h(TaskComposer, {
          context: context.value,
          active: active.value,
          disabled: disabled.value,
          reasoningEfforts: [],
          onUpdate: (value) => {
            context.value = value
          },
        }),
    })
    app.use(i18n).mount(element)
    sessionStorage.setItem('eap.chat.prototype', 'new-version')
    disabled.value = true
    active.value = true
    await nextTick()
    expect(context.value.prototypeVersionId).toBe('')
    expect(sessionStorage.getItem('eap.chat.prototype')).toBe('new-version')
    disabled.value = false
    await nextTick()
    expect(context.value.prototypeVersionId).toBe('new-version')
    expect(sessionStorage.getItem('eap.chat.prototype')).toBeNull()
    context.value.prototypeVersionId = ''
    active.value = false
    await nextTick()
    active.value = true
    await nextTick()
    expect(context.value.prototypeVersionId).toBe('')
  })
  it('takes a saved Builder version into code mode without sending or writing', async () => {
    sessionStorage.setItem('eap.chat.prototype', 'saved-version')
    const context = await mount()
    expect(context.value.prototypeVersionId).toBe('saved-version')
    expect(context.value.mode).toBe('code')
    expect(context.value.expert).toBe('frontend')
    expect(sessionStorage.getItem('eap.chat.prototype')).toBeNull()
  })
  it('changes expert and approval as actual context and disables unsupported reasoning', async () => {
    const context = await mount()
    expect(element!.querySelector('[data-testid="composer-scope"]')).not.toBeNull()
    expect(element!.querySelectorAll('.context-toolbar select')).toHaveLength(0)
    ;(element!.querySelector('[data-testid="composer-add"]') as HTMLButtonElement).click()
    await nextTick()
    expect(element!.querySelector('[data-testid="composer-cat-files"]')).not.toBeNull()
    expect(element!.querySelector('[data-testid="composer-cat-actions"]')).not.toBeNull()
    expect(
      (element!.querySelector('[data-testid="composer-search"]') as HTMLInputElement).placeholder,
    ).toMatch(/搜索添加文件|Search files to add/)
    expect(
      (element!.querySelector('[data-testid="composer-cat-unattended"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true)
    ;(element!.querySelector('[data-testid="composer-cat-experts"]') as HTMLButtonElement).click()
    await nextTick()
    expect(element!.textContent).toContain('内置指导角色')
    expect(element!.querySelector('[data-testid=expert-kind]')?.textContent).toContain('协作')
    expect(element!.querySelector('[data-testid=expert-kind]')?.textContent).toContain('工具未接入')
    const expert = element!.querySelector('.composer-popup select') as HTMLSelectElement
    expert.value = 'sql'
    expert.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    expect(context.value.expert).toBe('sql')
    ;(element!.querySelector('[data-testid="approval-policy"]') as HTMLButtonElement).click()
    await nextTick()
    expect(element!.querySelector('[data-testid="composer-add-menu"]')).toBeNull()
    expect(
      (element!.querySelector('[data-testid="approval-ai-review"]') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(element!.querySelector('[data-testid="approval-ai-review"]')?.textContent).toMatch(
      /低风险自动通过|Auto-pass low risk|未接通|not connected/,
    )
    expect(
      (element!.querySelector('[data-testid="approval-full"]') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(element!.querySelector('[data-testid="risk-review-off"]')?.textContent).toMatch(
      /风险审核未接入|Risk review is not connected/,
    )
    ;(element!.querySelector('[data-testid="approval-read-only"]') as HTMLButtonElement).click()
    await nextTick()
    expect(context.value.approval).toBe('read_only')
    ;(element!.querySelector('[data-testid="model-picker"]') as HTMLButtonElement).click()
    await nextTick()
    expect(element!.querySelector('[data-testid="effort-low"]')).toBeNull()
    expect(element!.querySelector('.effort-row')).toBeNull()
    expect(element!.querySelector('[data-testid="model-setup-link"]')).not.toBeNull()
    ;(element!.querySelector('[data-testid="execution-mode"]') as HTMLButtonElement).click()
    await nextTick()
    expect(
      (element!.querySelector('[data-testid="execution-plan"]') as HTMLButtonElement).disabled,
    ).toBe(false)
    expect(
      (element!.querySelector('[data-testid="execution-agent"]') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (element!.querySelector('[data-testid="execution-plugin"]') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(element!.querySelector('[data-testid="execution-plugin"]')?.textContent).toMatch(
      /插件创造|Plugin create/,
    )
    await new Promise((resolve) => setTimeout(resolve, 20))
    document.body.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }),
    )
    await vi.waitFor(() => expect(element!.querySelector('.composer-popup')).toBeNull())
  })

  it('opens the model menu once when asked and does not change the draft context', async () => {
    const context = await mount()
    workbench.modelMenuToken = 1
    await nextTick()
    expect(element!.querySelector('[data-testid="model-refresh"]')).not.toBeNull()
    expect(workbench.modelMenuToken).toBe(0)
    expect(context.value).toEqual(empty())
  })

  it('shows only the levels the current model lists', async () => {
    const context = ref(empty())
    element = document.createElement('div')
    document.body.append(element)
    app = createApp({
      render: () =>
        h(TaskComposer, {
          context: context.value,
          disabled: false,
          modelLabel: 'reasoning-model',
          reasoningEfforts: ['high'],
          onUpdate: (value: TaskContext) => {
            context.value = value
          },
        }),
    })
    app.use(i18n).mount(element)
    await nextTick()
    ;(element!.querySelector('[data-testid="model-picker"]') as HTMLButtonElement).click()
    await nextTick()
    expect(element!.querySelector('[data-testid="effort-high"]')).not.toBeNull()
    expect(element!.querySelector('[data-testid="effort-low"]')).toBeNull()
    expect(element!.querySelector('[data-testid="effort-medium"]')).toBeNull()
    ;(element!.querySelector('[data-testid="effort-high"]') as HTMLButtonElement).click()
    await nextTick()
    expect(context.value.reasoning).toBe('high')
  })

  it('reports unavailable attachment storage and keeps the draft unchanged', async () => {
    const context = await mount()
    const pasted = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(pasted, 'clipboardData', {
      value: { files: [new File(['png'], 'shot.png', { type: 'image/png' })] },
    })
    element!.querySelector('.composer-stack')!.dispatchEvent(pasted)
    await new Promise((resolve) => setTimeout(resolve, 0))
    await nextTick()
    expect(pasted.defaultPrevented).toBe(true)
    expect(context.value.files).toEqual([])
    expect(element!.textContent).toContain('attachment.storageUnavailable')
  })

  it('anchors the shared popover to the toolbar control', async () => {
    await mount()
    const button = element!.querySelector('[data-testid="execution-mode"]') as HTMLButtonElement
    button.click()
    await nextTick()
    expect(element!.querySelector('[data-reka-popper-content-wrapper]')).not.toBeNull()
    const popup = element!.querySelector('.composer-popup')!
    expect(popup.getAttribute('role')).toBe('dialog')
    expect(popup.getAttribute('aria-label')).toBeTruthy()
    button.click()
    await nextTick()
    expect(element!.querySelector('.composer-popup')).toBeNull()
  })

  it('replaces the demo skill toggle with the real selector entry and keeps the draft', async () => {
    const context = ref(empty())
    element = document.createElement('div')
    document.body.append(element)
    app = createApp({
      render: () =>
        h('form', [
          h('textarea', { value: '保留正文' }),
          h(TaskComposer, {
            context: context.value,
            disabled: false,
            reasoningEfforts: [],
            onUpdate: (value: TaskContext) => {
              context.value = value
            },
          }),
        ]),
    })
    app.use(i18n).mount(element)
    await nextTick()
    const draft = element.querySelector('textarea') as HTMLTextAreaElement
    ;(element.querySelector('[data-testid="composer-add"]') as HTMLButtonElement).click()
    await nextTick()
    ;(element.querySelector('[data-testid="composer-cat-skills"]') as HTMLButtonElement).click()
    await nextTick()
    const search = element.querySelector('[data-testid="composer-search"]') as HTMLInputElement
    search.value = '没有这项'
    search.dispatchEvent(new Event('input'))
    await nextTick()
    expect(element.querySelector('.composer-popup-content [aria-pressed]')).toBeNull()
    search.value = ''
    search.dispatchEvent(new Event('input'))
    await nextTick()
    expect(element.querySelector('.composer-popup-content [aria-pressed]')).toBeNull()
    const skill = element.querySelector('[data-testid="skill-open"]') as HTMLButtonElement
    expect(skill).not.toBeNull()
    expect(skill.textContent).toContain('选择技能版本')
    expect(context.value).not.toHaveProperty('skillRef')
    expect(draft.value).toBe('保留正文')
    ;(element.querySelector('[data-testid="composer-cat-experts"]') as HTMLButtonElement).click()
    await nextTick()
    ;(element.querySelector('[data-testid="manage-experts"]') as HTMLButtonElement).click()
    await nextTick()
    expect(location.hash).toBe('#expert-catalog')
    expect(draft.value).toBe('保留正文')
  })
  it('marks the current mode and returns focus to the draft on escape', async () => {
    const context = ref(empty())
    element = document.createElement('div')
    document.body.append(element)
    app = createApp({
      render: () =>
        h('form', [
          h(
            TaskComposer,
            {
              context: context.value,
              disabled: false,
              reasoningEfforts: [],
              onUpdate: (value: TaskContext) => {
                context.value = value
              },
            },
            { draft: () => h('textarea', { class: 'composer-draft' }) },
          ),
        ]),
    })
    app.use(i18n).mount(element)
    await nextTick()
    const field = element.querySelector('textarea') as HTMLTextAreaElement
    field.value = '保留正文'
    ;(element.querySelector('[data-testid=execution-mode]') as HTMLButtonElement).click()
    await nextTick()
    const popup = element.querySelector('.composer-popup') as HTMLElement
    expect(popup).not.toBeNull()
    expect(
      (element.querySelector('[data-testid=execution-chat]') as HTMLButtonElement).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true')
    expect(
      (element.querySelector('[data-testid=execution-plan]') as HTMLButtonElement).getAttribute(
        'aria-pressed',
      ),
    ).toBe('false')
    popup.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await nextTick()
    expect(element.querySelector('.composer-popup')).toBeNull()
    expect(document.activeElement).toBe(field)
    expect(field.value).toBe('保留正文')
    expect(context.value.mode).toBe('chat')
  })
  it('shows the file cap and does not invent a token count', async () => {
    const context = await mount()
    const meter = () => element?.querySelector('[data-testid=context-meter]')?.textContent ?? ''
    expect(meter()).toContain('上下文')
    expect(meter()).toContain('文件 0/6')
    expect(meter()).toContain('无 token')
    context.value = { ...context.value, files: [{ name: 'a.vue', content: 'sample' }] }
    await nextTick()
    expect(meter()).toContain('文件 1/6')
    expect(meter()).not.toMatch(/\d+\s*tokens?/i)
  })

  it('opens attachments from the add entry and labels high effort as max', async () => {
    const context = ref(empty())
    element = document.createElement('div')
    document.body.append(element)
    app = createApp({
      render: () =>
        h(TaskComposer, {
          context: context.value,
          disabled: false,
          reasoningEfforts: ['high'],
          modelLabel: 'deepseek-flash',
          onUpdate: (value: TaskContext) => {
            context.value = value
          },
        }),
    })
    app.use(i18n).mount(element)
    await nextTick()
    ;(element!.querySelector('[data-testid=composer-add]') as HTMLButtonElement).click()
    await nextTick()
    expect(element!.querySelector('[data-testid=composer-add-menu]')).not.toBeNull()
    expect(
      element!.querySelector('[data-testid=composer-cat-files]')?.getAttribute('aria-pressed'),
    ).toBe('true')
    ;(element!.querySelector('[data-testid=model-picker]') as HTMLButtonElement).click()
    await nextTick()
    expect(element!.querySelector('[data-testid=model-effort-head]')?.textContent).toContain(
      '模型默认',
    )
    expect(element!.querySelector('[data-testid=model-effort-head]')?.textContent).toContain(
      'deepseek-flash',
    )
    ;(element!.querySelector('[data-testid=effort-high]') as HTMLButtonElement).click()
    await nextTick()
    expect(context.value.reasoning).toBe('high')
    expect(element!.querySelector('[data-testid=model-picker]')?.textContent).toContain('最大')
    expect(element!.querySelector('[data-testid=model-effort-head]')?.textContent).toContain('最大')
  })
})

it('releases a local selection finishing after the composer changes conversation context', async () => {
  let finish!: (
    refs: import('../../../src/features/chat/chatAttachments').LocalAttachment[],
  ) => void
  const remove = vi.fn(async () => {})
  const store = {
    select: vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    ),
    remove,
  } as unknown as import('../../../src/features/chat/chatAttachments').ChatAttachmentStore
  const context = await mount(store)
  const file = new File(['content'], 'old.txt', { type: 'text/plain' })
  const paste = new Event('paste', { bubbles: true, cancelable: true })
  Object.defineProperty(paste, 'clipboardData', { value: { files: [file] } })
  element!.querySelector('.composer-stack')!.dispatchEvent(paste)
  context.value = { ...empty(), instructions: 'other conversation' }
  await nextTick()
  finish([
    {
      id: 'original-id',
      name: 'old.txt',
      mime: 'text/plain',
      kind: 'text',
      size: 7,
      sha256: 'abc',
    },
  ])
  await vi.waitFor(() => expect(remove).toHaveBeenCalledWith('draft:test', 'original-id'))
  expect(context.value.attachmentRefs ?? []).toEqual([])
  expect(context.value.files).toEqual([])
  expect(context.value.instructions).toBe('other conversation')
})
