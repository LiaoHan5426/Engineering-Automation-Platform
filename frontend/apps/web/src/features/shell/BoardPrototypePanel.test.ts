// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { createApp, h, ref, type App } from 'vue';
import { AxiosError } from 'axios';
import { runtimeApi, type BoardTask, type PrototypeVersionRecord } from '@eap/runtime-client';
import { i18n } from '../../lib/i18n';
import BoardPrototypePanel from './BoardPrototypePanel.vue';
import PrototypeVersionViewer from './PrototypeVersionViewer.vue';
const task: BoardTask = { id: 'task-a', projectId: 'project-a', title: '任务', column: 'ready', goal: '原目标', acceptanceCriteria: '原验收条件', notes: '', priority: 'none', sessionId: '', revision: 1, events: ['created'], executionActive: false, prototypeVersionId: null, preparationIssues: [], allowedColumns: ['planned', 'ready'] };
const a: PrototypeVersionRecord = { id: 'design-a', sourceRef: 'builder-alpha', title: '设计 A', body: 'stored text A', buttonPresses: 0, interaction: '', acceptance: ['已检查设计'], contentHash: 'hash-a', createdAt: '2026-10-31T08:00:00Z' };
const b: PrototypeVersionRecord = { ...a, id: 'design-b', title: '设计 B', contentHash: 'hash-b' };
let app: App, root: HTMLDivElement, current = ref({ ...task });
const button = (id: string) => document.querySelector(`[data-testid=${id}]`) as HTMLButtonElement;
async function mount() {
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(BoardPrototypePanel, { task: current.value, onSaved: (saved: BoardTask) => { current.value = saved; } }) }); app.use(i18n).mount(root);
  await vi.waitFor(() => expect(root.querySelectorAll('option')).toHaveLength(3));
}
function choose(id: string) { const select = button('board-prototype-select') as unknown as HTMLSelectElement; select.value = id; select.dispatchEvent(new Event('change')); }
beforeEach(() => {
  current = ref({ ...task });
  vi.spyOn(runtimeApi, 'prototypeVersions').mockImplementation(async source => ({ items: source === 'builder-alpha' ? [a, b] : [] }));
  vi.spyOn(runtimeApi, 'prototypeVersion').mockImplementation(async id => id === a.id ? a : b);
  vi.spyOn(runtimeApi, 'setBoardPrototype').mockImplementation(async (_id, selection) => ({ ...current.value, revision: current.value.revision + 1, prototypeVersionId: selection.versionId }));
});
afterEach(() => { app?.unmount(); root?.remove(); vi.restoreAllMocks(); });
it('sends only a saved version identity and preserves the task goal and acceptance criteria', async () => {
  await mount(); choose(a.id);
  await vi.waitFor(() => expect(button('board-prototype-save').disabled).toBe(false));
  expect(runtimeApi.setBoardPrototype).not.toHaveBeenCalled();
  button('board-prototype-save').click();
  await vi.waitFor(() => expect(runtimeApi.setBoardPrototype).toHaveBeenCalledWith(task.id, { projectId: task.projectId, revision: 1, versionId: a.id }));
  await vi.waitFor(() => expect(root.querySelector('[data-testid=board-prototype-current]')?.textContent).toContain('hash-a'));
  expect(current.value.goal).toBe(task.goal); expect(current.value.acceptanceCriteria).toBe(task.acceptanceCriteria);
  choose(''); await vi.waitFor(() => expect(button('board-prototype-save').disabled).toBe(false)); button('board-prototype-save').click();
  await vi.waitFor(() => expect(runtimeApi.setBoardPrototype).toHaveBeenLastCalledWith(task.id, { projectId: task.projectId, revision: 2, versionId: null }));
});
it('retains a selected choice on conflict and requires adopting the current task revision', async () => {
  vi.mocked(runtimeApi.setBoardPrototype).mockImplementationOnce(async () => {
    current.value = { ...task, revision: 2, prototypeVersionId: b.id };
    throw new AxiosError('conflict', undefined, undefined, undefined, { status: 409 } as never);
  });
  await mount(); choose(a.id); await vi.waitFor(() => expect(button('board-prototype-save').disabled).toBe(false)); button('board-prototype-save').click();
  await vi.waitFor(() => expect(button('board-prototype-adopt')).not.toBeNull());
  expect((button('board-prototype-select') as unknown as HTMLSelectElement).value).toBe(a.id);
  expect(button('board-prototype-save').disabled).toBe(true);
  expect(root.querySelector('[data-testid=board-prototype-current]')?.textContent).toContain('设计 B');
  button('board-prototype-adopt').click();
  await vi.waitFor(() => expect((button('board-prototype-select') as unknown as HTMLSelectElement).value).toBe(b.id));
  expect(runtimeApi.setBoardPrototype).toHaveBeenCalledTimes(1);
});
it('blocks changing a design during an active or unknown run', async () => {
  current.value = { ...task, executionActive: true, prototypeVersionId: a.id };
  await mount(); expect(button('board-prototype-select').disabled).toBe(true); expect(button('board-prototype-save').disabled).toBe(true);
  expect(root.textContent).toContain('暂时不能变更原型关联'); expect(runtimeApi.setBoardPrototype).not.toHaveBeenCalled();
});
it('can reopen a linked older version missing from the latest version list', async () => {
  current.value = { ...task, prototypeVersionId: a.id };
  vi.mocked(runtimeApi.prototypeVersions).mockImplementation(async source => ({ items: source === 'builder-alpha' ? [b] : [] }));
  await mount(); expect(runtimeApi.prototypeVersion).toHaveBeenCalledWith(a.id);
  button('board-prototype-view-current').click();
  await vi.waitFor(() => expect(document.querySelector('[data-testid=prototype-version-viewer]')).not.toBeNull());
  expect(document.querySelector('[data-testid=prototype-version-viewer]')?.textContent).toContain('stored text A');
});
it('renders the semantic saved version without changing stored content', async () => {
  const version = { ...a, body: JSON.stringify({ format: 'eap-prototype-v1', schema: { version: 1, title: 'saved', updatedAt: 'now', root: { id: 'root', kind: 'page', props: {}, children: [{ id: 'button', kind: 'button', props: { text: '保存预览按钮' }, children: [] }] } } }) };
  vi.mocked(runtimeApi.prototypeVersion).mockResolvedValue(version);
  root = document.createElement('div'); document.body.append(root); app = createApp(PrototypeVersionViewer, { versionId: a.id, expectedHash: a.contentHash }); app.use(i18n).mount(root);
  await vi.waitFor(() => expect(document.querySelector('[data-testid=semantic-preview]')).not.toBeNull());
  expect(runtimeApi.setBoardPrototype).not.toHaveBeenCalled();
});
it('blocks a Run preview when the server hash differs from its frozen reference', async () => {
  root = document.createElement('div'); document.body.append(root); app = createApp(PrototypeVersionViewer, { versionId: a.id, expectedHash: 'old-hash' }); app.use(i18n).mount(root);
  await vi.waitFor(() => expect(document.body.textContent).toContain('已阻止预览'));
  expect(document.body.textContent).not.toContain('stored text A'); expect(document.querySelector('[data-testid=semantic-preview]')).toBeNull();
});
it('shows non-semantic content as escaped text instead of executing embedded HTML', async () => {
  vi.mocked(runtimeApi.prototypeVersion).mockResolvedValue({ ...a, body: '<script>window.designInjected=true</script><button>raw</button>' });
  root = document.createElement('div'); document.body.append(root); app = createApp(PrototypeVersionViewer, { versionId: a.id }); app.use(i18n).mount(root);
  await vi.waitFor(() => expect(document.body.textContent).toContain('没有可用的语义预览'));
  expect(document.querySelector('[data-testid=prototype-version-viewer] script')).toBeNull();
  expect(document.querySelector('[data-testid=prototype-version-viewer] pre')?.textContent).toContain('<script>');
});
