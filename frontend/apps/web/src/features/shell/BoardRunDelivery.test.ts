// @vitest-environment happy-dom
import { beforeEach, afterEach, expect, it, vi } from 'vite-plus/test';
import { createApp, h, ref, type App } from 'vue';
import { AxiosError } from 'axios';
import { runtimeApi, type BoardRun, type BoardTask, type BoardDelivery } from '@eap/runtime-client';
import { i18n } from '../../lib/i18n';
import BoardRunDelivery from './BoardRunDelivery.vue';
const task: BoardTask = { id: 'task-a', projectId: 'project-a', title: 'Source', column: 'ready', goal: 'Deliver source', acceptanceCriteria: 'Review preview', notes: '', priority: 'none', sessionId: '', revision: 3, events: [], executionActive: false, prototypeVersionId: null, preparationIssues: [], allowedColumns: ['ready'] };
const run: BoardRun = { requestId: 'run-request', taskRevision: 3, task: { title: task.title, goal: task.goal, acceptanceCriteria: task.acceptanceCriteria }, execution: { id: 'run-a', missionId: 'mission-a', status: 'SUCCEEDED', capability: 'git-status', principal: 'local-operator', approval: 'NOT_REQUIRED', workspacePath: 'F:/authorized/repo', workspaceLabel: 'repo', executable: 'git', stdout: '', stderr: '', startedAt: '2026-11-01T00:00:00Z', finishedAt: '2026-11-01T00:00:01Z', exitCode: 0 } };
const record: BoardDelivery = { id: 'delivery-a', source: 'EXTERNAL_MANUAL', requestId: 'delivery-request', taskRevision: 3, submittedRevision: 4, workspacePath: run.execution.workspacePath, baseCommit: 'base-commit', verificationId: 'verification-a', sourceHash: 'source-hash', prototypeVersionId: null, goal: task.goal, acceptanceCriteria: task.acceptanceCriteria, note: 'external change', files: [{ path: 'frontend/App.vue', beforeHash: 'before-hash', afterHash: 'after-hash', before: '<p>Before</p>', after: '<script>unsafe()</script>' }], createdAt: '2026-11-01T00:05:00Z', decision: null };
let app: App, root: HTMLDivElement, current = ref(task), currentRun = ref(run), disabled = ref(false);
const button = (id: string) => document.querySelector(`[data-testid=${id}]`) as HTMLButtonElement;
async function mount(onChanged?: () => void) {
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(BoardRunDelivery, { task: current.value, run: currentRun.value, disabled: disabled.value, onChanged }) }); app.use(i18n).mount(root);
  await vi.waitFor(() => expect(runtimeApi.boardDelivery).toHaveBeenCalled());
}
beforeEach(() => {
  sessionStorage.clear(); current = ref({ ...task }); currentRun = ref(run); disabled = ref(false);
  vi.spyOn(runtimeApi, 'boardDelivery').mockResolvedValue({ record: null, prepareAllowed: false, reason: 'BOARD_VERIFICATION_REQUIRED' });
  vi.spyOn(runtimeApi, 'submitBoardDelivery').mockResolvedValue(record);
  vi.spyOn(runtimeApi, 'decideBoardDelivery').mockResolvedValue(record);
});
afterEach(() => { app?.unmount(); root?.remove(); vi.restoreAllMocks(); });
async function input(id: string, value: string) {
  const field = document.querySelector(`[data-testid=${id}]`) as HTMLTextAreaElement;
  expect(field).not.toBeNull(); field.value = value; field.dispatchEvent(new Event('input')); await Promise.resolve();
}
async function confirm(id = 'delivery-submit') {
  await vi.waitFor(() => expect(button(id)?.disabled).toBe(false)); button(id).click();
  await vi.waitFor(() => expect(document.querySelector('.eap-confirm__actions button:first-child')).not.toBeNull());
  (document.querySelector('.eap-confirm__actions button:first-child') as HTMLButtonElement).click();
}
it('collects literal source paths and note only after explicit manual-origin confirmation, then re-reads the saved record', async () => {
  vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record: null, prepareAllowed: true, reason: '' });
  vi.mocked(runtimeApi.submitBoardDelivery).mockImplementationOnce(async (_task, _run, request) => {
    vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record: { ...record, requestId: request.requestId }, prepareAllowed: false, reason: '' }); return record;
  });
  const changed = vi.fn(); await mount(changed);
  await input('delivery-paths', 'frontend/App.vue\nfrontend/style.css'); await input('delivery-note-input', 'External edits');
  expect(runtimeApi.submitBoardDelivery).not.toHaveBeenCalled();
  await confirm();
  await vi.waitFor(() => expect(runtimeApi.submitBoardDelivery).toHaveBeenCalledWith(task.id, run.execution.id, { projectId: task.projectId, revision: task.revision, workspacePath: run.execution.workspacePath, requestId: expect.any(String), paths: ['frontend/App.vue', 'frontend/style.css'], note: 'External edits' }));
  await vi.waitFor(() => expect(document.querySelector('[data-testid=delivery-record]')?.textContent).toContain('verification-a'));
  expect(runtimeApi.boardDelivery).toHaveBeenCalledTimes(2); expect(changed).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).toContain('EXTERNAL_MANUAL'); expect(document.body.textContent).toContain('不运行验证脚本');
  expect(document.body.textContent).toContain('<p>Before</p>'); expect(document.body.textContent).toContain('<script>unsafe()</script>');
  expect(document.querySelector('[data-testid=delivery-record] script')).toBeNull();
  expect(document.body.textContent).toContain('before-hash'); expect(document.body.textContent).toContain('after-hash');
});
it('persists an uncertain submission across reopen, re-reads before retry and sends the identical request', async () => {
  vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record: null, prepareAllowed: true, reason: '' });
  vi.mocked(runtimeApi.submitBoardDelivery).mockImplementationOnce(async () => {
    vi.mocked(runtimeApi.boardDelivery).mockRejectedValueOnce(new Error('read offline')); throw new Error('response lost');
  });
  await mount(); await input('delivery-paths', 'frontend/App.vue'); await input('delivery-note-input', 'original'); await confirm();
  await vi.waitFor(() => expect(runtimeApi.boardDelivery).toHaveBeenCalledTimes(2));
  expect(button('delivery-submit').disabled).toBe(true);
  const original = vi.mocked(runtimeApi.submitBoardDelivery).mock.calls[0]![2];
  app.unmount(); root.remove(); current.value = { ...task, revision: 99 };
  await mount();
  await vi.waitFor(() => expect(button('delivery-retry')?.disabled).toBe(false));
  expect((document.querySelector('[data-testid=delivery-note-input]') as HTMLTextAreaElement).disabled).toBe(true);
  vi.mocked(runtimeApi.submitBoardDelivery).mockImplementationOnce(async (_task, _run, request) => {
    vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record: { ...record, requestId: request.requestId }, prepareAllowed: false, reason: '' }); return record;
  });
  button('delivery-retry').click();
  await vi.waitFor(() => expect(runtimeApi.submitBoardDelivery).toHaveBeenCalledTimes(2));
  expect(vi.mocked(runtimeApi.submitBoardDelivery).mock.calls[1]![2]).toEqual(original);
  await vi.waitFor(() => expect(button('delivery-retry')).toBeNull());
  expect(runtimeApi.boardDelivery).toHaveBeenCalledTimes(5);
});
it.each(['ACCEPT', 'REJECT'] as const)('requires separate %s confirmation and replays the saved human decision without changing task state locally', async decision => {
  current.value = { ...task, column: 'acceptance', revision: record.submittedRevision };
  vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record, prepareAllowed: false, reason: '' });
  vi.mocked(runtimeApi.decideBoardDelivery).mockImplementationOnce(async (_task, _run, request) => {
    const saved = { ...record, decision: { id: 'decision-a', requestId: request.requestId, decision: request.decision, criteriaConfirmed: request.criteriaConfirmed, previewConfirmed: request.previewConfirmed, comment: request.comment, operator: 'local-operator' as const, createdAt: '2026-11-01T00:10:00Z' } };
    vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record: saved, prepareAllowed: false, reason: '' }); return saved;
  });
  const changed = vi.fn(); await mount(changed);
  await vi.waitFor(() => expect(button('delivery-accept')).not.toBeNull());
  expect(button('delivery-accept').disabled).toBe(true); expect(button('delivery-reject').disabled).toBe(true);
  if (decision === 'ACCEPT') {
    (document.querySelector('[data-testid=delivery-criteria]') as HTMLInputElement).click();
    await Promise.resolve(); expect(button('delivery-accept').disabled).toBe(true);
    (document.querySelector('[data-testid=delivery-preview]') as HTMLInputElement).click();
  }
  await input('delivery-comment', 'human reason');
  expect(runtimeApi.decideBoardDelivery).not.toHaveBeenCalled();
  await confirm(decision === 'ACCEPT' ? 'delivery-accept' : 'delivery-reject');
  await vi.waitFor(() => expect(runtimeApi.decideBoardDelivery).toHaveBeenCalledWith(task.id, run.execution.id, { projectId: task.projectId, revision: 4, requestId: expect.any(String), deliveryId: record.id, decision, criteriaConfirmed: decision === 'ACCEPT', previewConfirmed: decision === 'ACCEPT', comment: 'human reason' }));
  await vi.waitFor(() => expect(document.querySelector('[data-testid=delivery-decision]')?.textContent).toContain('decision-a'));
  expect(current.value.column).toBe('acceptance'); expect(changed).toHaveBeenCalledTimes(1);
  expect(button('delivery-accept')).toBeNull(); expect(button('delivery-reject')).toBeNull();
});
it('preserves unsent source paths and note when only the task revision changes', async () => {
  vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record: null, prepareAllowed: true, reason: '' });
  await mount(); await input('delivery-paths', 'frontend/App.vue'); await input('delivery-note-input', 'keep my note');
  current.value = { ...task, revision: 4 };
  await vi.waitFor(() => expect(runtimeApi.boardDelivery).toHaveBeenCalledTimes(2));
  expect((document.querySelector('[data-testid=delivery-paths]') as HTMLTextAreaElement).value).toBe('frontend/App.vue');
  expect((document.querySelector('[data-testid=delivery-note-input]') as HTMLTextAreaElement).value).toBe('keep my note');
  expect(runtimeApi.submitBoardDelivery).not.toHaveBeenCalled();
});
it('preserves review comments but invalidates human confirmations on revision changes', async () => {
  current.value = { ...task, column: 'acceptance', revision: 4 };
  vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record, prepareAllowed: false, reason: '' });
  await mount(); await vi.waitFor(() => expect(button('delivery-accept')).not.toBeNull());
  (document.querySelector('[data-testid=delivery-criteria]') as HTMLInputElement).click();
  (document.querySelector('[data-testid=delivery-preview]') as HTMLInputElement).click();
  await input('delivery-comment', 'keep this review draft');
  await vi.waitFor(() => expect(button('delivery-accept').disabled).toBe(false)); button('delivery-accept').click();
  await vi.waitFor(() => expect(document.querySelector('.eap-confirm')).not.toBeNull());
  current.value = { ...current.value, revision: 5 };
  await vi.waitFor(() => expect(runtimeApi.boardDelivery).toHaveBeenCalledTimes(2));
  expect((document.querySelector('[data-testid=delivery-comment]') as HTMLTextAreaElement).value).toBe('keep this review draft');
  expect((document.querySelector('[data-testid=delivery-criteria]') as HTMLInputElement).checked).toBe(false);
  expect((document.querySelector('[data-testid=delivery-preview]') as HTMLInputElement).checked).toBe(false);
  expect(document.querySelector('.eap-confirm')).toBeNull();
  expect(button('delivery-accept').disabled).toBe(true); expect(button('delivery-reject').disabled).toBe(false);
  expect(runtimeApi.decideBoardDelivery).not.toHaveBeenCalled();
});
it('invalidates an open submission confirmation when the authoritative task revision changes', async () => {
  vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record: null, prepareAllowed: true, reason: '' });
  await mount(); await input('delivery-paths', 'frontend/App.vue');
  await vi.waitFor(() => expect(button('delivery-submit').disabled).toBe(false)); button('delivery-submit').click();
  await vi.waitFor(() => expect(document.querySelector('.eap-confirm')).not.toBeNull());
  current.value.revision = 4;
  await vi.waitFor(() => expect(document.querySelector('.eap-confirm')).toBeNull());
  expect(runtimeApi.submitBoardDelivery).not.toHaveBeenCalled();
});
it('rejects malformed or duplicate source paths without silently normalizing them', async () => {
  vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record: null, prepareAllowed: true, reason: '' });
  await mount();
  for (const value of [' frontend/App.vue', 'frontend/../secrets.ts', 'backend/Foo.ts', 'frontend/config.json', 'frontend\\App.vue', 'frontend/App.vue\nfrontend/App.vue']) {
    await input('delivery-paths', value);
    await vi.waitFor(() => expect(button('delivery-submit').disabled).toBe(true));
  }
  expect(runtimeApi.submitBoardDelivery).not.toHaveBeenCalled();
});
it('keeps an explicit content conflict even when GET returns the same request id', async () => {
  vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record: null, prepareAllowed: true, reason: '' });
  vi.mocked(runtimeApi.submitBoardDelivery).mockImplementationOnce(async (_task, _run, request) => {
    vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record: { ...record, requestId: request.requestId, note: 'different saved content' }, prepareAllowed: false, reason: '' });
    throw new AxiosError('conflict', 'ERR_BAD_REQUEST', undefined, undefined, { status: 409, data: { detail: 'BOARD_DELIVERY_REQUEST_CONFLICT' } } as never);
  });
  const changed = vi.fn(); await mount(changed);
  await input('delivery-paths', 'frontend/App.vue'); await input('delivery-note-input', 'original note'); await confirm();
  await vi.waitFor(() => expect(document.querySelector('[data-testid=delivery-record]')).not.toBeNull());
  expect(document.body.textContent).toContain('BOARD_DELIVERY_REQUEST_CONFLICT');
  expect(document.body.textContent).not.toContain(i18n.global.t('boardDelivery.recovered'));
  expect(changed).not.toHaveBeenCalled();
  expect(button('delivery-retry')?.disabled).toBe(true);
  app.unmount(); root.remove(); await mount();
  await vi.waitFor(() => expect(document.querySelector('[data-testid=delivery-record]')).not.toBeNull());
  expect(document.body.textContent).toContain('BOARD_DELIVERY_REQUEST_CONFLICT');
  expect(button('delivery-retry')?.disabled).toBe(true);
  expect(runtimeApi.submitBoardDelivery).toHaveBeenCalledTimes(1);
});
it('does not recover a lost decision response from a same-ID different-content record', async () => {
  current.value = { ...task, column: 'acceptance', revision: 4 };
  vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record, prepareAllowed: false, reason: '' });
  vi.mocked(runtimeApi.decideBoardDelivery).mockImplementationOnce(async (_task, _run, request) => {
    vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record: { ...record, decision: { ...request, decision: 'REJECT', comment: '[REDACTED]', id: 'different-decision', operator: 'local-operator', createdAt: '2026-11-01T00:10:00Z' } }, prepareAllowed: false, reason: '' });
    throw new Error('response lost');
  });
  const changed = vi.fn(); await mount(changed);
  await vi.waitFor(() => expect(button('delivery-accept')).not.toBeNull());
  (document.querySelector('[data-testid=delivery-criteria]') as HTMLInputElement).click();
  (document.querySelector('[data-testid=delivery-preview]') as HTMLInputElement).click();
  await input('delivery-comment', 'my original approval'); await confirm('delivery-accept');
  await vi.waitFor(() => expect(document.querySelector('[data-testid=delivery-decision]')?.textContent).toContain('different-decision'));
  expect(button('delivery-retry')).not.toBeNull(); expect(changed).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain(i18n.global.t('boardDelivery.recovered'));
  const original = vi.mocked(runtimeApi.decideBoardDelivery).mock.calls[0]![2];
  vi.mocked(runtimeApi.decideBoardDelivery).mockRejectedValueOnce(new AxiosError('conflict', 'ERR_BAD_REQUEST', undefined, undefined, { status: 409, data: { detail: 'BOARD_DELIVERY_REQUEST_CONFLICT' } } as never));
  button('delivery-retry').click();
  await vi.waitFor(() => expect(runtimeApi.decideBoardDelivery).toHaveBeenCalledTimes(2));
  expect(vi.mocked(runtimeApi.decideBoardDelivery).mock.calls[1]![2]).toEqual(original);
  await vi.waitFor(() => expect(document.body.textContent).toContain('BOARD_DELIVERY_REQUEST_CONFLICT'));
  expect(button('delivery-retry')?.disabled).toBe(true); expect(changed).not.toHaveBeenCalled();
  expect(document.body.textContent).not.toContain(i18n.global.t('boardDelivery.recovered'));
});
it('does not clear an uncertain submission on same-ID GET until explicit payload replay succeeds', async () => {
  vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record: null, prepareAllowed: true, reason: '' });
  vi.mocked(runtimeApi.submitBoardDelivery).mockImplementationOnce(async (_task, _run, request) => {
    vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record: { ...record, requestId: request.requestId, note: '[REDACTED]' }, prepareAllowed: false, reason: '' });
    throw new Error('response lost');
  });
  const changed = vi.fn(); await mount(changed);
  await input('delivery-paths', 'frontend/App.vue'); await input('delivery-note-input', 'literal original note'); await confirm();
  await vi.waitFor(() => expect(document.querySelector('[data-testid=delivery-record]')).not.toBeNull());
  expect(button('delivery-retry')).not.toBeNull(); expect(changed).not.toHaveBeenCalled();
  expect(runtimeApi.submitBoardDelivery).toHaveBeenCalledTimes(1);
  const original = vi.mocked(runtimeApi.submitBoardDelivery).mock.calls[0]![2];
  app.unmount(); root.remove(); await mount(changed);
  await vi.waitFor(() => expect(button('delivery-retry')?.disabled).toBe(false));
  expect(runtimeApi.submitBoardDelivery).toHaveBeenCalledTimes(1);
  button('delivery-retry').click();
  await vi.waitFor(() => expect(runtimeApi.submitBoardDelivery).toHaveBeenCalledTimes(2));
  expect(vi.mocked(runtimeApi.submitBoardDelivery).mock.calls[1]![2]).toEqual(original);
  await vi.waitFor(() => expect(button('delivery-retry')).toBeNull());
  expect(changed).toHaveBeenCalledTimes(1);
});
it('restores a pending decision after reopen and verifies its content by explicit original-payload replay', async () => {
  current.value = { ...task, column: 'acceptance', revision: 4 };
  vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record, prepareAllowed: false, reason: '' });
  vi.mocked(runtimeApi.decideBoardDelivery).mockImplementationOnce(async () => {
    vi.mocked(runtimeApi.boardDelivery).mockRejectedValueOnce(new Error('read offline')); throw new Error('response lost');
  });
  await mount(); await vi.waitFor(() => expect(button('delivery-accept')).not.toBeNull());
  (document.querySelector('[data-testid=delivery-criteria]') as HTMLInputElement).click();
  (document.querySelector('[data-testid=delivery-preview]') as HTMLInputElement).click();
  await input('delivery-comment', 'already reviewed'); await confirm('delivery-accept');
  await vi.waitFor(() => expect(runtimeApi.boardDelivery).toHaveBeenCalledTimes(2));
  const original = vi.mocked(runtimeApi.decideBoardDelivery).mock.calls[0]![2];
  app.unmount(); root.remove(); await mount();
  await vi.waitFor(() => expect(button('delivery-retry')?.disabled).toBe(false));
  expect((document.querySelector('[data-testid=delivery-comment]') as HTMLTextAreaElement).value).toBe('already reviewed');
  expect((document.querySelector('[data-testid=delivery-criteria]') as HTMLInputElement).checked).toBe(true);
  expect((document.querySelector('[data-testid=delivery-preview]') as HTMLInputElement).checked).toBe(true);
  vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record: { ...record, decision: { ...original, comment: '[REDACTED]', id: 'saved-decision', operator: 'local-operator', createdAt: '2026-11-01T00:10:00Z' } }, prepareAllowed: false, reason: '' });
  button('delivery-refresh').click();
  await vi.waitFor(() => expect(document.querySelector('[data-testid=delivery-decision]')?.textContent).toContain('saved-decision'));
  expect(button('delivery-retry')).not.toBeNull();
  expect(runtimeApi.decideBoardDelivery).toHaveBeenCalledTimes(1);
  expect(document.body.textContent).not.toContain(i18n.global.t('boardDelivery.recovered'));
  button('delivery-retry').click();
  await vi.waitFor(() => expect(runtimeApi.decideBoardDelivery).toHaveBeenCalledTimes(2));
  expect(vi.mocked(runtimeApi.decideBoardDelivery).mock.calls[1]![2]).toEqual(original);
  await vi.waitFor(() => expect(button('delivery-retry')).toBeNull());
});
it.each(['unsaved', 'active'] as const)('blocks submission for %s tasks even when the page was eligible', async state => {
  vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record: null, prepareAllowed: true, reason: '' });
  await mount(); await input('delivery-paths', 'frontend/App.vue');
  if (state === 'unsaved') disabled.value = true; else current.value.executionActive = true;
  await vi.waitFor(() => expect(button('delivery-submit').disabled).toBe(true));
  expect(runtimeApi.submitBoardDelivery).not.toHaveBeenCalled();
});
it('retains saved file evidence but disables decisions when refresh fails', async () => {
  current.value = { ...task, column: 'acceptance', revision: 4 };
  vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record, prepareAllowed: false, reason: '' });
  await mount(); await vi.waitFor(() => expect(button('delivery-accept')).not.toBeNull());
  (document.querySelector('[data-testid=delivery-criteria]') as HTMLInputElement).click();
  (document.querySelector('[data-testid=delivery-preview]') as HTMLInputElement).click();
  await input('delivery-comment', 'checked');
  await vi.waitFor(() => expect(button('delivery-accept').disabled).toBe(false));
  vi.mocked(runtimeApi.boardDelivery).mockRejectedValueOnce(new Error('offline'));
  button('delivery-refresh').click();
  await vi.waitFor(() => expect(document.body.textContent).toContain(i18n.global.t('boardDelivery.loadFailed')));
  expect(document.body.textContent).toContain(record.verificationId);
  expect(button('delivery-accept').disabled).toBe(true); expect(button('delivery-reject').disabled).toBe(true);
});
it.each(['resolve', 'reject'] as const)('ignores late submission %s when the Run changes and restores its identity on return', async outcome => {
  let resolve!: (value: BoardDelivery) => void, reject!: (reason: Error) => void;
  vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record: null, prepareAllowed: true, reason: '' });
  vi.mocked(runtimeApi.submitBoardDelivery).mockImplementationOnce(() => new Promise((done, fail) => { resolve = done; reject = fail; }));
  const changed = vi.fn(); await mount(changed); await input('delivery-paths', 'frontend/App.vue'); await confirm();
  await vi.waitFor(() => expect(runtimeApi.submitBoardDelivery).toHaveBeenCalledTimes(1));
  currentRun.value = { ...run, execution: { ...run.execution, id: 'run-b' } };
  await vi.waitFor(() => expect(runtimeApi.boardDelivery).toHaveBeenCalledWith(task.id, 'run-b', task.projectId));
  if (outcome === 'resolve') resolve(record); else reject(new Error('late lost response'));
  await Promise.resolve(); await Promise.resolve();
  expect(document.querySelector('[data-testid=delivery-record]')).toBeNull();
  expect(button('delivery-retry')).toBeNull(); expect(changed).not.toHaveBeenCalled();
  expect(runtimeApi.boardDelivery).toHaveBeenCalledTimes(2);
  currentRun.value = run;
  await vi.waitFor(() => expect(button('delivery-retry')?.disabled).toBe(false));
  expect(runtimeApi.submitBoardDelivery).toHaveBeenCalledTimes(1);
});
it('ignores late GET data after switching tasks', async () => {
  let resolve!: (value: { record: BoardDelivery; prepareAllowed: boolean; reason: string }) => void;
  vi.mocked(runtimeApi.boardDelivery).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  await mount(); current.value = { ...task, id: 'task-b' };
  await vi.waitFor(() => expect(runtimeApi.boardDelivery).toHaveBeenCalledWith('task-b', run.execution.id, task.projectId));
  resolve({ record, prepareAllowed: false, reason: '' }); await Promise.resolve(); await Promise.resolve();
  expect(document.querySelector('[data-testid=delivery-record]')).toBeNull();
});
it('refuses submission if the request identity cannot be persisted', async () => {
  vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record: null, prepareAllowed: true, reason: '' });
  const originalStore = sessionStorage;
  vi.stubGlobal('sessionStorage', { getItem: () => null, removeItem: () => {}, setItem: () => { throw new Error('quota'); } });
  try {
    await mount(); await input('delivery-paths', 'frontend/App.vue'); await confirm();
    await vi.waitFor(() => expect(document.body.textContent).toContain(i18n.global.t('boardDelivery.storageFailed')));
    expect(runtimeApi.submitBoardDelivery).not.toHaveBeenCalled();
  } finally { vi.stubGlobal('sessionStorage', originalStore); }
});
it('requires fresh human statements after a stale acceptance is rejected, while preserving evidence and allowing rejection', async () => {
  current.value = { ...task, column: 'acceptance', revision: 4 };
  vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record, prepareAllowed: false, reason: '' });
  vi.mocked(runtimeApi.decideBoardDelivery).mockRejectedValueOnce(new AxiosError('stale', 'ERR_BAD_REQUEST', undefined, undefined, { status: 409, data: { detail: 'BOARD_DELIVERY_SOURCE_STALE' } } as never));
  await mount(); await vi.waitFor(() => expect(button('delivery-accept')).not.toBeNull());
  (document.querySelector('[data-testid=delivery-criteria]') as HTMLInputElement).click();
  (document.querySelector('[data-testid=delivery-preview]') as HTMLInputElement).click();
  await input('delivery-comment', 'source changed'); await confirm('delivery-accept');
  await vi.waitFor(() => expect(button('delivery-retry')).toBeNull());
  await vi.waitFor(() => expect(button('delivery-reject').disabled).toBe(false));
  expect(document.body.textContent).toContain('BOARD_DELIVERY_SOURCE_STALE');
  expect(button('delivery-accept').disabled).toBe(true);
  expect(document.querySelector('[data-testid=delivery-record]')?.textContent).toContain(record.id);
});
it('refreshes the parent task when manually reading delivery history', async () => {
  vi.mocked(runtimeApi.boardDelivery).mockResolvedValue({ record, prepareAllowed: false, reason: '' });
  const changed = vi.fn(); await mount(changed);
  await vi.waitFor(() => expect(button('delivery-refresh').disabled).toBe(false)); button('delivery-refresh').click();
  await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1));
});
it('identifies missing Run delivery as unavailable instead of a successful empty record', async () => {
  vi.mocked(runtimeApi.boardDelivery).mockRejectedValueOnce(new AxiosError('missing', 'ERR_BAD_REQUEST', undefined, undefined, { status: 404, data: { detail: 'BOARD_RUN_NOT_FOUND' } } as never));
  await mount();
  await vi.waitFor(() => expect(document.body.textContent).toContain('BOARD_RUN_NOT_FOUND'));
  expect(button('delivery-submit').disabled).toBe(true);
  expect(document.querySelector('[data-testid=delivery-record]')).toBeNull();
});
it('shows unavailable instead of treating a read-only successful Run as delivery', async () => {
  await mount();
  await vi.waitFor(() => expect(document.body.textContent).toContain('BOARD_VERIFICATION_REQUIRED'));
  expect(button('delivery-submit').disabled).toBe(true);
  expect(document.querySelector('[data-testid=delivery-record]')).toBeNull();
  expect(runtimeApi.submitBoardDelivery).not.toHaveBeenCalled(); expect(runtimeApi.decideBoardDelivery).not.toHaveBeenCalled();
});
