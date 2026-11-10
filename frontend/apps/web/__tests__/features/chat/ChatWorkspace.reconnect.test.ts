import { chatStorage } from '../../../src/features/chat/chatService'
// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import { runtimeApi, type ModelConnection } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import ChatWorkspace from '../../../src/features/chat/ChatWorkspace.vue'
import { chatBinding, workbench } from '../../../src/features/shell/workbench'
import { mockChatStartup } from './chatStartup.fixture'

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
