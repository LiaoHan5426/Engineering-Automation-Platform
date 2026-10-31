// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from 'vite-plus/test';
import { createApp, h, ref, type App } from 'vue';
import { runtimeApi, type BoardRun, type BoardReviewEvidence, type BoardReviewPage } from '@eap/runtime-client';
import { i18n } from '../../lib/i18n';
import BoardRunReview from './BoardRunReview.vue';
const run: BoardRun = { requestId: 'request-a', taskRevision: 1, task: { title: 'Review', goal: 'Inspect', acceptanceCriteria: 'Review evidence' }, execution: { id: 'run-a', missionId: 'mission-a', status: 'SUCCEEDED', capability: 'git-status', principal: 'local-operator', approval: 'NOT_REQUIRED', workspacePath: '/authorized/repo', workspaceLabel: 'repo', executable: 'git', stdout: '', stderr: '', startedAt: '2026-10-31T08:00:00Z', finishedAt: '2026-10-31T08:00:01Z', exitCode: 0 } };
const evidence: BoardReviewEvidence = { contentHash: 'saved-hash', snapshot: { workspacePath: '/authorized/repo', baseCommit: 'base-commit', headAfter: 'base-commit', startedAt: '2026-10-31T08:01:00Z', finishedAt: '2026-10-31T08:01:02Z', status: 'CAPTURED', issues: [], repositoryStatus: ' M source.vue', diff: '+<script>notExecutable()</script>', check: { status: 'PASSED', exitCode: 0, output: '' }, steps: [] } };
let app: App, root: HTMLDivElement, current = ref(run);
const button = (id: string) => document.querySelector(`[data-testid=${id}]`) as HTMLButtonElement;
async function mount() {
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(BoardRunReview, { taskId: 'task-a', projectId: 'project-a', run: current.value }) }); app.use(i18n).mount(root);
  await vi.waitFor(() => expect(runtimeApi.boardReview).toHaveBeenCalled());
}
async function capture() {
  await vi.waitFor(() => expect(button('board-review-capture')?.disabled).toBe(false)); button('board-review-capture').click();
  await vi.waitFor(() => expect(document.querySelector('.eap-confirm__actions button:first-child')).not.toBeNull());
  expect(runtimeApi.captureBoardReview).not.toHaveBeenCalled();
  (document.querySelector('.eap-confirm__actions button:first-child') as HTMLButtonElement).click();
}
beforeEach(() => {
  current = ref(run);
  vi.spyOn(runtimeApi, 'boardReview').mockResolvedValue({ evidence: null, captureAllowed: true, reason: '' });
  vi.spyOn(runtimeApi, 'captureBoardReview').mockResolvedValue(evidence);
});
afterEach(() => { app?.unmount(); root?.remove(); vi.restoreAllMocks(); });
it('requires confirmation and sends only project and confirmed workspace, then renders escaped immutable evidence', async () => {
  await mount(); await capture();
  await vi.waitFor(() => expect(document.querySelector('[data-testid=board-review-evidence]')).not.toBeNull());
  expect(runtimeApi.captureBoardReview).toHaveBeenCalledWith('task-a', 'run-a', { projectId: 'project-a', workspacePath: '/authorized/repo' });
  expect(button('board-review-capture')).toBeNull();
  expect(document.querySelector('[data-testid=board-review-diff]')?.textContent).toBe(evidence.snapshot.diff);
  expect(document.querySelector('[data-testid=board-review-diff] script')).toBeNull();
  expect(document.body.textContent).toContain('本记录不会推进任务');
});
it('recovers a committed capture after the POST response is lost without sending another command', async () => {
  vi.mocked(runtimeApi.captureBoardReview).mockImplementationOnce(async () => {
    vi.mocked(runtimeApi.boardReview).mockResolvedValue({ evidence, captureAllowed: false, reason: '' }); throw new Error('response lost');
  });
  await mount(); await capture();
  await vi.waitFor(() => expect(document.querySelector('[data-testid=board-review-evidence]')?.textContent).toContain('saved-hash'));
  expect(runtimeApi.captureBoardReview).toHaveBeenCalledTimes(1); expect(runtimeApi.boardReview).toHaveBeenCalledTimes(2);
  expect(document.querySelector('[data-testid=board-review-note]')?.textContent).toContain('已找回服务端保存的快照');
});
it('displays truncated or changed observations and does not substitute a passing check', async () => {
  vi.mocked(runtimeApi.boardReview).mockResolvedValue({ evidence: { ...evidence, snapshot: { ...evidence.snapshot, status: 'CHANGED', issues: ['OUTPUT_TRUNCATED', 'WORKSPACE_CHANGED_DURING_CAPTURE'], check: { status: 'STALE', exitCode: 0, output: '' } } }, captureAllowed: false, reason: '' });
  await mount();
  await vi.waitFor(() => expect(document.querySelector('[data-testid=board-review-check]')?.textContent).toContain('结果需重新核对'));
  expect(document.body.textContent).toContain('保存内容不完整'); expect(document.body.textContent).not.toContain('空白检查通过');
  expect(runtimeApi.captureBoardReview).not.toHaveBeenCalled();
});
it('shows unavailable policy and leaves capture disabled', async () => {
  vi.mocked(runtimeApi.boardReview).mockResolvedValue({ evidence: null, captureAllowed: false, reason: 'BOARD_EXECUTION_ACTIVE' });
  await mount(); await vi.waitFor(() => expect(button('board-review-capture')?.disabled).toBe(true));
  button('board-review-capture').click(); expect(document.querySelector('.eap-confirm__actions')).toBeNull();
  expect(runtimeApi.captureBoardReview).not.toHaveBeenCalled();
});
it('ignores a late read from the previous Run after changing the selected Run', async () => {
  let finish!: (page: BoardReviewPage) => void;
  vi.mocked(runtimeApi.boardReview).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await mount(); current.value = { ...run, execution: { ...run.execution, id: 'run-b' } };
  await vi.waitFor(() => expect(runtimeApi.boardReview).toHaveBeenCalledWith('task-a', 'run-b', 'project-a'));
  finish({ evidence, captureAllowed: false, reason: '' }); await Promise.resolve(); await Promise.resolve();
  expect(document.body.textContent).not.toContain('saved-hash'); expect(document.body.textContent).toContain('run-b');
});
