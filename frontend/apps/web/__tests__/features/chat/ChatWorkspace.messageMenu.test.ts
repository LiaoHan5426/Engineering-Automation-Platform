// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import ChatWorkspace from '../../../src/features/chat/ChatWorkspace.vue'
import { chatStorage } from '../../../src/features/chat/chatService'
import { chatBinding, workbench } from '../../../src/features/shell/workbench'
import { i18n } from '../../../src/lib/i18n'
import { mockChatStartup } from './chatStartup.fixture'

let app: App | undefined
let host: HTMLDivElement | undefined
let listener: EventListener | undefined
const conversationId = '22222222-2222-4222-8222-222222222222'
afterEach(() => {
  if (listener) document.removeEventListener('eap:message-context', listener)
  listener = undefined
  app?.unmount()
  host?.remove()
  vi.restoreAllMocks()
  localStorage.clear()
  sessionStorage.clear()
  chatBinding.value = null
  workbench.panel = null
  workbench.sessionExtras = {}
})
async function mount() {
  workbench.executionMode = 'chat'
  workbench.workMode = 'code'
  workbench.pendingBoardDraft = null
  chatStorage(localStorage).setItem(
    'eap.chat.preferences.v2',
    JSON.stringify({
      version: 2,
      activeId: conversationId,
      items: [
        {
          id: conversationId,
          title: 'Menu source',
          draft: 'Unsent original draft',
          archived: false,
          connectionId: null,
          model: '',
        },
      ],
    }),
  )
  mockChatStartup()
  vi.spyOn(runtimeApi, 'chatGraph').mockResolvedValue({
    conversationId,
    revision: 1,
    operations: [],
    nodes: [
      {
        id: '33333333-3333-4333-8333-333333333333',
        parentId: null,
        role: 'user',
        content: 'Original question',
        executionId: null,
        operationId: 'operation',
        status: 'SUCCEEDED',
        response: null,
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        parentId: '33333333-3333-4333-8333-333333333333',
        role: 'assistant',
        content: 'Captured original message',
        executionId: 'execution',
        operationId: 'operation',
        status: 'SUCCEEDED',
        response: null,
      },
    ],
  })
  vi.spyOn(runtimeApi, 'aiConversation').mockResolvedValue({
    conversationId,
    connectionId: null,
    model: '',
    workspaceLabel: '',
    memory: '',
  })
  host = document.createElement('div')
  document.body.append(host)
  app = createApp(ChatWorkspace)
  app.use(i18n).mount(host)
  await vi.waitFor(() => expect(chatBinding.value?.draft).toBe('Unsent original draft'))
  await vi.waitFor(() => expect(host!.innerHTML).toContain('Captured original message'))
  await nextTick()
  return host.querySelector<HTMLParagraphElement>('.turn-assistant .chat-message-body')!
}

it('preserves native context behavior when the adapter is unavailable and gives feedback for the visible action', async () => {
  const text = await mount()
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  text.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
  host!.querySelector<HTMLButtonElement>('.turn-assistant [data-testid="message-actions"]')!.click()
  await nextTick()
  expect(host!.querySelector('[data-testid="message-menu-unavailable"]')).not.toBeNull()
  expect(chatBinding.value?.draft).toBe('Unsent original draft')
  expect(chatBinding.value?.activeId).toBe(conversationId)
})

it('offers the same immutable captured target from the visible action and context gesture without changing the conversation', async () => {
  const text = await mount()
  const targets: Array<{ conversationId: string; messageId: string; text: string }> = []
  listener = (event) => {
    const request = event as CustomEvent<{ target: (typeof targets)[number] }>
    expect(Object.isFrozen(request.detail.target)).toBe(true)
    targets.push(request.detail.target)
    request.preventDefault()
  }
  document.addEventListener('eap:message-context', listener)
  host!.querySelector<HTMLButtonElement>('.turn-assistant [data-testid="message-actions"]')!.click()
  const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
  text.dispatchEvent(event)
  await nextTick()
  expect(event.defaultPrevented).toBe(true)
  expect(targets).toHaveLength(2)
  expect(targets[0]).toEqual(targets[1])
  expect(targets[0]).toMatchObject({ conversationId, text: 'Captured original message' })
  expect(host!.querySelector('[data-testid="message-menu-unavailable"]')).toBeNull()
  expect(chatBinding.value?.draft).toBe('Unsent original draft')
  expect(chatBinding.value?.activeId).toBe(conversationId)
})
