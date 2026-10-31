// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from 'vite-plus/test';
import { createApp, h, ref, type App } from 'vue';
import { AxiosError } from 'axios';
import { runtimeApi, type BoardRun, type BoardRunPage, type BoardTask } from '@eap/runtime-client';
import { i18n } from '../../lib/i18n';
import BoardRunPanel from './BoardRunPanel.vue';
const task: BoardTask = { id: 'task-a', projectId: 'project-a', title: '检查仓库', column: 'ready', goal: '收集证据', acceptanceCriteria: '人工核对输出', notes: '', priority: 'none', sessionId: '', revision: 3, events: ['created'], executionActive: false, preparationIssues: [], allowedColumns: ['planned', 'ready'] };
const availability = { allowed: true, workspacePath: 'F:/authorized/sample', workspaceLabel: 'sample', reason: '' };
const run = (status = 'SUCCEEDED'): BoardRun => ({ requestId: '08a79b0a-af5a-4e54-8bd9-499f9f147b77', taskRevision: 3, task: { title: task.title, goal: task.goal, acceptanceCriteria: task.acceptanceCriteria }, execution: { id: 'run-1', missionId: 'mission-1', status, capability: 'git-status', principal: 'local-operator', approval: 'NOT_REQUIRED', workspacePath: availability.workspacePath, workspaceLabel: 'sample', executable: 'git', stdout: 'untracked evidence.txt', stderr: '', startedAt: '2026-10-31T08:00:00Z', finishedAt: null, exitCode: status === 'SUCCEEDED' ? 0 : null } });
let app: App, root: HTMLDivElement;
let current = ref(task);
async function mount() {
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(BoardRunPanel, { task: current.value }) }); app.use(i18n).mount(root);
  await vi.waitFor(() => expect(root.querySelector('[data-testid=board-run-workspace]')).not.toBeNull());
}
const button = (id: string) => document.querySelector(`[data-testid=${id}]`) as HTMLButtonElement;
async function confirm() {
  button('board-run-start').click();
  await vi.waitFor(() => expect(document.querySelector('.eap-confirm__actions button:first-child')).not.toBeNull());
  (document.querySelector('.eap-confirm__actions button:first-child') as HTMLButtonElement).click();
}
beforeEach(() => {
  sessionStorage.clear(); current = ref({ ...task });
  vi.spyOn(runtimeApi, 'boardRuns').mockResolvedValue({ availability, items: [] });
  vi.spyOn(runtimeApi, 'startBoardRun').mockResolvedValue(run());
});
afterEach(() => { app?.unmount(); root?.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });
it('requires explicit confirmation of the server directory and shows actual output without completing the task', async () => {
  await mount(); button('board-run-start').click();
  await vi.waitFor(() => expect(document.querySelector('.eap-confirm__actions button:first-child')).not.toBeNull());
  expect(runtimeApi.startBoardRun).not.toHaveBeenCalled();
  expect(document.querySelector('.eap-confirm-box')?.textContent ?? document.body.textContent).toContain(availability.workspacePath);
  vi.mocked(runtimeApi.boardRuns).mockResolvedValue({ availability, items: [run()] });
  (document.querySelector('.eap-confirm__actions button:first-child') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(runtimeApi.startBoardRun).toHaveBeenCalledWith(task.id, expect.objectContaining({ projectId: task.projectId, revision: 3, workspacePath: availability.workspacePath, requestId: expect.any(String) })));
  await vi.waitFor(() => expect(root.textContent).toContain('untracked evidence.txt'));
  expect(root.textContent).toContain('任务仍未经过独立验证和人工验收');
  expect(current.value.column).toBe('ready');
});
it('retains the same request across an unknown outcome and remount', async () => {
  vi.mocked(runtimeApi.startBoardRun).mockRejectedValueOnce(new AxiosError('network down'));
  await mount(); await confirm();
  await vi.waitFor(() => expect(root.querySelector('[data-testid=board-run-retry]')).not.toBeNull());
  const original = vi.mocked(runtimeApi.startBoardRun).mock.calls[0]![1];
  app.unmount(); root.remove(); await mount();
  expect(button('board-run-start').disabled).toBe(true);
  button('board-run-retry').click();
  await vi.waitFor(() => expect(runtimeApi.startBoardRun).toHaveBeenCalledTimes(2));
  expect(vi.mocked(runtimeApi.startBoardRun).mock.calls[1]![1]).toEqual(original);
});
it('reconciles a persisted unknown request from the server snapshot without starting again', async () => {
  const saved = run();
  sessionStorage.setItem('eap.board-run.v1.task-a', JSON.stringify({ projectId: task.projectId, revision: 3, requestId: saved.requestId, workspacePath: availability.workspacePath }));
  vi.mocked(runtimeApi.boardRuns).mockResolvedValue({ availability, items: [saved] });
  await mount(); await vi.waitFor(() => expect(root.textContent).toContain('已找到原启动请求'));
  expect(sessionStorage.getItem('eap.board-run.v1.task-a')).toBeNull(); expect(runtimeApi.startBoardRun).not.toHaveBeenCalled();
});
it('keeps an unknown execution blocking and stops automatic polling', async () => {
  vi.useFakeTimers(); const unknown = run('RUNNING'); unknown.execution.unconfirmedReason = 'restart unknown';
  vi.mocked(runtimeApi.boardRuns).mockResolvedValue({ availability, items: [unknown] });
  await mount(); await vi.advanceTimersByTimeAsync(10_000);
  expect(root.textContent).toContain('结果待确认'); expect(button('board-run-start').disabled).toBe(true);
  expect(runtimeApi.boardRuns).toHaveBeenCalledTimes(1);
});
it('bounds polling and preserves a last known run during a read failure', async () => {
  vi.useFakeTimers(); vi.mocked(runtimeApi.boardRuns).mockResolvedValue({ availability, items: [run('RUNNING')] });
  await mount(); await vi.advanceTimersByTimeAsync(122_000);
  expect(root.textContent).toContain('自动刷新已暂停');
  expect(runtimeApi.boardRuns).toHaveBeenCalledTimes(61);
  vi.mocked(runtimeApi.boardRuns).mockRejectedValueOnce(new Error('offline'));
  button('board-run-refresh').click(); await vi.waitFor(() => expect(root.textContent).toContain('读取运行记录失败'));
  expect(root.textContent).toContain('untracked evidence.txt');
});
it('ignores a previous task response after switching projects', async () => {
  let resolve!: (page: BoardRunPage) => void;
  vi.mocked(runtimeApi.boardRuns).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(BoardRunPanel, { task: current.value }) }); app.use(i18n).mount(root);
  current.value = { ...task, id: 'task-b', projectId: 'project-b' };
  await vi.waitFor(() => expect(runtimeApi.boardRuns).toHaveBeenCalledWith('task-b', 'project-b'));
  resolve({ availability, items: [run()] });
  await Promise.resolve(); await Promise.resolve();
  expect(root.textContent).not.toContain('untracked evidence.txt');
  expect(runtimeApi.startBoardRun).not.toHaveBeenCalled();
});
