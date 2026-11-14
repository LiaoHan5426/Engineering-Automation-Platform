// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, defineComponent, h, nextTick, type App } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import ChatWorkspace from '../../../src/features/chat/ChatWorkspace.vue'
import { chatBinding, workbench } from '../../../src/features/shell/workbench'
import { chatStorage } from '../../../src/features/chat/chatService'
import { mockChatStartup } from './chatStartup.fixture'

let allowed = false
let retry: (() => void) | undefined
const guard = vi.fn((onDiscard?: () => void) => {
  if (!allowed) retry = onDiscard
  return allowed
})
vi.mock('../../../src/features/chat/TaskComposer.vue', () => ({
  default: defineComponent({
    setup(_, { expose, slots }) {
      expose({ guardLeave: (onDiscard?: () => void) => guard(onDiscard) })
      return () => h('div', slots.draft?.())
    },
  }),
}))
let app: App
let root: HTMLDivElement
let workspace: { guardLeave: (onDiscard?: () => void) => boolean }
afterEach(() => {
  app?.unmount()
  root?.remove()
  localStorage.clear()
  sessionStorage.clear()
  chatBinding.value = null
  workbench.pendingNewChat = false
  vi.restoreAllMocks()
  allowed = false
  retry = undefined
  guard.mockClear()
})
async function mount() {
  chatStorage(localStorage).setItem(
    'eap.chat.history.v1',
    JSON.stringify({
      version: 1,
      activeId: 'a',
      items: ['a', 'b'].map((id) => ({ id, title: id, draft: `draft-${id}`, archived: false })),
      transcripts: { a: [], b: [] },
    }),
  )
  mockChatStartup()
  vi.spyOn(runtimeApi, 'aiConversation').mockResolvedValue({
    conversationId: 'a',
    workspaceLabel: '',
    memory: '',
  })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(ChatWorkspace)
  app.use(i18n)
  workspace = app.mount(root) as unknown as typeof workspace
  await vi.waitFor(() => expect(chatBinding.value?.activeId).toBe('a'))
}
function discard() {
  const action = retry
  retry = undefined
  allowed = true
  action?.()
}
it('blocks session selection and retries the intended session after discard', async () => {
  await mount()
  chatBinding.value!.select('b')
  await nextTick()
  expect(chatBinding.value?.activeId).toBe('a')
  expect(chatBinding.value?.draft).toBe('draft-a')
  expect(retry).toBeTypeOf('function')
  discard()
  await vi.waitFor(() => expect(chatBinding.value?.activeId).toBe('b'))
  expect(chatBinding.value?.draft).toBe('draft-b')
})
it('blocks new drafts and active-session archive while the editor refuses to leave', async () => {
  await mount()
  chatBinding.value!.create()
  await nextTick()
  expect(chatBinding.value?.activeId).toBe('a')
  discard()
  await nextTick()
  expect(chatBinding.value?.activeId).toBeNull()
  chatBinding.value!.select('a')
  await vi.waitFor(() => expect(chatBinding.value?.activeId).toBe('a'))
  allowed = false
  chatBinding.value!.archive!('a')
  await nextTick()
  expect(chatBinding.value?.activeId).toBe('a')
  expect(chatBinding.value?.history.find((item) => item.id === 'a')?.archived).toBe(false)
  discard()
  await nextTick()
  expect(chatBinding.value?.activeId).toBeNull()
})
it('exposes the same guard and discard continuation to the route host', async () => {
  await mount()
  const navigate = vi.fn()
  expect(workspace.guardLeave(navigate)).toBe(false)
  expect(navigate).not.toHaveBeenCalled()
  discard()
  expect(navigate).toHaveBeenCalledTimes(1)
})
