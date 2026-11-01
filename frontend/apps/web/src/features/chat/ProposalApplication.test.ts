// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';
import { createApp, h, ref, type App } from 'vue';
import { runtimeApi, type CodeProposal } from '@eap/runtime-client';
import { i18n } from '../../lib/i18n';
import ProposalApplication from './ProposalApplication.vue';
const proposal: CodeProposal = { id: 'p1', conversationId: 'c1', workspace: '/repo', summary: 'candidate', files: [{ path: 'App.vue', before: 'before', content: 'after', baseHash: 'hash' }], applied: false, writeAllowed: true, verification: 'not_requested', generation: { id: 'g1', targetPath: 'App.vue', baseHash: 'hash', capturedAt: 'now', prototypeVersionId: '', prototypeContentHash: '' } };
const applied = { id: 'p1', written: ['App.vue'], verification: 'not_requested', checks: [] };
const state = (status: string, result: object | null = null) => ({ proposal, status, result, reason: '' });
let app: App, host: HTMLElement;
const current = ref(proposal);
const button = (id: string) => document.querySelector(`[data-testid=${id}]`) as HTMLButtonElement;
async function mount() {
  host = document.createElement('div'); document.body.append(host);
  const onApplied = vi.fn();
  app = createApp({ render: () => h(ProposalApplication, { proposal: current.value, readOnly: false, onApplied }) }); app.use(i18n).mount(host);
  await vi.waitFor(() => expect(runtimeApi.codeProposal).toHaveBeenCalled());
  return onApplied;
}
beforeEach(() => {
  current.value = proposal;
  vi.spyOn(runtimeApi, 'codeProposal').mockResolvedValue(state('PROPOSED') as never);
  vi.spyOn(runtimeApi, 'applyCodeProposal').mockResolvedValue(applied);
});
afterEach(() => { app?.unmount(); host?.remove(); vi.restoreAllMocks(); });
it('reads a durable application on mount without posting again', async () => {
  vi.mocked(runtimeApi.codeProposal).mockResolvedValue(state('APPLIED', applied) as never);
  const notify = await mount();
  await vi.waitFor(() => expect(host.textContent).toContain('已写入并记录'));
  expect(notify).toHaveBeenCalledWith(applied);
  expect(host.querySelector('[data-testid=application-identities]')?.textContent).toContain('c1');
  expect(host.querySelector('[data-testid=application-identities]')?.textContent).toContain('p1');
  expect(button('proposal-apply')).toBeNull();
  expect(runtimeApi.applyCodeProposal).not.toHaveBeenCalled();
});
it('requires confirmation and recovers a lost POST response by reading, not repeating the write', async () => {
  vi.mocked(runtimeApi.applyCodeProposal).mockImplementationOnce(async () => {
    vi.mocked(runtimeApi.codeProposal).mockResolvedValue(state('APPLIED', applied) as never);
    throw new Error('response lost');
  });
  await mount();
  await vi.waitFor(() => expect(button('proposal-apply')).not.toBeNull());
  expect(button('proposal-apply').disabled).toBe(true);
  (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
  await vi.waitFor(() => expect(button('proposal-apply').disabled).toBe(false));
  button('proposal-apply').click();
  await vi.waitFor(() => expect(host.textContent).toContain('已写入并记录'));
  expect(runtimeApi.applyCodeProposal).toHaveBeenCalledTimes(1);
  expect(runtimeApi.codeProposal).toHaveBeenCalledTimes(2);
});
it.each(['APPLYING', 'UNKNOWN', 'FAILED'])('does not offer a new write for %s evidence', async status => {
  vi.mocked(runtimeApi.codeProposal).mockResolvedValue(state(status) as never);
  await mount(); await vi.waitFor(() => expect(host.querySelector('[data-testid=proposal-status]')).not.toBeNull());
  expect(button('proposal-apply')).toBeNull(); expect(host.querySelector('input[type=checkbox]')).toBeNull();
});
it('retains a task revision refusal after rereading a still-proposed record', async () => {
  vi.mocked(runtimeApi.applyCodeProposal).mockRejectedValue({ response: { status: 409, data: { detail: 'BOARD_REVISION_CONFLICT' } } });
  await mount(); await vi.waitFor(() => expect(button('proposal-apply')).not.toBeNull());
  (host.querySelector('input[type=checkbox]') as HTMLInputElement).click();
  await vi.waitFor(() => expect(button('proposal-apply').disabled).toBe(false)); button('proposal-apply').click();
  await vi.waitFor(() => expect(runtimeApi.codeProposal).toHaveBeenCalledTimes(2));
  await vi.waitFor(() => expect(host.textContent).toContain(i18n.global.t('generation.generation-task-stale')));
  expect(button('proposal-apply').disabled).toBe(true);
  expect(runtimeApi.applyCodeProposal).toHaveBeenCalledTimes(1);
});
it('blocks applying after a read failure and requires a fresh confirmation after recovery', async () => {
  vi.mocked(runtimeApi.codeProposal).mockRejectedValueOnce(new Error('offline'));
  await mount(); await vi.waitFor(() => expect(host.textContent).toContain('无法核对持久写入记录'));
  expect(button('proposal-apply')).toBeNull();
  button('proposal-refresh').click();
  await vi.waitFor(() => expect(button('proposal-apply')).not.toBeNull());
  expect(button('proposal-apply').disabled).toBe(true);
});
it('ignores a late record after changing proposals', async () => {
  let resolve!: (value: never) => void;
  vi.mocked(runtimeApi.codeProposal).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  const notify = await mount();
  current.value = { ...proposal, id: 'p2' };
  vi.mocked(runtimeApi.codeProposal).mockResolvedValue({ ...state('UNKNOWN'), proposal: current.value } as never);
  await vi.waitFor(() => expect(runtimeApi.codeProposal).toHaveBeenCalledTimes(2));
  resolve(state('APPLIED', applied) as never);
  await Promise.resolve(); await Promise.resolve();
  expect(notify).not.toHaveBeenCalled(); expect(button('proposal-apply')).toBeNull();
});
it.each([
  state('APPLIED'),
  state('PROPOSED', applied),
  state('APPLIED', { ...applied, id: 'another-proposal' }),
])('fails closed on inconsistent persisted status/result', async record => {
  vi.mocked(runtimeApi.codeProposal).mockResolvedValue(record as never);
  const notify = await mount();
  await vi.waitFor(() => expect(host.textContent).toContain('无法核对持久写入记录'));
  expect(notify).not.toHaveBeenCalled(); expect(button('proposal-apply')).toBeNull();
});
