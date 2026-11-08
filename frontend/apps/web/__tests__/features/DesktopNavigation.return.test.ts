// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import Shell from '../../src/App.vue'
import { i18n } from '../../src/lib/i18n'
import { chatBinding, currentExtras, workbench } from '../../src/features/shell/workbench'
import { resetLocalProjectsForTests } from '../../src/features/shell/localProjects'

// Mount the real App, navigation and catalog. Domain editors are outside this
// shell contract; keep their API/lifecycle work out of the source-session fixture.
vi.mock('../../src/features/chat/ChatWorkspace.vue', () => ({
  default: { template: '<section data-testid="source-chat" />' },
}))
vi.mock('../../src/features/settings/ModelSettings.vue', () => ({
  default: { template: '<section />' },
}))
vi.mock('../../src/features/rule/RuleManager.vue', () => ({
  default: { template: '<section />' },
}))
vi.mock('../../src/features/shell/ProjectBoard.vue', () => ({
  default: { template: '<section data-testid="source-board" />' },
}))
vi.mock('grapesjs', () => {
  throw new Error('Canvas is browser-tested')
})

let app: App
let root: HTMLDivElement
const create = vi.fn()
const select = vi.fn()

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  resetLocalProjectsForTests()
  workbench.origin = 'chat'
  workbench.workMode = 'code'
  workbench.pendingNewChat = false
  workbench.pendingDraft = ''
  workbench.selectedProjectId = 'local-eap'
  workbench.sessionExtras = {
    source: { scenarioId: null, experts: [], resources: [], projectId: 'local-eap' },
  }
  chatBinding.value = {
    history: [{ id: 'source', title: 'Source session', archived: false }],
    activeId: 'source',
    draft: '未发送的 Work 草稿',
    references: [],
    sending: false,
    workspaceLabel: '',
    memory: '',
    model: '',
    connectionName: '',
    approval: 'review',
    goal: 'chat',
    executionMode: 'chat',
    scenarioId: null,
    proposalFiles: [],
    verification: 'not_requested',
    create,
    select,
  }
  for (const method of [
    'health',
    'capabilities',
    'databases',
    'experts',
    'tasks',
    'stats',
  ] as const) {
    vi.spyOn(runtimeApi, method).mockRejectedValue(
      new Error('No service in shell navigation tests'),
    )
  }
  vi.spyOn(runtimeApi, 'sendAiMessage').mockRejectedValue(new Error('Navigation must not send'))
  vi.spyOn(runtimeApi, 'openAiConversation').mockRejectedValue(
    new Error('Navigation must not create'),
  )
  root = document.createElement('div')
  document.body.append(root)
})

afterEach(() => {
  app?.unmount()
  root.remove()
  window.history.replaceState(null, '', '/')
  chatBinding.value = null
  workbench.origin = 'chat'
  workbench.workMode = 'code'
  workbench.sessionExtras = {}
  workbench.notice = ''
  localStorage.clear()
  sessionStorage.clear()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

async function mountSource(hash = 'work') {
  window.history.replaceState(null, '', `/#${hash}`)
  app = createApp(Shell).use(i18n)
  app.mount(root)
  await nextTick()
}

async function click(selector: string) {
  const button = root.querySelector<HTMLButtonElement>(selector)
  expect(button, `Required control: ${selector}`).not.toBeNull()
  button!.click()
  await nextTick()
}

function expectSourceIntact(mode = 'work') {
  expect(chatBinding.value?.activeId).toBe('source')
  expect(chatBinding.value?.draft).toBe('未发送的 Work 草稿')
  expect(chatBinding.value?.sending).toBe(false)
  expect(workbench.selectedProjectId).toBe('local-eap')
  expect(workbench.sessionExtras.source.projectId).toBe('local-eap')
  expect(workbench.workMode).toBe(mode)
  expect(workbench.pendingNewChat).toBe(false)
  expect(workbench.pendingDraft).toBe('')
  expect(create).not.toHaveBeenCalled()
  expect(select).not.toHaveBeenCalled()
  expect(runtimeApi.sendAiMessage).not.toHaveBeenCalled()
  expect(runtimeApi.openAiConversation).not.toHaveBeenCalled()
}

describe('source-surface return through the real App navigation', () => {
  it.each([
    ['work', '', 'work'],
    ['code', '', 'chat'],
    ['work', 'model-settings', 'work'],
    ['code', 'unknown-view', 'chat'],
  ] as const)('falls back in %s mode when source is "%s"', async (mode, origin, target) => {
    workbench.workMode = mode
    workbench.origin = origin
    await mountSource('model-settings')
    await click('[data-testid="back-to-source-session"]')
    expect(window.location.hash).toBe(`#${target}`)
    expectSourceIntact(mode)
  })

  it('returns from a direct catalog entry without creating a missing session', async () => {
    chatBinding.value = null
    workbench.origin = ''
    workbench.workMode = 'work'
    await mountSource('expert-catalog')
    await click('[data-testid="back-to-source-session"]')
    expect(window.location.hash).toBe('#work')
    expect(chatBinding.value).toBeNull()
    expect(workbench.pendingNewChat).toBe(false)
    expect(workbench.selectedProjectId).toBe('local-eap')
    expect(create).not.toHaveBeenCalled()
    expect(select).not.toHaveBeenCalled()
    expect(runtimeApi.openAiConversation).not.toHaveBeenCalled()
    expect(runtimeApi.sendAiMessage).not.toHaveBeenCalled()
  })

  it.each([
    ['chat', 'code'],
    ['sql', 'code'],
    ['board', 'code'],
    ['board', 'work'],
  ] as const)(
    'returns to the actual %s source in %s mode, not an invented new chat',
    async (source, mode) => {
      workbench.workMode = mode
      await mountSource(source)
      await click('.activity-bar button:nth-child(4)')
      expect(workbench.origin).toBe(source)
      await click('.activity-bar button:nth-child(5)')
      expect(workbench.origin).toBe(source)
      await click('[data-testid="back-to-source-session"]')
      expect(window.location.hash).toBe(`#${source}`)
      expectSourceIntact(mode)
      expect(root.querySelector('[data-testid="back-to-source-session"]')).toBeNull()
    },
  )

  it('keeps the Work source stable across settings children and returns without resetting it', async () => {
    await mountSource()
    await click('.activity-bar button:nth-child(5)')
    expect(window.location.hash).toBe('#model-settings')
    expect(workbench.origin).toBe('work')
    expect(root.querySelector('[data-testid="project-tree"]')).toBeNull()
    const rules = [...root.querySelectorAll<HTMLButtonElement>('.desktop-sidebar button')].find(
      (button) => button.textContent === '规则库',
    )
    expect(rules).toBeDefined()
    rules!.click()
    await nextTick()
    expect(window.location.hash).toBe('#rules')
    expect(workbench.origin).toBe('work')
    expect(root.querySelector('.settings-search')).not.toBeNull()
    expect(root.querySelectorAll('[data-testid="back-to-source-session"]')).toHaveLength(1)
    await click('[data-testid="back-to-source-session"]')
    expect(window.location.hash).toBe('#work')
    expectSourceIntact()
    await click('.activity-bar button:nth-child(5)')
    expect(window.location.hash).toBe('#rules')
    expect(workbench.origin).toBe('work')
  })

  it('returns from the expert catalog to the existing Work session after selection', async () => {
    await mountSource()
    await click('.activity-bar button:nth-child(4)')
    expect(window.location.hash).toBe('#experts')
    await click('[data-testid="expert-roles-nav"]')
    expect(window.location.hash).toBe('#expert-catalog')
    // App, not a copied test watcher, records Work as the source of chat.
    expect(workbench.origin).toBe('work')
    expect(root.querySelector('[data-testid="project-tree"]')).toBeNull()
    await click('[data-testid="expert-add"]')
    expect(currentExtras().experts).toHaveLength(1)
    expect(window.location.hash).toBe('#expert-catalog')
    expectSourceIntact()
    expect(root.querySelectorAll('[data-testid="back-to-source-session"]')).toHaveLength(1)
    await click('[data-testid="back-to-source-session"]')
    expect(window.location.hash).toBe('#work')
    expect(
      root.querySelector('.activity-bar button:nth-child(2)')?.getAttribute('aria-current'),
    ).toBe('page')
    expectSourceIntact()
    expect(currentExtras().experts).toHaveLength(1)
  })
})
