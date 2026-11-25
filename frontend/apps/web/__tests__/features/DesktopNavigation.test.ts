import { scenarioHost } from './plugins/designerFixtures'
const readyPluginHost = scenarioHost()
const disabledPluginHost = scenarioHost(false)
// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { chatBinding, currentExtras, workbench } from '../../src/features/shell/workbench'
import { resetLocalBridgeForTests } from '../../src/features/shell/localBridge'
import {
  createLocalProject,
  resetLocalProjectsForTests,
} from '../../src/features/shell/localProjects'
import { workspaceDirty } from '../../src/features/shell/runtimeIdentity'
import { runtimeApi } from '@eap/runtime-client'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { i18n } from '../../src/lib/i18n'
import Shell from '../../src/App.vue'
import DesktopNavigation from '../../src/features/DesktopNavigation.vue'
import { isKnownHash } from '../../src/features/plugins/model'
import ScenarioWorkspace from '../../src/features/ScenarioWorkspace.vue'
import { resetScenarioWorkspaceState } from '../../src/features/shell/scenarioWorkspaceState'
vi.mock('grapesjs', () => {
  throw new Error('Canvas is browser-tested')
})
vi.mock('../../src/features/chat/ChatWorkspace.vue', () => ({
  default: { template: '<section data-testid="source-chat" />' },
}))
vi.mock('../../src/features/settings/ModelSettings.vue', () => ({
  __esModule: true,
  default: { template: '<section />' },
}))
vi.mock('../../src/features/rule/RuleManager.vue', () => ({
  __esModule: true,
  default: { template: '<section />' },
}))
vi.mock('../../src/features/shell/ProjectBoard.vue', () => ({
  __esModule: true,
  default: { template: '<section data-testid="source-board" />' },
}))
let app: App | undefined
let root: HTMLDivElement | undefined
describe('desktop navigation', () => {
beforeEach(() => {
  resetScenarioWorkspaceState()
  vi.spyOn(runtimeApi, 'aiStatus').mockRejectedValue(new Error('No local service in unit tests'))
  vi.spyOn(runtimeApi, 'scenarios').mockResolvedValue({ items: [] })
  vi.spyOn(runtimeApi, 'workspaceDirty').mockResolvedValue({
    requested: false,
    denial: 'AUTHORIZED_ROOT_MISSING',
    count: 0,
    paths: [],
    detail: '',
  })
  vi.spyOn(runtimeApi, 'workspaceSource').mockResolvedValue({
    path: '',
    exists: false,
    baseHash: '',
    bytes: 0,
    excerpt: '',
    denial: 'SOURCE_UNAVAILABLE',
  })
  vi.spyOn(runtimeApi, 'workspaceBaseline').mockResolvedValue({
    path: '',
    exists: false,
    baseHash: '',
    denial: 'AUTHORIZED_ROOT_MISSING',
  })

  workbench.selectedScenario = 'prototype-to-code'
  resetLocalProjectsForTests()
  resetLocalBridgeForTests()
  workspaceDirty.value = null
  delete window.eap
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
  sessionStorage.clear()
  localStorage.clear()
  chatBinding.value = null
  resetLocalProjectsForTests()
  resetLocalBridgeForTests()
  workspaceDirty.value = null
  delete window.eap
  workbench.sessionExtras = {}
  workbench.pendingDraft = ''
  workbench.pendingNewChat = false
})
const pages = [
  'chat',
  'sql',
  'experts',
  'model-settings',
  'plugins',
  'builder-alpha',
  'builder-beta',
].map((id) => ({ id, name: id }))

  it('keeps the board contribution hidden only when explicitly disabled', async () => {
    workbench.selectedProjectId = 'local-eap'
    const enabled = ref(true)
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(DesktopNavigation, { activeView: 'chat', pages, boardEnabled: enabled.value }),
    })
    app.use(i18n).mount(root)
    expect(root.querySelector('[data-testid=open-board]')).not.toBeNull()
    enabled.value = false
    await nextTick()
    expect(root.querySelector('[data-testid=open-board]')).toBeNull()
  })
  it('groups sidebar creation, search, conversations and secondary tools in a clear order', async () => {
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({ render: () => h(DesktopNavigation, { activeView: 'chat', pages }) })
    app.use(i18n).mount(root)
    await nextTick()
    const sidebar = root.querySelector('.desktop-sidebar')!
    const sections = [...sidebar.children]
      .map((node) => node.getAttribute('data-testid'))
      .filter(Boolean)
    // The prototype gives the sidebar its own 56px header segment above the
    // creation/search tree, so it leads the section order.
    expect(sections).toEqual([
      'sidebar-head',
      'new-chat',
      'sidebar-filter',
      'project-tree',
      'unbound-sessions',
      'sidebar-tools',
      'sidebar-storage-card',
    ])
    expect(sidebar.querySelector('[data-testid="sidebar-head-new"]')).toBeNull()
    expect(
      sidebar.querySelector('[data-testid="new-project"]')?.closest('.sidebar-section-head'),
    ).not.toBeNull()
    expect(
      sidebar.querySelector('[data-testid="new-free-chat"]')?.closest('.sidebar-section-head'),
    ).not.toBeNull()
    expect(sidebar.querySelector('[data-testid="unbound-sessions"]')?.textContent).not.toContain(
      '没有选中分组时',
    )
    expect(
      sidebar.querySelector('[data-testid="sidebar-tools"] [data-testid="archived-sessions"]'),
    ).not.toBeNull()
    expect(
      sidebar.querySelector('[data-testid="sidebar-tools"] [data-testid="today-journal"]'),
    ).not.toBeNull()
    expect(root.querySelectorAll('.activity-bar svg.eap-icon')).toHaveLength(5)
    expect(sidebar.querySelector('[data-testid="new-chat"] svg.eap-icon')).not.toBeNull()
    expect(sidebar.querySelector('[data-testid="new-project"] svg.eap-icon')).not.toBeNull()
  })
  it('routes Skills as a settings child without a sixth primary entry', async () => {
    expect(isKnownHash('skills')).toBe(true)
    const navigate = vi.fn()
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(DesktopNavigation, {
          activeView: 'skills',
          pages: [...pages, { id: 'skills', name: 'Skills' }],
          onNavigate: navigate,
        }),
    })
    app.use(i18n).mount(root)
    await nextTick()
    const primary = root.querySelectorAll<HTMLButtonElement>('.activity-bar button')
    expect(primary).toHaveLength(5)
    expect(primary[4]!.getAttribute('aria-current')).toBeNull()
    expect(
      [...root.querySelectorAll<HTMLButtonElement>('.desktop-sidebar button')].some((button) =>
        button.textContent?.includes('Skills'),
      ),
    ).toBe(false)
    primary[4]!.click()
    expect(navigate).toHaveBeenCalledWith('skills')
  })
  it('blocks code handoff when the saved-version catalog cannot be read', async () => {
    vi.spyOn(runtimeApi, 'prototypeVersions').mockRejectedValue(new Error('offline'))
    vi.spyOn(runtimeApi, 'workspaceBaseline').mockResolvedValue({
      path: 'x',
      exists: false,
      baseHash: '',
      denial: 'AUTHORIZED_ROOT_MISSING',
    })
    vi.spyOn(runtimeApi, 'workspaceSource').mockResolvedValue({
      path: 'x',
      exists: false,
      baseHash: '',
      bytes: 0,
      excerpt: '',
      denial: 'SOURCE_UNAVAILABLE',
    })
    const navigate = vi.fn()
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () => h(ScenarioWorkspace, { pluginHost: readyPluginHost, onNavigate: navigate }),
    })
    app.use(i18n).mount(root)
    await nextTick()
    ;(
      root
        .querySelector('[data-testid="scene-open-detail"][data-scene-id="prototype-to-code"]')
        ?.querySelector('button') as HTMLButtonElement
    ).click()
    await nextTick()
    ;(root.querySelector('[data-testid="scene-enter-workflow"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(root!.querySelector('[role="alert"]')).not.toBeNull())
    const develop = root.querySelector('[data-testid="scenario-develop"]') as HTMLButtonElement
    expect(develop.disabled).toBe(true)
    develop.click()
    expect(navigate).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('eap.chat.prototype')).toBeNull()
  })
  it('opens settings and scenes without losing access to existing tools', async () => {
    const selected: string[] = []
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(DesktopNavigation, { activeView: 'sql', pages, onNavigate: (id) => selected.push(id) }),
    })
    app.use(i18n).mount(root)
    const buttons = root.querySelectorAll('.activity-bar button')
    expect(buttons.length).toBe(5)
    ;(buttons[4] as HTMLButtonElement).click()
    await nextTick()
    expect(selected.at(-1)).toBe('model-settings')
    expect(root.querySelector('.desktop-sidebar')?.textContent).not.toContain('plugins')
    expect(root.querySelector('.settings-search')).toBeNull()
    expect(root.querySelector('[data-testid="back-to-source-session"]')).toBeNull()
    expect(root.querySelector('[data-testid="project-tree"]')).not.toBeNull()
    ;(buttons[2] as HTMLButtonElement).click()
    await nextTick()
    expect(selected.at(-1)).toBe('scenes')
    expect(root.querySelector('[data-testid="open-scenedesigner"]')).not.toBeNull()
    expect(root.querySelector('[data-testid="project-tree"]')).toBeNull()
    expect(root.querySelector('[data-testid="new-chat"]')).toBeNull()
    expect(root.querySelector('[data-testid="sidebar-tools"]')).toBeNull()
    expect(root.querySelector('[data-testid="back-to-chat"]')).toBeNull()
    expect(root.querySelector('[data-testid="back-to-source-session"]')).toBeNull()
    expect(root.querySelector('.desktop-sidebar')?.textContent).not.toMatch(
      /返回来源会话|Back to source session/,
    )
    expect(root.querySelector('.desktop-sidebar')?.textContent).not.toContain('原型到代码')
    ;(buttons[3] as HTMLButtonElement).click()
    await nextTick()
    expect(selected.at(-1)).toBe('experts')
    expect(root.querySelector('[data-testid="project-tree"]')).toBeNull()
    expect(root.querySelector('.settings-search')).toBeNull()
    expect(root.textContent).toContain('我的专家')
    expect(root.querySelector('[data-testid="back-to-chat"]')).toBeNull()
  })
  it.each(['builder-alpha', 'builder-beta'])(
    'keeps %s inside scenes after arriving from settings or code',
    async (id) => {
      const active = ref('model-settings')
      root = document.createElement('div')
      document.body.append(root)
      app = createApp({
        render: () =>
          h(DesktopNavigation, {
            activeView: active.value,
            pages,
            onNavigate: (next: string) => {
              active.value = next
            },
          }),
      })
      app.use(i18n).mount(root)
      active.value = id
      await nextTick()
      const buttons = root.querySelectorAll<HTMLButtonElement>('.activity-bar button')
      expect(buttons).toHaveLength(5)
      expect(buttons[2].getAttribute('aria-current')).toBe('page')
      buttons[0].click()
      await nextTick()
      active.value = id
      await nextTick()
      expect(buttons[2].getAttribute('aria-current')).toBe('page')
      buttons[2].click()
      await nextTick()
      expect(active.value).toBe('scenes')
    },
  )
  it('places a local-group session apart from an unbound chat', async () => {
    workbench.selectedProjectId = 'local-eap'
    workbench.sessionExtras = {
      'in-project': { scenarioId: null, experts: [], resources: [], projectId: 'local-eap' },
      free: { scenarioId: null, experts: [], resources: [], projectId: null },
    }
    chatBinding.value = {
      history: [
        {
          id: 'in-project',
          title: '侧栏调整',
          archived: false,
          updatedAt: '2026-10-27T08:05:00.000Z',
        },
        { id: 'free', title: '随便问问', archived: false },
      ],
      activeId: 'in-project',
      references: [],
      draft: '',
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
      select: () => {},
      create: () => {},
    }
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () => h(DesktopNavigation, { activeView: 'chat', pages, onNavigate: () => {} }),
    })
    app.use(i18n).mount(root)
    expect(root.querySelector('[data-testid="project-tree"]')).not.toBeNull()
    expect(root.textContent).not.toMatch(/不是仓库文件树|not a repository file tree/)
    const project = root.querySelector('[data-testid="project-local-eap"]')
    const unbound = root.querySelector('[data-testid="unbound-sessions"]')
    expect(project?.getAttribute('data-expanded')).toBe('true')
    expect(project?.textContent).toContain('侧栏调整')
    expect(project?.querySelector('[data-testid="open-board"]')?.textContent).toMatch(
      /任务看板|Task board/,
    )
    const projectSession = [...project!.querySelectorAll('.nav.child')].find((el) =>
      el.textContent?.includes('侧栏调整'),
    )
    expect(projectSession?.querySelector('small')?.textContent).toBeTruthy()
    expect(projectSession?.parentElement?.querySelector('[aria-label="会话操作"]')).toBeTruthy()
    const rename = vi.fn()
    chatBinding.value = { ...chatBinding.value, rename }
    await nextTick()
    const actions = project!.querySelector('[aria-label="会话操作"]') as HTMLButtonElement
    actions.click()
    await nextTick()
    expect(actions.getAttribute('aria-expanded')).toBe('true')
    const renameButton = [...document.querySelectorAll('.session-menu button')].find(
      (el) => el.textContent === '重命名',
    ) as HTMLButtonElement
    renameButton.click()
    await nextTick()
    expect(rename).toHaveBeenCalledWith('in-project')
    await vi.waitFor(() => expect(document.querySelector('.session-menu')).toBeNull())
    expect(unbound?.textContent).toContain('随便问问')
    expect(unbound?.querySelector('.nav.child small')).toBeNull()
    ;(root.querySelector('[data-testid="archived-sessions"]') as HTMLButtonElement).click()
    await nextTick()
    expect(root.textContent).not.toContain('侧栏调整')
    expect(root.textContent).toContain('暂无会话')
    expect(root.querySelector('[data-testid="new-unbound"]')).toBeNull()
    const created = vi.fn()
    chatBinding.value = { ...chatBinding.value!, create: created }
    await nextTick()
    ;(root.querySelector('[data-testid="new-chat"]') as HTMLButtonElement).click()
    expect(created).toHaveBeenCalledOnce()
    expect(workbench.selectedProjectId).toBe('local-eap')
    ;(
      root.querySelector(
        '[data-testid="project-local-eap"] .tree-project-label',
      ) as HTMLButtonElement
    ).click()
    expect(workbench.selectedProjectId).toBeNull()
    chatBinding.value = null
  })
  it('expands and collapses a local group without inventing a repository file tree', async () => {
    workbench.selectedProjectId = null
    chatBinding.value = {
      history: [],
      activeId: null,
      references: [],
      draft: '',
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
      select: () => {},
      create: () => {},
    }
    const navigated: string[] = []
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(DesktopNavigation, { activeView: 'chat', pages, onNavigate: (id) => navigated.push(id) }),
    })
    app.use(i18n).mount(root)
    const project = root.querySelector('[data-testid="project-local-eap"]') as HTMLElement
    expect(project.getAttribute('data-expanded')).toBe('false')
    expect(project.querySelector('[data-testid="project-children"]')).toBeNull()
    ;(project.querySelector('[data-testid="project-expand"]') as HTMLButtonElement).click()
    await nextTick()
    expect(project.getAttribute('data-expanded')).toBe('true')
    expect(project.querySelector('[data-testid="project-empty"]')?.textContent).toMatch(
      /暂无会话|No sessions/,
    )
    expect(project.querySelector('[data-testid="open-board"]')?.textContent?.trim()).toBe(
      '任务看板',
    )
    expect(project.querySelectorAll('.tree-branch-label')).toHaveLength(0)
    ;(project.querySelector('[data-testid="open-board"]') as HTMLButtonElement).click()
    await nextTick()
    expect(navigated.at(-1)).toBe('board')
    expect(workbench.sidebarOpen).toBe(false)
  })
  it('starts a group chat from the project row and a free chat from the free section', async () => {
    workbench.selectedProjectId = null
    const selected: string[] = []
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(DesktopNavigation, { activeView: 'chat', pages, onNavigate: (id) => selected.push(id) }),
    })
    app.use(i18n).mount(root)
    expect(root.querySelector('[data-testid="new-free-chat"]')?.textContent).toMatch(
      /新建自由对话|New free chat/,
    )
    expect(root.querySelector('[data-testid="project-new-chat"]')).toBeNull()
    ;(root.querySelector('[data-testid="project-actions"]') as HTMLButtonElement).click()
    await nextTick()
    ;(document.querySelector('[data-testid="project-new-chat"]') as HTMLButtonElement).click()
    await nextTick()
    expect(workbench.selectedProjectId).toBe('local-eap')
    expect(selected.at(-1)).toBe('chat')
    ;(root.querySelector('[data-testid="new-free-chat"]') as HTMLButtonElement).click()
    await nextTick()
    expect(workbench.selectedProjectId).toBeNull()
    expect(selected.at(-1)).toBe('chat')
  })
  it('switches the real local workspace from the sidebar header without starting a chat', async () => {
    const created = createLocalProject('文档分组')!
    workbench.selectedProjectId = 'local-eap'
    const navigate = vi.fn()
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () => h(DesktopNavigation, { activeView: 'chat', pages, onNavigate: navigate }),
    })
    app.use(i18n).mount(root)
    const head = root.querySelector('[data-testid="sidebar-head"]') as HTMLElement
    expect(head.querySelector('[data-testid="workspace-switcher-name"]')?.textContent).toContain(
      'EAP',
    )
    expect(head.textContent).not.toContain('code · 编程')
    ;(head.querySelector('[data-testid="workspace-switcher"]') as HTMLButtonElement).click()
    await nextTick()
    expect(
      document.querySelector('[data-testid="workspace-project-local-eap"]')?.textContent,
    ).toContain('EAP')
    expect(
      document.querySelector(`[data-testid="workspace-project-${created.id}"]`)?.textContent,
    ).toContain('文档分组')
    ;(
      document.querySelector(`[data-testid="workspace-project-${created.id}"]`) as HTMLButtonElement
    ).click()
    await nextTick()
    expect(workbench.selectedProjectId).toBe(created.id)
    expect(head.querySelector('[data-testid="workspace-switcher-name"]')?.textContent).toContain(
      '文档分组',
    )
    expect(navigate).not.toHaveBeenCalled()
    ;(head.querySelector('[data-testid="workspace-switcher"]') as HTMLButtonElement).click()
    await nextTick()
    ;(document.querySelector('[data-testid="workspace-free"]') as HTMLButtonElement).click()
    await nextTick()
    expect(workbench.selectedProjectId).toBeNull()
    expect(head.querySelector('[data-testid="workspace-switcher-name"]')?.textContent).toMatch(
      /自由对话|Free chat/,
    )
    expect(navigate).not.toHaveBeenCalled()
  })
  it('keeps the workspace sidebar when the active view is a settings section', async () => {
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(DesktopNavigation, {
          activeView: 'model-settings',
          pages,
        }),
    })
    app.use(i18n).mount(root)
    await nextTick()
    const head = root.querySelector('[data-testid="sidebar-head"]') as HTMLElement
    expect(head.querySelector('[data-testid="workspace-switcher"]')).not.toBeNull()
    expect(root.querySelector('.settings-search')).toBeNull()
    expect(root.querySelector('[data-testid="back-to-source-session"]')).toBeNull()
    expect(root.querySelector('[data-testid="project-tree"]')).not.toBeNull()
  })
  it('seeds a journal draft from the free section and filters the project tree', async () => {
    workbench.selectedProjectId = 'local-eap'
    workbench.pendingDraft = ''
    workbench.pendingNewChat = false
    workbench.sessionExtras = {
      'in-project': { scenarioId: null, experts: [], resources: [], projectId: 'local-eap' },
      'free-one': { scenarioId: null, experts: [], resources: [], projectId: null },
    }
    chatBinding.value = {
      history: [
        { id: 'in-project', title: '侧栏调整', archived: false },
        { id: 'free-one', title: '自由对话', archived: false },
      ],
      activeId: 'in-project',
      references: [],
      draft: '',
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
      select: () => {},
      create: () => {
        workbench.pendingNewChat = true
      },
    }
    const selected: string[] = []
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(DesktopNavigation, { activeView: 'chat', pages, onNavigate: (id) => selected.push(id) }),
    })
    app.use(i18n).mount(root)
    await nextTick()
    expect(root.querySelector('[data-testid="today-journal"]')?.textContent).toMatch(
      /记录今天的 AI 工作|Record today's AI work/,
    )
    expect(root.querySelector('[data-testid="sidebar-filter"]')).not.toBeNull()
    ;(root.querySelector('[data-testid="today-journal"]') as HTMLButtonElement).click()
    await nextTick()
    expect(workbench.selectedProjectId).toBeNull()
    expect(workbench.pendingDraft).toMatch(/只读总结|read-only/i)
    expect(selected.at(-1)).toBe('chat')
    const filter = root.querySelector('[data-testid="sidebar-filter"]') as HTMLInputElement
    filter.value = '侧栏'
    filter.dispatchEvent(new Event('input'))
    await nextTick()
    expect(root.querySelector('[data-testid="project-local-eap"]')).not.toBeNull()
    expect(root.textContent).toContain('侧栏调整')
    expect(root.querySelector('[data-testid="free-chat-empty"]')).not.toBeNull()
    workbench.pendingDraft = ''
    workbench.pendingNewChat = false
  })
  it('leaves source browsing to the conversation header', async () => {
    workbench.selectedProjectId = 'local-eap'
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () => h(DesktopNavigation, { activeView: 'chat', pages, onNavigate: () => {} }),
    })
    app.use(i18n).mount(root)
    await nextTick()
    expect(root.querySelector('[data-testid="browse-repository"]')).toBeNull()
    expect(root.querySelector('[data-testid="repo-files"]')).toBeNull()
    expect(root.querySelector('.desktop-sidebar')?.textContent).not.toMatch(/源文件|Files/)
  })
  it('creates, renames, and deletes local groups without inventing repository folders', async () => {
    workbench.selectedProjectId = 'local-eap'
    workbench.sessionExtras = {
      'in-project': { scenarioId: null, experts: [], resources: [], projectId: 'local-eap' },
    }
    chatBinding.value = {
      history: [{ id: 'in-project', title: '侧栏调整', archived: false }],
      activeId: 'in-project',
      references: [],
      draft: '',
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
      select: () => {},
      create: () => {},
    }
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () => h(DesktopNavigation, { activeView: 'chat', pages, onNavigate: () => {} }),
    })
    app.use(i18n).mount(root)
    ;(root.querySelector('[data-testid="new-project"]') as HTMLButtonElement).click()
    await nextTick()
    const createInput = root.querySelector(
      '[data-testid="project-create-input"]',
    ) as HTMLInputElement
    createInput.value = 'Demo 分组'
    createInput.dispatchEvent(new Event('input'))
    ;(root.querySelector('[data-testid="project-create-save"]') as HTMLButtonElement).click()
    await nextTick()
    expect(root.querySelector('[data-testid="project-create"]')).toBeNull()
    expect(workbench.selectedProjectId).not.toBe('local-eap')
    const createdId = workbench.selectedProjectId!
    expect(root.querySelector(`[data-testid="project-${createdId}"]`)?.textContent).toContain(
      'Demo 分组',
    )
    const createdNode = root.querySelector(`[data-testid="project-${createdId}"]`) as HTMLElement
    ;(createdNode.querySelector('[data-testid="project-actions"]') as HTMLButtonElement).click()
    await nextTick()
    ;(document.querySelector('[data-testid="project-rename-action"]') as HTMLButtonElement).click()
    await nextTick()
    const renameInput = root.querySelector(
      '[data-testid="project-rename-input"]',
    ) as HTMLInputElement
    renameInput.value = '演示仓'
    renameInput.dispatchEvent(new Event('input'))
    ;(root.querySelector('[data-testid="project-rename-save"]') as HTMLButtonElement).click()
    await nextTick()
    expect(createdNode.textContent).toContain('演示仓')
    const eap = root.querySelector('[data-testid="project-local-eap"]') as HTMLElement
    ;(eap.querySelector('[data-testid="project-actions"]') as HTMLButtonElement).click()
    await nextTick()
    ;(document.querySelector('[data-testid="project-delete-action"]') as HTMLButtonElement).click()
    await nextTick()
    expect(eap.querySelector('[data-testid="project-delete-confirm"]')?.textContent).toMatch(
      /删除本机分组|Delete local group/,
    )
    ;(eap.querySelector('[data-testid="project-delete-confirm-yes"]') as HTMLButtonElement).click()
    await nextTick()
    expect(root.querySelector('[data-testid="project-local-eap"]')).toBeNull()
    expect(workbench.sessionExtras['in-project']?.projectId).toBeNull()
    expect(root.querySelector('[data-testid="unbound-sessions"]')?.textContent).toContain(
      '侧栏调整',
    )
    const only = root.querySelector(`[data-testid="project-${createdId}"]`) as HTMLElement
    ;(only.querySelector('[data-testid="project-actions"]') as HTMLButtonElement).click()
    await nextTick()
    expect(
      (document.querySelector('[data-testid="project-delete-action"]') as HTMLButtonElement)
        .disabled,
    ).toBe(true)
  })
  it('restores the last page in an area and recognizes the work landing page', async () => {
    const active = ref('work')
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(DesktopNavigation, {
          activeView: active.value,
          pages,
          onNavigate: (id) => {
            active.value = id
          },
        }),
    })
    app.use(i18n).mount(root)
    const buttons = root.querySelectorAll('.activity-bar button')
    expect(buttons[1].getAttribute('aria-current')).toBe('page')
    active.value = 'sql'
    await nextTick()
    ;(buttons[4] as HTMLButtonElement).click()
    await nextTick()
    ;(buttons[0] as HTMLButtonElement).click()
    await nextTick()
    expect(active.value).toBe('sql')
  })
  it('requires a saved version before entering code chat', async () => {
    vi.spyOn(runtimeApi, 'prototypeVersions').mockResolvedValue({
      items: [
        {
          id: 'saved-version',
          sourceRef: 'builder-alpha',
          title: 'Saved',
          body: '',
          acceptance: [],
          contentHash: 'hash',
        },
      ],
    })
    vi.spyOn(runtimeApi, 'workspaceBaseline').mockResolvedValue({
      path: 'x',
      exists: false,
      baseHash: '',
      denial: 'AUTHORIZED_ROOT_MISSING',
    })
    const selected: string[] = []
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({
      render: () =>
        h(ScenarioWorkspace, {
          pluginHost: disabledPluginHost,
          onNavigate: (id) => selected.push(id),
        }),
    })
    app.use(i18n).mount(root)
    await nextTick()
    ;(
      root
        .querySelector('[data-testid="scene-open-detail"][data-scene-id="prototype-to-code"]')
        ?.querySelector('button') as HTMLButtonElement
    ).click()
    await nextTick()
    ;(root.querySelector('[data-testid="scene-enter-workflow"]') as HTMLButtonElement).click()
    await vi.waitFor(() => expect(root!.querySelectorAll('option').length).toBeGreaterThan(1))
    expect(
      (root.querySelector('[data-testid="scenario-open-prototype"]') as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(
      (root.querySelector('[data-testid="scenario-open-versions"]') as HTMLButtonElement).disabled,
    ).toBe(true)
    const develop = root.querySelector('[data-testid="scenario-develop"]') as HTMLButtonElement
    expect(develop.disabled).toBe(true)
    const select = root.querySelector('[data-testid="scenario-version"]') as HTMLSelectElement
    select.value = 'saved-version'
    select.dispatchEvent(new Event('change'))
    await nextTick()
    develop.click()
    await nextTick()
    expect(selected).toEqual([])
    expect(sessionStorage.getItem('eap.chat.prototype')).toBeNull()
    expect(root.querySelector('[data-testid="prototype-flow"]')).toBeNull()
    expect(root.querySelector('[data-testid="delivery-gate"]')).toBeTruthy()
    expect(root.querySelector('[data-testid="host-notes"]')).toBeNull()
    expect(root.textContent).not.toMatch(/不接受远端多租户|multi-tenant grant store/i)
  })
  it('renders session status chips only from real fields and a real-count storage card', async () => {
    workbench.selectedProjectId = 'local-eap'
    workbench.sessionExtras = {
      drafting: { scenarioId: null, experts: [], resources: [], projectId: 'local-eap' },
      verified: { scenarioId: null, experts: [], resources: [], projectId: 'local-eap' },
      plain: { scenarioId: null, experts: [], resources: [], projectId: 'local-eap' },
    }
    chatBinding.value = {
      history: [
        {
          id: 'drafting',
          title: '草稿会话',
          archived: false,
          draft: 'unfinished',
          updatedAt: '2026-10-27T08:05:00.000Z',
        },
        {
          id: 'verified',
          title: '已核对会话',
          archived: false,
          updatedAt: '2026-10-26T08:05:00.000Z',
        },
        { id: 'plain', title: '普通会话', archived: false },
      ],
      activeId: 'verified',
      busyIds: [],
      references: [],
      draft: '',
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
      appliedFiles: [],
      verificationChecks: [{ name: 'typecheck', exitCode: 0, summary: '' }],
      verification: 'passed',
      select: () => {},
      create: () => {},
    }
    root = document.createElement('div')
    document.body.append(root)
    app = createApp({ render: () => h(DesktopNavigation, { activeView: 'chat', pages }) })
    app.use(i18n).mount(root)
    await nextTick()

    const rows = [...root.querySelectorAll('[data-testid="session-status"]')]
    // Only two sessions have real evidence: a local draft and a fully verified
    // active session. The plain session must not invent a "completed" chip.
    expect(rows.length).toBe(2)
    const drafting = [...root.querySelectorAll('.session-row')].find((r) =>
      r.textContent?.includes('草稿会话'),
    )
    expect(
      drafting?.querySelector('[data-testid="session-status"]')?.getAttribute('data-status'),
    ).toBe('draft')
    const verified = [...root.querySelectorAll('.session-row')].find((r) =>
      r.textContent?.includes('已核对会话'),
    )
    expect(
      verified?.querySelector('[data-testid="session-status"]')?.getAttribute('data-status'),
    ).toBe('verified')
    const plain = [...root.querySelectorAll('.session-row')].find((r) =>
      r.textContent?.includes('普通会话'),
    )
    expect(plain?.querySelector('[data-testid="session-status"]')).toBeNull()

    const storage = root.querySelector('[data-testid="sidebar-storage-card"]')
    expect(storage).not.toBeNull()
    expect(storage?.getAttribute('data-groups')).toBe('1')
    expect(storage?.getAttribute('data-sessions')).toBe('3')
    // No invented byte/MB figures from the prototype mock.
    expect(storage?.textContent).not.toMatch(/\d+\s*MB/i)
  })
})
describe('source-surface return through the real App navigation', () => {
  let shellApp: App
  let shellRoot: HTMLDivElement
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
    shellRoot = document.createElement('div')
    document.body.append(shellRoot)
  })

  afterEach(() => {
    shellApp?.unmount()
    shellRoot?.remove()
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
    shellApp = createApp(Shell).use(i18n)
    shellApp.mount(shellRoot)
    await settle()
  }

  async function click(selector: string) {
    let button: HTMLButtonElement | null = null
    await vi.waitFor(() => {
      button = shellRoot.querySelector<HTMLButtonElement>(selector)
      expect(button, `Required control: ${selector}`).not.toBeNull()
    })
    button!.click()
    await settle()
  }

  async function settle() {
    for (let i = 0; i < 8; i++) await nextTick()
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

  it.each([
    ['work', '', 'work'],
    ['code', '', 'chat'],
    ['work', 'model-settings', 'work'],
    ['code', 'unknown-view', 'chat'],
  ] as const)('falls back in %s mode when source is "%s"', async (mode, origin, target) => {
    workbench.workMode = mode
    workbench.origin = origin
    await mountSource('model-settings')
    expect(shellRoot.querySelector('[data-testid="back-to-source-session"]')).toBeNull()
    ;(shellRoot.querySelector('[data-testid="settings-dialog-close"]') as HTMLButtonElement).click()
    await settle()
    expect(window.location.hash).toBe(`#${target}`)
    expectSourceIntact(mode)
  })

  it('opens expert management from a catalog hash without creating a session', async () => {
    chatBinding.value = null
    workbench.origin = ''
    workbench.workMode = 'work'
    await mountSource('expert-catalog')
    expect(window.location.hash).toBe('#experts')
    expect(shellRoot.querySelector('[data-testid="back-to-source-session"]')).toBeNull()
    expect(shellRoot.querySelector('[data-testid="expert-roles-nav"]')).toBeNull()
    expect(shellRoot.querySelector('[data-testid="expert-catalog"]')).toBeNull()
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
    'opens expert management from %s in %s mode without a return-to-session path',
    async (source, mode) => {
      workbench.workMode = mode
      await mountSource(source)
      const origin = workbench.origin
      await click('.activity-bar button:nth-child(4)')
      expect(window.location.hash).toBe('#experts')
      expect(workbench.origin).toBe(origin)
      expect(shellRoot.querySelector('[data-testid="back-to-source-session"]')).toBeNull()
      expect(shellRoot.querySelector('[data-testid="expert-roles-nav"]')).toBeNull()
      await click('.activity-bar button:nth-child(5)')
      expect(workbench.origin).toBe(origin)
      expect(shellRoot.querySelector('[data-testid="back-to-source-session"]')).toBeNull()
      expectSourceIntact(mode)
    },
  )

  it('keeps the Work source stable across settings children and returns without resetting it', async () => {
    await mountSource()
    await click('.activity-bar button:nth-child(5)')
    expect(window.location.hash).toBe('#model-settings')
    expect(workbench.workMode).toBe('work')
    expect(shellRoot.querySelector('[data-testid="project-tree"]')).not.toBeNull()
    expect(shellRoot.querySelector('[data-testid="back-to-source-session"]')).toBeNull()
    const dialog = shellRoot.querySelector('[data-testid="settings-dialog"]') as HTMLDialogElement
    expect(dialog.open).toBe(true)
    const rules = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(
      (button) => button.textContent === '规则库',
    )
    expect(rules).toBeDefined()
    rules!.click()
    await nextTick()
    expect(window.location.hash).toBe('#rules')
    expect(shellRoot.querySelector('[data-testid="back-to-source-session"]')).toBeNull()
    ;(dialog.querySelector('[data-testid="settings-dialog-close"]') as HTMLButtonElement).click()
    await nextTick()
    expect(window.location.hash).toBe('#work')
    expectSourceIntact()
    await click('.activity-bar button:nth-child(5)')
    expect(window.location.hash).toBe('#rules')
    expect(workbench.workMode).toBe('work')
    expect(workbench.origin).toBe('chat')
  })

  it('keeps the Work session intact while expert management stays a configuration area', async () => {
    await mountSource()
    await click('.activity-bar button:nth-child(4)')
    expect(window.location.hash).toBe('#experts')
    expect(workbench.origin).toBe('chat')
    expect(shellRoot.querySelector('[data-testid="project-tree"]')).toBeNull()
    expect(shellRoot.querySelector('[data-testid="back-to-source-session"]')).toBeNull()
    expect(shellRoot.querySelector('[data-testid="expert-roles-nav"]')).toBeNull()
    expect(shellRoot.querySelector('[data-testid="expert-list-nav"]')).not.toBeNull()
    expect(shellRoot.querySelector('[data-testid="expert-catalog"]')).toBeNull()
    expectSourceIntact()
    expect(currentExtras().experts).toHaveLength(0)
  })
})

describe('prototype area deep links through the real App', () => {
  let shellApp: App
  let shellRoot: HTMLDivElement

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
      create: vi.fn(),
      select: vi.fn(),
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
    shellRoot = document.createElement('div')
    document.body.append(shellRoot)
  })

  afterEach(() => {
    shellApp?.unmount()
    shellRoot?.remove()
    window.history.replaceState(null, '', '/')
    chatBinding.value = null
    workbench.origin = 'chat'
    workbench.workMode = 'code'
    workbench.sessionExtras = {}
    localStorage.clear()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  async function mountSource(hash = 'work') {
    window.history.replaceState(null, '', `/#${hash}`)
    shellApp = createApp(Shell).use(i18n)
    shellApp.mount(shellRoot)
    for (let i = 0; i < 8; i++) await nextTick()
  }

  it('opens the settings dialog on #settings over the code workspace', async () => {
    await mountSource('settings')
    const dialog = shellRoot.querySelector('[data-testid="settings-dialog"]') as HTMLDialogElement
    expect(dialog.open).toBe(true)
    expect(dialog.querySelector('.settings-search')).not.toBeNull()
    expect(shellRoot.querySelector('[data-testid="back-to-source-session"]')).toBeNull()
    expect(shellRoot.querySelector('[data-testid="project-tree"]')).not.toBeNull()
    expect(
      shellRoot.querySelector('.activity-bar button:nth-child(1)')?.getAttribute('aria-current'),
    ).toBe('page')
    expect(
      shellRoot.querySelector('.activity-bar button:nth-child(5)')?.getAttribute('aria-current'),
    ).toBeNull()
  })

  it('opens the code area on #code', async () => {
    await mountSource('code')
    expect(
      (shellRoot.querySelector('[data-testid="settings-dialog"]') as HTMLDialogElement).open,
    ).toBe(false)
    expect(shellRoot.querySelector('.desktop-sidebar .settings-search')).toBeNull()
    expect(
      shellRoot.querySelector('.activity-bar button:nth-child(1)')?.getAttribute('aria-current'),
    ).toBe('page')
  })
})
