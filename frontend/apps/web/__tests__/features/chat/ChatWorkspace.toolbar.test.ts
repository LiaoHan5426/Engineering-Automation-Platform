// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import ChatWorkspace from '../../../src/features/chat/ChatWorkspace.vue'
import { chatBinding, workbench } from '../../../src/features/shell/workbench'
import { mockChatStartup } from './chatStartup.fixture.ts'

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
