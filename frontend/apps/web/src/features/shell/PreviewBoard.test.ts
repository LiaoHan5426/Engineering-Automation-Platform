// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { createApp, type App } from 'vue';
import { runtimeApi } from '@eap/runtime-client';
import { createMockChatBackend } from '../../../mock/chatBackend';
import { i18n } from '../../lib/i18n';
import PreviewBoard from './PreviewBoard.vue';
import { chatBinding, workbench, type ChatBinding } from './workbench';
vi.mock('node:url', () => ({ fileURLToPath: () => '/mock/workspace/' }));
let app: App, root: HTMLDivElement;
const detail = () => document.querySelector('[data-testid=board-detail]') as HTMLElement | null;
beforeEach(() => {
  const mock = createMockChatBackend();
  const call = async (method: string, path: string, body = {}) => { const reply = await mock.handle(method, path, body); if (reply.status >= 400) throw new Error('rejected'); return JSON.parse(JSON.stringify(reply.data)); };
  vi.spyOn(runtimeApi, 'boardTasks').mockImplementation(id => call('GET', '/board/tasks?projectId=' + id));
  vi.spyOn(runtimeApi, 'createBoardTask').mockImplementation((projectId, title, column, sessionId = '') => call('POST', '/board/tasks', { projectId, title, column, sessionId }));
  vi.spyOn(runtimeApi, 'updateBoardTask').mockImplementation((id, body) => call('POST', '/board/tasks/' + id, body));
});
afterEach(() => { app?.unmount(); root?.remove(); vi.restoreAllMocks(); workbench.pendingBoardDraft = null; chatBinding.value = null; });
it('persists backlog task edits through the service and refuses invented execution', async () => {
  root = document.createElement('div'); document.body.append(root); app = createApp(PreviewBoard); app.use(i18n).mount(root);
  await vi.waitFor(() => expect(runtimeApi.boardTasks).toHaveBeenCalled());
  await vi.waitFor(() => expect((root.querySelector("[data-testid=board-create-task]") as HTMLButtonElement).disabled).toBe(false));
  Array.from(root.querySelectorAll('button')).find(item => item.textContent?.includes('新建任务'))!.click();
  await vi.waitFor(() => expect(root.querySelector('form')).not.toBeNull());
  const input = root.querySelector('form input') as HTMLInputElement; input.value = '验收任务'; input.dispatchEvent(new Event('input'));
  (root.querySelector('form') as HTMLFormElement).requestSubmit();
  await vi.waitFor(() => expect(root.querySelector('[data-testid=lane-planned]')?.textContent).toContain('验收任务'));
  await vi.waitFor(() => expect(detail()).not.toBeNull());
  expect(document.querySelector('[data-testid=board-detail-dialog]')).not.toBeNull();
  const move = (name: string) => Array.from(detail()!.querySelectorAll('.task-moves button')).find(item => item.textContent === name)!.click();
  move('进行中'); expect(runtimeApi.updateBoardTask).not.toHaveBeenCalled();
  move('待处理'); await vi.waitFor(() => expect(root.querySelector('[data-testid=lane-ready]')?.textContent).toContain('验收任务'));
  const notes = detail()!.querySelector('textarea') as HTMLTextAreaElement; notes.value = '保存备注'; notes.dispatchEvent(new Event('input'));
  await vi.waitFor(() => expect((Array.from(detail()!.querySelectorAll('button')).find(item => item.textContent === '保存') as HTMLButtonElement).disabled).toBe(false));
  Array.from(detail()!.querySelectorAll('button')).find(item => item.textContent === '保存')!.click();
  await vi.waitFor(() => expect(root.textContent).toMatch(/备注已保存|任务修改已保存|Notes saved|Task fields saved/));
  move('已完成'); expect(root.querySelector('[data-testid=lane-done]')?.textContent).not.toContain('验收任务');
  const args = vi.mocked(runtimeApi.createBoardTask).mock.calls[0]!;
  const persisted = await runtimeApi.boardTasks(args[0]); expect(persisted.items[0]?.notes).toBe('保存备注');
});

it('filters by notes and saved priority using the same service contract', async () => {
  root = document.createElement('div'); document.body.append(root); app = createApp(PreviewBoard); app.use(i18n).mount(root);
  await vi.waitFor(() => expect(runtimeApi.boardTasks).toHaveBeenCalled());
  await vi.waitFor(() => expect((root.querySelector("[data-testid=board-create-task]") as HTMLButtonElement).disabled).toBe(false));
  (root.querySelector('[data-testid=board-create-task]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(root.querySelector('form')).not.toBeNull());
  const input = root.querySelector('form input') as HTMLInputElement;
  input.value = '优先级筛选任务';
  input.dispatchEvent(new Event('input'));
  (root.querySelector('form') as HTMLFormElement).requestSubmit();
  await vi.waitFor(() => expect(root.textContent).toContain('优先级筛选任务'));
  await vi.waitFor(() => expect(detail()).not.toBeNull());
  const notes = detail()!.querySelector('textarea') as HTMLTextAreaElement;
  notes.value = '标签:迁移验收';
  notes.dispatchEvent(new Event('input'));
  const rank = detail()!.querySelector('[data-testid=task-priority]') as HTMLSelectElement;
  rank.value = 'p0'; rank.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect((Array.from(detail()!.querySelectorAll('button')).find(item => item.textContent === '保存') as HTMLButtonElement).disabled).toBe(false));
  Array.from(detail()!.querySelectorAll('button')).find((item) => item.textContent === '保存')!.click();
  await vi.waitFor(() => expect(root.textContent).toMatch(/备注已保存|任务修改已保存|Notes saved|Task fields saved/));
  const search = root.querySelector('[data-testid=board-search]') as HTMLInputElement;
  search.value = '迁移验收';
  search.dispatchEvent(new Event('input'));
  await vi.waitFor(() => expect(root.textContent).toContain('优先级筛选任务'));
  search.value = '';
  search.dispatchEvent(new Event('input'));
  const priority = root.querySelector('[data-testid=board-priority]') as HTMLSelectElement;
  expect(priority.value).toBe('all');
  priority.value = 'p0';
  priority.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(root.querySelector('.board-card')?.textContent).toContain('优先级筛选任务'));
  priority.value = 'p2'; priority.dispatchEvent(new Event('change'));
  await vi.waitFor(() => expect(root.querySelector('[data-testid=board-filter-empty]')?.textContent).toMatch(/没有符合|No tasks match/i));
  expect(root.querySelectorAll('.board-card')).toHaveLength(0);
  expect(root.querySelector('[data-testid=board-unattended-badge]')?.textContent).toMatch(/无人值守未接通|Unattended is off/);
});

it('links the active conversation id on create without inventing execution', async () => {
  chatBinding.value = {
    history: [], activeId: 'conv-link-9', references: [], draft: '', sending: false, workspaceLabel: '', memory: '',
    model: '', connectionName: '', approval: 'review', goal: 'chat', executionMode: 'chat', scenarioId: null,
    proposalFiles: [], verification: 'not_requested', select: () => {}, create: () => {},
  } as ChatBinding;
  root = document.createElement('div'); document.body.append(root); app = createApp(PreviewBoard); app.use(i18n).mount(root);
  await vi.waitFor(() => expect((root.querySelector('[data-testid=board-create-task]') as HTMLButtonElement).disabled).toBe(false));
  (root.querySelector('[data-testid=board-create-task]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(root.querySelector('[data-testid=board-link-session]')?.textContent).toMatch(/关联当前对话|Link current/));
  const input = root.querySelector('[data-testid=board-create-form] input:not([type=checkbox])') as HTMLInputElement;
  input.value = '关联会话任务'; input.dispatchEvent(new Event('input'));
  (root.querySelector('[data-testid=board-create-form]') as HTMLFormElement).requestSubmit();
  await vi.waitFor(() => expect(runtimeApi.createBoardTask).toHaveBeenCalledWith(expect.any(String), '关联会话任务', 'planned', 'conv-link-9'));
  await vi.waitFor(() => expect(root.querySelector('[data-testid=card-session]')?.textContent).toMatch(/会话|Session/));
  await vi.waitFor(() => expect(document.querySelector('[data-testid=task-session]')?.textContent).toMatch(/已关联|Linked/));
  expect(root.querySelector('[data-testid=card-priority]')?.className).toMatch(/prio-none/);
});

it('opens task detail as a modal and protects unsaved edits on close', async () => {
  root = document.createElement('div'); document.body.append(root); app = createApp(PreviewBoard); app.use(i18n).mount(root);
  await vi.waitFor(() => expect(runtimeApi.boardTasks).toHaveBeenCalled());
  await vi.waitFor(() => expect((root.querySelector("[data-testid=board-create-task]") as HTMLButtonElement).disabled).toBe(false));
  (root.querySelector('[data-testid=lane-ready] [data-testid=lane-add-task]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(root.querySelector('form input')).not.toBeNull());
  const title = root.querySelector('form input') as HTMLInputElement; title.value = '待处理列创建'; title.dispatchEvent(new Event('input'));
  (root.querySelector('form') as HTMLFormElement).requestSubmit();
  await vi.waitFor(() => expect(root.querySelector('[data-testid=lane-ready] .board-card')?.textContent).toContain('待处理列创建'));
  await vi.waitFor(() => expect(document.querySelector('[data-testid=board-detail-dialog] [role=dialog]')).not.toBeNull());
  const notes = detail()!.querySelector('textarea') as HTMLTextAreaElement; notes.value = '尚未保存'; notes.dispatchEvent(new Event('input'));
  (document.querySelector('[data-testid=board-close-detail]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(document.querySelector('[data-confirm-cancel]')).not.toBeNull());
  (document.querySelector('[data-confirm-cancel]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(document.querySelector('[data-confirm-cancel]')).toBeNull());
  expect((detail()!.querySelector('textarea') as HTMLTextAreaElement).value).toBe('尚未保存');
  expect(runtimeApi.updateBoardTask).not.toHaveBeenCalled();
});
