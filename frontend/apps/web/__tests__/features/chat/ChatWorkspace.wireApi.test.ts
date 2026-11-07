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
})
it.each(['responses', 'chat-completions', 'plan'] as const)(
  'gates the Git choice by effective %s protocol',
  async (protocol) => {
    localStorage.setItem(
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
