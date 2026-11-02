// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, type App } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import ChatWorkspace from '../../../src/features/chat/ChatWorkspace.vue'
import { chatBinding, workbench } from '../../../src/features/shell/workbench'
import { mockChatStartup } from './chatStartup.fixture.ts'
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
  localStorage.setItem(
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
