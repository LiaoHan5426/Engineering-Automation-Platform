// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from 'vite-plus/test';
import { createApp, h, nextTick, ref, type App } from 'vue';
import { AxiosError } from 'axios';
import { runtimeApi, type BoardRun, type BoardVerificationPlan, type BoardVerificationRecord, type BoardVerificationPage } from '@eap/runtime-client';
import { i18n } from '../../lib/i18n';
import BoardRunVerification from './BoardRunVerification.vue';
const run: BoardRun = { requestId: 'request-a', taskRevision: 1, task: { title: 'Check', goal: 'Inspect', acceptanceCriteria: 'Review checks' }, execution: { id: 'run-a', missionId: 'mission-a', status: 'SUCCEEDED', capability: 'git-status', principal: 'local-operator', approval: 'NOT_REQUIRED', workspacePath: '/authorized/repo', workspaceLabel: 'repo', executable: 'git', stdout: '', stderr: '', startedAt: '2026-10-31T08:00:00Z', finishedAt: '2026-10-31T08:00:01Z', exitCode: 0 } };
const plan: BoardVerificationPlan = { planHash: 'plan-hash', workspacePath: '/authorized/repo', baseCommit: 'commit', source: { scope: 'frontend', contentHash: 'source-hash', files: [{ path: 'frontend/App.vue', contentHash: 'file-hash', bytes: 123 }], exclusions: ['node_modules', 'credentials'] }, commands: [{ id: 'typecheck', command: ['vp', 'exec', 'vue-tsc', '--build'], workingDirectory: '/authorized/repo/frontend', timeoutSeconds: 120 }] };
const record: BoardVerificationRecord = { id: 'verification-a', status: 'QUEUED', reason: '', plan, checks: [], sourceAfter: null, startedAt: '2026-10-31T08:01:00Z', finishedAt: null };
let app: App, root: HTMLDivElement, current = ref(run);
const button = (id: string) => document.querySelector(`[data-testid=${id}]`) as HTMLButtonElement;
async function mount(onChanged?: () => void) {
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(BoardRunVerification, { taskId: 'task-a', projectId: 'project-a', run: current.value, onChanged }) }); app.use(i18n).mount(root);
  await vi.waitFor(() => expect(runtimeApi.boardVerification).toHaveBeenCalled());
}
async function prepare() {
  await vi.waitFor(() => expect(button('verification-prepare')?.disabled).toBe(false)); button('verification-prepare').click();
  await vi.waitFor(() => expect(button('verification-start')).not.toBeNull());
}
async function confirm() {
  button('verification-start').click();
  await vi.waitFor(() => expect(document.querySelector('.eap-confirm__actions button:first-child')).not.toBeNull());
  expect(runtimeApi.startBoardVerification).not.toHaveBeenCalled();
  (document.querySelector('.eap-confirm__actions button:first-child') as HTMLButtonElement).click();
}
beforeEach(() => {
  current = ref(run);
  vi.spyOn(runtimeApi, 'boardVerification').mockResolvedValue({ record: null, prepareAllowed: true, reason: '' });
  vi.spyOn(runtimeApi, 'planBoardVerification').mockResolvedValue(plan);
  vi.spyOn(runtimeApi, 'startBoardVerification').mockResolvedValue(record);
});
afterEach(() => { app?.unmount(); root?.remove(); vi.restoreAllMocks(); vi.useRealTimers(); });
it('replays a RUNNING check with null finish time after remount without restarting', async () => {
  vi.useFakeTimers();
  const running: BoardVerificationRecord = { ...record, status: 'RUNNING', checks: [{ ...plan.commands[0]!, status: 'RUNNING', exitCode: null, stdout: '', stderr: '', truncated: false, processTreeCleanup: false, startedAt: record.startedAt, finishedAt: null }] };
  vi.mocked(runtimeApi.boardVerification).mockResolvedValue({ record: running, prepareAllowed: false, reason: '' });
  await mount();
  await vi.waitFor(() => expect(document.querySelector('.verification__check')?.textContent).toContain(i18n.global.t('boardVerification.status.RUNNING')));
  app.unmount(); root.remove();
  await mount();
  await vi.waitFor(() => expect(document.querySelector('[data-testid=verification-record]')?.textContent).toContain(record.id));
  expect(document.querySelector('.verification__check')?.textContent).toContain(i18n.global.t('boardVerification.no'));
  expect(document.querySelector('.verification__check')?.textContent).not.toContain(i18n.global.t('boardVerification.status.PASSED'));
  expect(button('verification-prepare')).toBeNull(); expect(button('verification-start')).toBeNull();
  await vi.advanceTimersByTimeAsync(3000);
  expect(runtimeApi.boardVerification).toHaveBeenCalledTimes(3);
  expect(runtimeApi.planBoardVerification).not.toHaveBeenCalled(); expect(runtimeApi.startBoardVerification).not.toHaveBeenCalled();
});
it('recovers an unplanned UNKNOWN after failed preparation and replays it without a fabricated plan', async () => {
  vi.useFakeTimers();
  const unknown: BoardVerificationRecord = { ...record, status: 'UNKNOWN', reason: 'BOARD_VERIFICATION_PROCESS_UNKNOWN', plan: null, workspacePath: plan.workspacePath };
  vi.mocked(runtimeApi.planBoardVerification).mockImplementationOnce(async () => {
    vi.mocked(runtimeApi.boardVerification).mockResolvedValue({ record: unknown, prepareAllowed: false, reason: 'BOARD_VERIFICATION_ALREADY_RECORDED' });
    throw new Error('preflight cleanup unknown');
  });
  const changed = vi.fn();
  await mount(changed);
  await vi.waitFor(() => expect(button('verification-prepare')?.disabled).toBe(false)); button('verification-prepare').click();
  await vi.waitFor(() => expect(document.querySelector('[data-testid=verification-record]')?.textContent).toContain(unknown.id));
  expect(changed).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).toContain(i18n.global.t('boardVerification.reason.BOARD_VERIFICATION_PROCESS_UNKNOWN'));
  expect(document.querySelector('[data-testid=verification-plan]')).toBeNull();
  expect(button('verification-prepare')).toBeNull(); expect(button('verification-start')).toBeNull();
  app.unmount(); root.remove(); await mount();
  await vi.waitFor(() => expect(document.querySelector('[data-testid=verification-record]')?.textContent).toContain(unknown.id));
  await vi.advanceTimersByTimeAsync(30_000);
  expect(runtimeApi.boardVerification).toHaveBeenCalledTimes(3);
  expect(runtimeApi.planBoardVerification).toHaveBeenCalledTimes(1); expect(runtimeApi.startBoardVerification).not.toHaveBeenCalled();
  expect(document.querySelector('[data-testid=verification-plan]')).toBeNull();
});
it('notifies the parent when polling observes verification completion without repeatedly notifying', async () => {
  vi.useFakeTimers();
  const changed = vi.fn();
  vi.mocked(runtimeApi.boardVerification).mockResolvedValue({ record: { ...record, status: 'RUNNING' }, prepareAllowed: false, reason: '' });
  await mount(changed);
  await vi.waitFor(() => expect(document.querySelector('[data-testid=verification-record]')).not.toBeNull());
  changed.mockClear();
  vi.mocked(runtimeApi.boardVerification).mockResolvedValue({ record: { ...record, status: 'PASSED', finishedAt: '2026-10-31T08:02:00Z' }, prepareAllowed: false, reason: '' });
  await vi.advanceTimersByTimeAsync(3000);
  expect(document.body.textContent).toContain(i18n.global.t('boardVerification.status.PASSED'));
  expect(changed).toHaveBeenCalledTimes(1);
  button('verification-refresh').click();
  await vi.advanceTimersByTimeAsync(30_000);
  expect(changed).toHaveBeenCalledTimes(1);
  expect(runtimeApi.boardVerification).toHaveBeenCalledTimes(3);
});
it('requires a source plan and side-effect confirmation before sending only the approved plan identity', async () => {
  await mount(); expect(runtimeApi.planBoardVerification).not.toHaveBeenCalled(); expect(runtimeApi.startBoardVerification).not.toHaveBeenCalled();
  await prepare();
  expect(runtimeApi.planBoardVerification).toHaveBeenCalledWith('task-a', 'run-a', { projectId: 'project-a', workspacePath: plan.workspacePath });
  expect(document.body.textContent).toContain('source-hash'); expect(document.body.textContent).toContain('vue-tsc');
  await confirm();
  await vi.waitFor(() => expect(runtimeApi.startBoardVerification).toHaveBeenCalledWith('task-a', 'run-a', { projectId: 'project-a', workspacePath: plan.workspacePath, planHash: 'plan-hash' }));
  expect(document.body.textContent).toContain('授权目录不是操作系统沙箱');
  expect(document.body.textContent).toContain('人工验收仍待完成');
});
it('recovers a lost start response by reading the persisted record without resending commands', async () => {
  vi.mocked(runtimeApi.startBoardVerification).mockImplementationOnce(async () => {
    vi.mocked(runtimeApi.boardVerification).mockResolvedValue({ record, prepareAllowed: false, reason: '' }); throw new Error('response lost');
  });
  await mount(); await prepare(); await confirm();
  await vi.waitFor(() => expect(document.querySelector('[data-testid=verification-record]')?.textContent).toContain('verification-a'));
  expect(runtimeApi.startBoardVerification).toHaveBeenCalledTimes(1);
  expect(runtimeApi.boardVerification).toHaveBeenCalledTimes(2);
  expect(document.body.textContent).toContain('已找回服务端验证记录');
});
it('replays persisted verification after remount without preparing or executing it again', async () => {
  vi.useFakeTimers();
  vi.mocked(runtimeApi.boardVerification).mockResolvedValue({ record, prepareAllowed: false, reason: '' });
  await mount();
  await vi.waitFor(() => expect(document.querySelector('[data-testid=verification-record]')?.textContent).toContain(record.id));
  app.unmount(); root.remove();
  const saved = { ...record, status: 'PASSED' as const, finishedAt: '2026-10-31T08:02:00Z' };
  vi.mocked(runtimeApi.boardVerification).mockResolvedValue({ record: saved, prepareAllowed: false, reason: '' });
  await mount();
  await vi.waitFor(() => expect(document.querySelector('[data-testid=verification-record]')?.textContent).toContain(saved.finishedAt));
  expect(document.body.textContent).toContain(i18n.global.t('boardVerification.status.PASSED'));
  await vi.advanceTimersByTimeAsync(30_000);
  expect(runtimeApi.boardVerification).toHaveBeenCalledTimes(2);
  expect(runtimeApi.planBoardVerification).not.toHaveBeenCalled();
  expect(runtimeApi.startBoardVerification).not.toHaveBeenCalled();
  expect(button('verification-start')).toBeNull();
});
it.each(['resolve', 'reject'])('ignores a late POST %s after switching Runs', async outcome => {
  let resolve!: (value: BoardVerificationRecord) => void, reject!: (reason: Error) => void;
  vi.mocked(runtimeApi.startBoardVerification).mockImplementationOnce(() => new Promise((done, fail) => { resolve = done; reject = fail; }));
  const changed = vi.fn();
  await mount(changed); await prepare(); await confirm();
  await vi.waitFor(() => expect(runtimeApi.startBoardVerification).toHaveBeenCalledTimes(1));
  current.value = { ...run, execution: { ...run.execution, id: 'run-b' } };
  await vi.waitFor(() => expect(runtimeApi.boardVerification).toHaveBeenCalledWith('task-a', 'run-b', 'project-a'));
  await vi.waitFor(() => expect(button('verification-prepare')?.disabled).toBe(false));
  if (outcome === 'resolve') resolve(record); else reject(new Error('late response lost'));
  await Promise.resolve(); await Promise.resolve(); await nextTick();
  expect(document.body.textContent).not.toContain(record.id);
  expect(document.body.textContent).not.toContain(plan.planHash);
  expect(document.querySelector('[data-testid=verification-note]')).toBeNull();
  expect(button('verification-prepare').disabled).toBe(false);
  expect(button('verification-start')).toBeNull();
  expect(changed).not.toHaveBeenCalled();
  expect(runtimeApi.boardVerification).toHaveBeenCalledTimes(2);
});
it('does not automatically retry when both POST and its recovery GET fail', async () => {
  vi.useFakeTimers();
  vi.mocked(runtimeApi.startBoardVerification).mockImplementationOnce(async () => {
    vi.mocked(runtimeApi.boardVerification).mockRejectedValue(new Error('read offline'));
    throw new Error('response lost');
  });
  await mount(); await prepare(); await confirm();
  await vi.waitFor(() => expect(document.body.textContent).toContain(i18n.global.t('boardVerification.loadFailed')));
  await vi.advanceTimersByTimeAsync(180_000);
  expect(runtimeApi.startBoardVerification).toHaveBeenCalledTimes(1);
  expect(runtimeApi.boardVerification).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[data-testid=verification-record]')).toBeNull();
});
it('shows STALE rather than an overall pass even when individual checks passed', async () => {
  const stale: BoardVerificationRecord = { ...record, status: 'STALE', reason: 'BOARD_VERIFICATION_SOURCE_CHANGED', sourceAfter: { ...plan.source, contentHash: 'changed-source' }, checks: [{ ...plan.commands[0]!, status: 'PASSED', exitCode: 0, stdout: '', stderr: '', processTreeCleanup: true, truncated: false, startedAt: record.startedAt, finishedAt: record.startedAt }] };
  vi.mocked(runtimeApi.boardVerification).mockResolvedValue({ record: stale, prepareAllowed: false, reason: '' });
  await mount();
  await vi.waitFor(() => expect(document.querySelector('[data-testid=verification-record] .eap-badge')?.textContent).toBe(i18n.global.t('boardVerification.status.STALE')));
  expect(document.querySelector('[data-testid=verification-record] .eap-badge')?.textContent).not.toContain(i18n.global.t('boardVerification.status.PASSED'));
  expect(document.body.textContent).toContain('changed-source');
  expect(button('verification-start')).toBeNull();
});
it('polls persisted progress with a finite bound and stops on an unknown result', async () => {
  vi.useFakeTimers();
  vi.mocked(runtimeApi.boardVerification).mockResolvedValue({ record: { ...record, status: 'RUNNING' }, prepareAllowed: false, reason: '' });
  await mount(); await vi.advanceTimersByTimeAsync(182_000);
  expect(document.body.textContent).toContain('自动刷新已暂停');
  expect(runtimeApi.boardVerification).toHaveBeenCalledTimes(61);
  vi.mocked(runtimeApi.boardVerification).mockResolvedValue({ record: { ...record, status: 'UNKNOWN', reason: 'BOARD_VERIFICATION_RESTART_UNKNOWN' }, prepareAllowed: false, reason: 'BOARD_EXECUTION_ACTIVE' });
  button('verification-refresh').click(); await vi.advanceTimersByTimeAsync(10_000);
  expect(runtimeApi.boardVerification).toHaveBeenCalledTimes(62);
  expect(document.body.textContent).toContain('结果未知，保持阻塞');
  expect(button('verification-start')).toBeNull();
});
it('invalidates a rejected stale plan and requires preparing again instead of retrying blindly', async () => {
  vi.mocked(runtimeApi.startBoardVerification).mockRejectedValueOnce(new AxiosError('stale', 'ERR_BAD_REQUEST', undefined, undefined, { status: 409, data: { detail: 'BOARD_VERIFICATION_PLAN_STALE' } } as never));
  await mount(); await prepare(); await confirm();
  await vi.waitFor(() => expect(document.body.textContent).toContain('请重新准备计划并确认'));
  expect(button('verification-start')).toBeNull();
  expect(runtimeApi.startBoardVerification).toHaveBeenCalledTimes(1);
});
it('ignores a late plan after switching Runs without changing the next Run', async () => {
  let resolve!: (value: BoardVerificationPlan) => void;
  vi.mocked(runtimeApi.planBoardVerification).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await mount(); await vi.waitFor(() => expect(button('verification-prepare')?.disabled).toBe(false)); button('verification-prepare').click();
  current.value = { ...run, execution: { ...run.execution, id: 'run-b' } };
  await vi.waitFor(() => expect(runtimeApi.boardVerification).toHaveBeenCalledWith('task-a', 'run-b', 'project-a'));
  resolve(plan); await Promise.resolve(); await Promise.resolve();
  expect(document.body.textContent).not.toContain('plan-hash'); expect(button('verification-start')).toBeNull();
});
it('ignores late saved evidence from the previous Run and retains saved failures on refresh errors', async () => {
  let resolve!: (value: BoardVerificationPage) => void;
  vi.mocked(runtimeApi.boardVerification).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await mount(); current.value = { ...run, execution: { ...run.execution, id: 'run-b' } };
  await vi.waitFor(() => expect(runtimeApi.boardVerification).toHaveBeenCalledWith('task-a', 'run-b', 'project-a'));
  resolve({ record, prepareAllowed: false, reason: '' }); await Promise.resolve(); await Promise.resolve();
  expect(document.body.textContent).not.toContain('verification-a');
  const failed: BoardVerificationRecord = { ...record, status: 'FAILED', checks: [{ ...plan.commands[0]!, status: 'FAILED', exitCode: 7, stdout: '<script>unsafe()</script>', stderr: 'check failed', processTreeCleanup: true, truncated: true, startedAt: record.startedAt, finishedAt: record.startedAt }] };
  vi.mocked(runtimeApi.boardVerification).mockResolvedValue({ record: failed, prepareAllowed: false, reason: '' });
  button('verification-refresh').click(); await vi.waitFor(() => expect(document.body.textContent).toContain('验证未通过'));
  expect(document.querySelector('.verification script')).toBeNull(); expect(document.body.textContent).toContain('输出已截断');
  vi.mocked(runtimeApi.boardVerification).mockRejectedValueOnce(new Error('offline')); button('verification-refresh').click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('无法读取验证记录'));
  expect(document.body.textContent).toContain('verification-a'); expect(button('verification-start')).toBeNull();
});
