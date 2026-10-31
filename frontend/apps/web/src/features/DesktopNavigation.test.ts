// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { chatBinding, workbench } from './shell/workbench';
import { resetLocalBridgeForTests } from './shell/localBridge';
import { resetLocalProjectsForTests } from './shell/localProjects';
import { workspaceDirty } from './shell/runtimeIdentity';
import { runtimeApi } from '@eap/runtime-client';
import { createApp, h, nextTick, ref, type App } from 'vue';
import { i18n } from '../lib/i18n';
import DesktopNavigation from './DesktopNavigation.vue';
import ScenarioWorkspace from './ScenarioWorkspace.vue';
import { resetScenarioWorkspaceState } from './shell/scenarioWorkspaceState';
vi.mock('grapesjs', () => { throw new Error('Canvas is browser-tested'); });
let app: App | undefined;
let root: HTMLDivElement | undefined;
beforeEach(() => {
  resetScenarioWorkspaceState();
  vi.spyOn(runtimeApi, 'aiStatus').mockRejectedValue(new Error('No local service in unit tests'));
  vi.spyOn(runtimeApi, 'workspaceDirty').mockResolvedValue({ requested: false, denial: 'AUTHORIZED_ROOT_MISSING', count: 0, paths: [], detail: '' });
  vi.spyOn(runtimeApi, 'workspaceSource').mockResolvedValue({ path: '', exists: false, baseHash: '', bytes: 0, excerpt: '', denial: 'SOURCE_UNAVAILABLE' });
  vi.spyOn(runtimeApi, 'workspaceBaseline').mockResolvedValue({ path: '', exists: false, baseHash: '', denial: 'AUTHORIZED_ROOT_MISSING' });
  workbench.preview = false;
  workbench.selectedScenario = 'prototype-to-code';
  resetLocalProjectsForTests();
  resetLocalBridgeForTests();
  workspaceDirty.value = null;
  delete window.eap;
  delete window.eapDesktop;
});
afterEach(() => {
  app?.unmount();
  root?.remove();
  vi.restoreAllMocks();
  sessionStorage.clear();
  localStorage.clear();
  chatBinding.value = null;
  resetLocalProjectsForTests();
  resetLocalBridgeForTests();
  workspaceDirty.value = null;
  delete window.eap;
  delete window.eapDesktop;
  workbench.sessionExtras = {};
  workbench.pendingDraft = '';
  workbench.pendingNewChat = false;
});
const pages = ['chat', 'sql', 'experts', 'model-settings', 'plugins', 'builder-alpha', 'builder-beta'].map(id => ({ id, name: id }));
describe('desktop navigation', () => {
  it('blocks code handoff when the saved-version catalog cannot be read', async () => {
    vi.spyOn(runtimeApi, 'prototypeVersions').mockRejectedValue(new Error('offline'));
    vi.spyOn(runtimeApi, 'workspaceBaseline').mockResolvedValue({ path: 'x', exists: false, baseHash: '', denial: 'AUTHORIZED_ROOT_MISSING' });
    vi.spyOn(runtimeApi, 'workspaceSource').mockResolvedValue({ path: 'x', exists: false, baseHash: '', bytes: 0, excerpt: '', denial: 'SOURCE_UNAVAILABLE' });
    const navigate = vi.fn();
    root = document.createElement('div'); document.body.append(root);
    app = createApp({ render: () => h(ScenarioWorkspace, { builderEnabled: true, chatEnabled: true, onNavigate: navigate }) });
    app.use(i18n).mount(root);
    await nextTick();
    (root.querySelector('[data-testid="scene-open-detail"][data-scene-id="prototype-to-code"]') as HTMLButtonElement).click();
    await nextTick();
    (root.querySelector('[data-testid="scene-enter-workflow"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(root!.querySelector('[role="alert"]')).not.toBeNull());
    const develop = root.querySelector('[data-testid="scenario-develop"]') as HTMLButtonElement;
    expect(develop.disabled).toBe(true);
    develop.click();
    expect(navigate).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('eap.chat.prototype')).toBeNull();
  });
  it('opens settings and scenes without losing access to existing tools', async () => {
    const selected: string[] = [];
    root = document.createElement('div'); document.body.append(root);
    app = createApp({ render: () => h(DesktopNavigation, { activeView: 'sql', pages, onNavigate: id => selected.push(id) }) });
    app.use(i18n).mount(root);
    const buttons = root.querySelectorAll('.activity-bar button');
    expect(buttons.length).toBe(5);
    (buttons[4] as HTMLButtonElement).click(); await nextTick();
    expect(selected.at(-1)).toBe('model-settings');
    expect(root.querySelector('.desktop-sidebar')?.textContent).toContain('plugins');
    (buttons[2] as HTMLButtonElement).click(); await nextTick();
    expect(selected.at(-1)).toBe('scenes');
    expect(root.querySelector('[data-testid="project-tree"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="new-chat"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="back-to-chat"]')).toBeNull();
    expect(root.querySelector('.desktop-sidebar')?.textContent).not.toMatch(/返回来源会话|Back to source session/);
    expect(root.querySelector('.desktop-sidebar')?.textContent).not.toContain('原型到代码');
    (buttons[3] as HTMLButtonElement).click(); await nextTick();
    expect(selected.at(-1)).toBe('expert-catalog');
    expect(root.querySelector('[data-testid="project-tree"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="back-to-chat"]')).toBeNull();
  });
  it.each(['builder-alpha', 'builder-beta'])('keeps %s inside scenes after arriving from settings or code', async (id) => {
    const active = ref('model-settings');
    root = document.createElement('div'); document.body.append(root);
    app = createApp({ render: () => h(DesktopNavigation, { activeView: active.value, pages, onNavigate: (next: string) => { active.value = next; } }) });
    app.use(i18n).mount(root);
    active.value = id; await nextTick();
    const buttons = root.querySelectorAll<HTMLButtonElement>('.activity-bar button');
    expect(buttons).toHaveLength(5);
    expect(buttons[2].getAttribute('aria-current')).toBe('page');
    buttons[0].click(); await nextTick();
    active.value = id; await nextTick();
    expect(buttons[2].getAttribute('aria-current')).toBe('page');
    buttons[2].click(); await nextTick();
    expect(active.value).toBe('scenes');
  });
  it('places a local-group session apart from an unbound chat', async () => {
    workbench.selectedProjectId = 'local-eap';
    workbench.sessionExtras = {
      'in-project': { scenarioId: null, experts: [], resources: [], projectId: 'local-eap' },
      free: { scenarioId: null, experts: [], resources: [], projectId: null },
    };
    chatBinding.value = {
      history: [{ id: 'in-project', title: '侧栏调整', archived: false, updatedAt: '2026-10-27T08:05:00.000Z' }, { id: 'free', title: '随便问问', archived: false }],
      activeId: 'in-project', references: [], draft: '', sending: false, workspaceLabel: '', memory: '', model: '', connectionName: '',
      approval: 'review', goal: 'chat', executionMode: 'chat', scenarioId: null, proposalFiles: [], verification: 'not_requested',
      select: () => {}, create: () => {},
    };
    root = document.createElement('div'); document.body.append(root);
    app = createApp({ render: () => h(DesktopNavigation, { activeView: 'chat', pages, onNavigate: () => {} }) });
    app.use(i18n).mount(root);
    expect(root.querySelector('[data-testid="project-tree"]')).not.toBeNull();
    expect(root.textContent).not.toMatch(/不是仓库文件树|not a repository file tree/);
    const project = root.querySelector('[data-testid="project-local-eap"]');
    const unbound = root.querySelector('[data-testid="unbound-sessions"]');
    expect(project?.getAttribute('data-expanded')).toBe('true');
    expect(project?.textContent).toContain('侧栏调整');
    expect(project?.querySelector('[data-testid="open-board"]')?.textContent).toMatch(/任务看板|Task board/);
    const projectSession = [...project!.querySelectorAll('.nav.child')].find((el) => el.textContent?.includes('侧栏调整'));
    expect(projectSession?.querySelector('small')?.textContent).toBeTruthy();
    expect(projectSession?.parentElement?.querySelector('[aria-label="会话操作"]')).toBeTruthy();
    const rename = vi.fn();
    chatBinding.value = { ...chatBinding.value, rename };
    await nextTick();
    const actions = project!.querySelector('[aria-label="会话操作"]') as HTMLButtonElement;
    actions.click(); await nextTick();
    expect(actions.getAttribute('aria-expanded')).toBe('true');
    const renameButton = [...document.querySelectorAll('.session-menu button')].find((el) => el.textContent === '重命名') as HTMLButtonElement;
    renameButton.click(); await nextTick();
    expect(rename).toHaveBeenCalledWith('in-project');
    await vi.waitFor(() => expect(document.querySelector('.session-menu')).toBeNull());
    expect(unbound?.textContent).toContain('随便问问');
    expect(unbound?.querySelector('.nav.child small')).toBeNull();
    (root.querySelector('[data-testid="archived-sessions"]') as HTMLButtonElement).click(); await nextTick();
    expect(root.textContent).not.toContain('侧栏调整');
    expect(root.textContent).toContain('暂无会话');
    expect(root.querySelector('[data-testid="new-unbound"]')).toBeNull();
    const created = vi.fn();
    chatBinding.value = { ...chatBinding.value!, create: created };
    await nextTick();
    (root.querySelector('[data-testid="new-chat"]') as HTMLButtonElement).click();
    expect(created).toHaveBeenCalledOnce();
    expect(workbench.selectedProjectId).toBe('local-eap');
    (root.querySelector('[data-testid="project-local-eap"] .tree-project-label') as HTMLButtonElement).click();
    expect(workbench.selectedProjectId).toBeNull();
    chatBinding.value = null;
  });
  it('expands and collapses a local group without inventing a repository file tree', async () => {
    workbench.selectedProjectId = null;
    chatBinding.value = {
      history: [], activeId: null, references: [], draft: '', sending: false, workspaceLabel: '', memory: '', model: '', connectionName: '',
      approval: 'review', goal: 'chat', executionMode: 'chat', scenarioId: null, proposalFiles: [], verification: 'not_requested',
      select: () => {}, create: () => {},
    };
    const navigated: string[] = [];
    root = document.createElement('div'); document.body.append(root);
    app = createApp({ render: () => h(DesktopNavigation, { activeView: 'chat', pages, onNavigate: id => navigated.push(id) }) });
    app.use(i18n).mount(root);
    const project = root.querySelector('[data-testid="project-local-eap"]') as HTMLElement;
    expect(project.getAttribute('data-expanded')).toBe('false');
    expect(project.querySelector('[data-testid="project-children"]')).toBeNull();
    (project.querySelector('[data-testid="project-expand"]') as HTMLButtonElement).click(); await nextTick();
    expect(project.getAttribute('data-expanded')).toBe('true');
    expect(project.querySelector('[data-testid="project-empty"]')?.textContent).toMatch(/暂无会话|No sessions/);
    (project.querySelector('[data-testid="open-board"]') as HTMLButtonElement).click(); await nextTick();
    expect(navigated.at(-1)).toBe('board');
    expect(workbench.sidebarOpen).toBe(false);
  });
  it('starts a group chat from the project row and a free chat from the free section', async () => {
    workbench.selectedProjectId = null;
    const selected: string[] = [];
    root = document.createElement('div'); document.body.append(root);
    app = createApp({ render: () => h(DesktopNavigation, { activeView: 'chat', pages, onNavigate: id => selected.push(id) }) });
    app.use(i18n).mount(root);
    expect(root.querySelector('[data-testid="new-free-chat"]')?.textContent).toMatch(/新建自由对话|New free chat/);
    expect(root.querySelector('[data-testid="project-new-chat"]')).toBeNull();
    (root.querySelector('[data-testid="project-actions"]') as HTMLButtonElement).click();
    await nextTick();
    (document.querySelector('[data-testid="project-new-chat"]') as HTMLButtonElement).click();
    await nextTick();
    expect(workbench.selectedProjectId).toBe('local-eap');
    expect(selected.at(-1)).toBe('chat');
    (root.querySelector('[data-testid="new-free-chat"]') as HTMLButtonElement).click();
    await nextTick();
    expect(workbench.selectedProjectId).toBeNull();
    expect(selected.at(-1)).toBe('chat');
  });
  it('seeds a journal draft from the free section and filters the project tree', async () => {
    workbench.selectedProjectId = 'local-eap';
    workbench.pendingDraft = '';
    workbench.pendingNewChat = false;
    workbench.sessionExtras = {
      'in-project': { scenarioId: null, experts: [], resources: [], projectId: 'local-eap' },
      'free-one': { scenarioId: null, experts: [], resources: [], projectId: null },
    };
    chatBinding.value = {
      history: [
        { id: 'in-project', title: '侧栏调整', archived: false },
        { id: 'free-one', title: '自由对话', archived: false },
      ],
      activeId: 'in-project', references: [], draft: '', sending: false, workspaceLabel: '', memory: '', model: '', connectionName: '',
      approval: 'review', goal: 'chat', executionMode: 'chat', scenarioId: null, proposalFiles: [], verification: 'not_requested',
      select: () => {}, create: () => { workbench.pendingNewChat = true; },
    };
    const selected: string[] = [];
    root = document.createElement('div'); document.body.append(root);
    app = createApp({ render: () => h(DesktopNavigation, { activeView: 'chat', pages, onNavigate: id => selected.push(id) }) });
    app.use(i18n).mount(root);
    await nextTick();
    expect(root.querySelector('[data-testid="today-journal"]')?.textContent).toMatch(/记录今天的 AI 工作|Record today's AI work/);
    expect(root.querySelector('[data-testid="sidebar-filter"]')).not.toBeNull();
    (root.querySelector('[data-testid="today-journal"]') as HTMLButtonElement).click();
    await nextTick();
    expect(workbench.selectedProjectId).toBeNull();
    expect(workbench.pendingDraft).toMatch(/只读总结|read-only/i);
    expect(selected.at(-1)).toBe('chat');
    const filter = root.querySelector('[data-testid="sidebar-filter"]') as HTMLInputElement;
    filter.value = '侧栏';
    filter.dispatchEvent(new Event('input'));
    await nextTick();
    expect(root.querySelector('[data-testid="project-local-eap"]')).not.toBeNull();
    expect(root.textContent).toContain('侧栏调整');
    expect(root.querySelector('[data-testid="free-chat-empty"]')).not.toBeNull();
    workbench.pendingDraft = '';
    workbench.pendingNewChat = false;
  });
  it('leaves source browsing to the conversation header', async () => {
    workbench.selectedProjectId = 'local-eap';
    root = document.createElement('div'); document.body.append(root);
    app = createApp({ render: () => h(DesktopNavigation, { activeView: 'chat', pages, onNavigate: () => {} }) });
    app.use(i18n).mount(root);
    await nextTick();
    expect(root.querySelector('[data-testid="browse-repository"]')).toBeNull();
    expect(root.querySelector('[data-testid="repo-files"]')).toBeNull();
    expect(root.querySelector('.desktop-sidebar')?.textContent).not.toMatch(/源文件|Files/);
  });
  it('creates, renames, and deletes local groups without inventing repository folders', async () => {
    workbench.selectedProjectId = 'local-eap';
    workbench.sessionExtras = {
      'in-project': { scenarioId: null, experts: [], resources: [], projectId: 'local-eap' },
    };
    chatBinding.value = {
      history: [{ id: 'in-project', title: '侧栏调整', archived: false }],
      activeId: 'in-project', references: [], draft: '', sending: false, workspaceLabel: '', memory: '', model: '', connectionName: '',
      approval: 'review', goal: 'chat', executionMode: 'chat', scenarioId: null, proposalFiles: [], verification: 'not_requested',
      select: () => {}, create: () => {},
    };
    root = document.createElement('div'); document.body.append(root);
    app = createApp({ render: () => h(DesktopNavigation, { activeView: 'chat', pages, onNavigate: () => {} }) });
    app.use(i18n).mount(root);
    (root.querySelector('[data-testid="new-project"]') as HTMLButtonElement).click(); await nextTick();
    const createInput = root.querySelector('[data-testid="project-create-input"]') as HTMLInputElement;
    createInput.value = 'Demo 分组';
    createInput.dispatchEvent(new Event('input'));
    (root.querySelector('[data-testid="project-create-save"]') as HTMLButtonElement).click(); await nextTick();
    expect(root.querySelector('[data-testid="project-create"]')).toBeNull();
    expect(workbench.selectedProjectId).not.toBe('local-eap');
    const createdId = workbench.selectedProjectId!;
    expect(root.querySelector(`[data-testid="project-${createdId}"]`)?.textContent).toContain('Demo 分组');
    const createdNode = root.querySelector(`[data-testid="project-${createdId}"]`) as HTMLElement;
    (createdNode.querySelector('[data-testid="project-actions"]') as HTMLButtonElement).click(); await nextTick();
    (document.querySelector('[data-testid="project-rename-action"]') as HTMLButtonElement).click(); await nextTick();
    const renameInput = root.querySelector('[data-testid="project-rename-input"]') as HTMLInputElement;
    renameInput.value = '演示仓';
    renameInput.dispatchEvent(new Event('input'));
    (root.querySelector('[data-testid="project-rename-save"]') as HTMLButtonElement).click(); await nextTick();
    expect(createdNode.textContent).toContain('演示仓');
    const eap = root.querySelector('[data-testid="project-local-eap"]') as HTMLElement;
    (eap.querySelector('[data-testid="project-actions"]') as HTMLButtonElement).click(); await nextTick();
    (document.querySelector('[data-testid="project-delete-action"]') as HTMLButtonElement).click(); await nextTick();
    expect(eap.querySelector('[data-testid="project-delete-confirm"]')?.textContent).toMatch(/删除本机分组|Delete local group/);
    (eap.querySelector('[data-testid="project-delete-confirm-yes"]') as HTMLButtonElement).click(); await nextTick();
    expect(root.querySelector('[data-testid="project-local-eap"]')).toBeNull();
    expect(workbench.sessionExtras['in-project']?.projectId).toBeNull();
    expect(root.querySelector('[data-testid="unbound-sessions"]')?.textContent).toContain('侧栏调整');
    const only = root.querySelector(`[data-testid="project-${createdId}"]`) as HTMLElement;
    (only.querySelector('[data-testid="project-actions"]') as HTMLButtonElement).click(); await nextTick();
    expect((document.querySelector('[data-testid="project-delete-action"]') as HTMLButtonElement).disabled).toBe(true);
  });
  it('restores the last page in an area and recognizes the work landing page', async () => {
    const active = ref('work');
    root = document.createElement('div'); document.body.append(root);
    app = createApp({ render: () => h(DesktopNavigation, { activeView: active.value, pages, onNavigate: id => { active.value = id; } }) });
    app.use(i18n).mount(root);
    const buttons = root.querySelectorAll('.activity-bar button');
    expect(buttons[1].getAttribute('aria-current')).toBe('page');
    active.value = 'sql'; await nextTick();
    (buttons[4] as HTMLButtonElement).click(); await nextTick();
    (buttons[0] as HTMLButtonElement).click(); await nextTick();
    expect(active.value).toBe('sql');
  });
  it('requires a saved version before entering code chat', async () => {
    vi.spyOn(runtimeApi, 'prototypeVersions').mockResolvedValue({ items: [{ id: 'saved-version', sourceRef: 'builder-alpha', title: 'Saved', body: '', buttonPresses: 0, interaction: '', acceptance: [], contentHash: 'hash' }] });
    vi.spyOn(runtimeApi, 'workspaceBaseline').mockResolvedValue({ path: 'x', exists: false, baseHash: '', denial: 'AUTHORIZED_ROOT_MISSING' });
    const selected: string[] = [];
    root = document.createElement('div'); document.body.append(root);
    app = createApp({ render: () => h(ScenarioWorkspace, { builderEnabled: false, chatEnabled: true, onNavigate: id => selected.push(id) }) });
    app.use(i18n).mount(root);
    await nextTick();
    (root.querySelector('[data-testid="scene-open-detail"][data-scene-id="prototype-to-code"]') as HTMLButtonElement).click();
    await nextTick();
    (root.querySelector('[data-testid="scene-enter-workflow"]') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(root!.querySelectorAll('option').length).toBeGreaterThan(1));
    expect((root.querySelector('[data-testid="scenario-open-prototype"]') as HTMLButtonElement).disabled).toBe(true);
    expect((root.querySelector('[data-testid="scenario-open-versions"]') as HTMLButtonElement).disabled).toBe(true);
    const develop = root.querySelector('[data-testid="scenario-develop"]') as HTMLButtonElement;
    expect(develop.disabled).toBe(true);
    const select = root.querySelector('[data-testid="scenario-version"]') as HTMLSelectElement;
    select.value = 'saved-version'; select.dispatchEvent(new Event('change')); await nextTick();
    develop.click(); await nextTick();
    expect(selected).toEqual([]);
    expect(sessionStorage.getItem('eap.chat.prototype')).toBeNull();
    expect(root.querySelector('[data-testid="prototype-flow"]')).toBeNull();
    expect(root.querySelector('[data-testid="delivery-gate"]')).toBeTruthy();
    expect(root.querySelector('[data-testid="host-notes"]')).toBeNull();
    expect(root.textContent).not.toMatch(/不接受远端多租户|multi-tenant grant store/i);
  });
});
