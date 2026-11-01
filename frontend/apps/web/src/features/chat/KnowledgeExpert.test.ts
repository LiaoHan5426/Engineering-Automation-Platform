// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { createApp, h, nextTick, type App } from 'vue';
import { runtimeApi, type TaskContext } from '@eap/runtime-client';
import { i18n } from '../../lib/i18n';
import TaskComposer from './TaskComposer.vue';
import { createChatSession, type ChatApi } from './chatSession';
import { workbench } from '../shell/workbench';
let app: App, host: HTMLDivElement;
afterEach(() => { app?.unmount(); host?.remove(); vi.restoreAllMocks(); sessionStorage.clear(); workbench.sessionExtras = {}; });
const expertRef = { id: 'saved', revision: 4 };
const evidence = { expertRef, status: 'ready' as const, references: [{ id: 'K1', source: 'Saved guide', knowledgeBase: 'Allowed base', excerpt: '<script>untrusted excerpt</script>', retrievalMode: 'keyword', documentId: 'd1' }] };
function button(id: string) { const node = document.querySelector<HTMLButtonElement>(`[data-testid=${id}]`); expect(node, id).not.toBeNull(); return node!; }
async function setup() {
  const send = vi.fn(async () => ({ answer: 'answer', error: '', status: 'SUCCEEDED', executionId: null, approval: '', verification: '', toolEvents: [], artifacts: [], artifactError: '', knowledgeContext: evidence, knowledgeMemoryCleared: true }));
  const api = { openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }), sendAiMessage: send } as unknown as ChatApi;
  const session = createChatSession(api); await session.openConversation(); session.draft.value = 'original question';
  vi.spyOn(runtimeApi, 'experts').mockResolvedValue({ items: [JSON.stringify({ id: 'saved', name: 'Saved expert' }), JSON.stringify({ id: 'disabled', name: 'Disabled expert' }), 'malformed'], states: { saved: { enabled: true, builtin: false, revision: 4 }, disabled: { enabled: false, builtin: false, revision: 1 } } });
  const preview = vi.spyOn(runtimeApi, 'previewExpertContext').mockResolvedValue(evidence);
  host = document.createElement('div'); document.body.append(host);
  app = createApp({ render: () => h(TaskComposer, { context: session.context.value, draft: session.draft.value, toolMode: session.toolMode.value, disabled: false, reasoningEfforts: [], onUpdate: (value: TaskContext) => { session.context.value = value; } }) });
  app.use(i18n).mount(host); await nextTick();
  return { session, send, preview };
}
async function selectCandidate() {
  button('knowledge-open').click();
  await vi.waitFor(() => expect(document.querySelector('[data-testid=knowledge-candidate-saved]')).not.toBeNull());
  button('knowledge-candidate-saved').click(); await nextTick();
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
it.each(['success', 'failure'])('ignores old catalog %s after closing and reopening with a fresh revision', async outcome => {
  await setup();
  const old = deferred<Awaited<ReturnType<typeof runtimeApi.experts>>>();
  const fresh = deferred<Awaited<ReturnType<typeof runtimeApi.experts>>>();
  vi.mocked(runtimeApi.experts).mockReset().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  button('knowledge-open').click(); await nextTick();
  button('knowledge-cancel').click(); await nextTick();
  button('knowledge-open').click(); await nextTick();
  const page = (revision: number) => ({ items: [JSON.stringify({ id: 'saved', name: 'Saved expert' })], states: { saved: { enabled: true, builtin: false, revision } } });
  fresh.resolve(page(5)); await fresh.promise; await nextTick();
  expect(button('knowledge-candidate-saved').textContent).toContain('r5');
  if (outcome === 'success') old.resolve(page(4)); else old.reject(new Error('old request failed'));
  await old.promise.catch(() => {}); await nextTick();
  expect(button('knowledge-candidate-saved').textContent).toContain('r5');
  expect(document.body.textContent).not.toContain('不会自动升级版本');
  button('knowledge-candidate-saved').click(); await nextTick();
  expect(button('knowledge-use').disabled).toBe(false);
});
it.each(['success', 'failure'])('keeps a fresh catalog loading when old catalog %s settles', async outcome => {
  const { session } = await setup(); session.context.value.knowledgeExpertRef = expertRef; await nextTick();
  const old = deferred<Awaited<ReturnType<typeof runtimeApi.experts>>>();
  const fresh = deferred<Awaited<ReturnType<typeof runtimeApi.experts>>>();
  vi.mocked(runtimeApi.experts).mockReset().mockReturnValueOnce(old.promise).mockReturnValueOnce(fresh.promise);
  button('knowledge-open').click(); await nextTick(); button('knowledge-cancel').click(); await nextTick();
  button('knowledge-open').click(); await nextTick();
  if (outcome === 'success') old.resolve({ items: [], states: {} }); else old.reject(new Error('old catalog failed'));
  await old.promise.catch(() => {}); await nextTick();
  expect(document.body.textContent).toContain('正在读取专家目录'); expect(button('knowledge-use').disabled).toBe(true);
  expect(document.body.textContent).not.toContain('不会自动升级版本');
  fresh.resolve({ items: [], states: {} }); await fresh.promise; await nextTick();
  expect(document.body.textContent).not.toContain('正在读取专家目录'); expect(button('knowledge-use').disabled).toBe(false);
});
it.each(['success', 'failure'])('ignores old preview %s after closing and reopening with a fresh preview', async outcome => {
  const { session, preview } = await setup(); await selectCandidate();
  const old = deferred<typeof evidence>(); preview.mockReturnValueOnce(old.promise);
  button('knowledge-preview').click(); await nextTick();
  session.toolMode.value = 'git_status'; await nextTick(); expect(document.querySelector('[data-testid=knowledge-dialog]')).toBeNull();
  session.toolMode.value = 'none'; await nextTick(); await selectCandidate();
  preview.mockResolvedValueOnce({ ...evidence, references: [{ ...evidence.references[0]!, excerpt: 'fresh preview material' }] });
  button('knowledge-preview').click(); await vi.waitFor(() => expect(document.body.textContent).toContain('fresh preview material'));
  if (outcome === 'success') old.resolve(evidence); else old.reject(new Error('old preview failed'));
  await old.promise.catch(() => {}); await nextTick();
  expect(document.body.textContent).toContain('fresh preview material'); expect(document.body.textContent).not.toContain('untrusted excerpt');
  expect(document.body.textContent).not.toContain('不会自动升级版本'); expect(button('knowledge-use').disabled).toBe(false);
});
it.each(['success', 'failure'])('invalidates pending preview %s when the selected reference changes', async outcome => {
  const { session, preview } = await setup(); await selectCandidate();
  const old = deferred<typeof evidence>(); preview.mockReturnValueOnce(old.promise);
  button('knowledge-preview').click(); await nextTick();
  session.context.value.knowledgeExpertRef = { id: 'saved', revision: 5 }; await nextTick();
  if (outcome === 'success') old.resolve(evidence); else old.reject(new Error('old preview failed'));
  await old.promise.catch(() => {}); await nextTick();
  expect(document.querySelector('[data-testid=knowledge-preview-result]')).toBeNull();
  expect(document.body.textContent).not.toContain('不会自动升级版本');
  expect(button('knowledge-preview').disabled).toBe(false);
});
it('invalidates preview on draft changes, never truncates long drafts and refuses PREBOUND combinations', async () => {
  const { session, preview, send } = await setup(); await selectCandidate();
  button('knowledge-preview').click(); await vi.waitFor(() => expect(document.querySelector('[data-testid=knowledge-preview-result]')).not.toBeNull());
  session.draft.value = 'x'.repeat(501); await nextTick();
  expect(document.querySelector('[data-testid=knowledge-preview-result]')).toBeNull();
  expect(button('knowledge-preview').disabled).toBe(true);
  expect(document.body.textContent).toContain('500');
  button('knowledge-use').click(); await nextTick(); await session.send();
  expect(send).not.toHaveBeenCalled(); expect(session.draft.value).toHaveLength(501);
  session.draft.value = 'short'; session.toolMode.value = 'git_status'; await nextTick();
  expect(button('knowledge-open').disabled).toBe(true);
  await session.send(); expect(send).not.toHaveBeenCalled();
  expect(host.textContent).toContain('PREBOUND'); expect(preview).toHaveBeenCalledTimes(1);
  expect(button('knowledge-remove').disabled).toBe(false);
  button('knowledge-remove').click(); await nextTick();
  expect(session.context.value).not.toHaveProperty('knowledgeExpertRef');
  expect(session.draft.value).toBe('short');
});
it('retains the original revision on preview conflict and does not reconnect or send', async () => {
  const { session, preview, send } = await setup(); await selectCandidate(); button('knowledge-use').click(); await nextTick();
  vi.mocked(runtimeApi.experts).mockResolvedValue({ items: [JSON.stringify({ id: 'saved', name: 'Saved expert' })], states: { saved: { enabled: true, builtin: false, revision: 5 } } });
  preview.mockRejectedValue({ response: { status: 409, data: { detail: 'EXPERT_CONTEXT_STALE' } } });
  button('knowledge-open').click(); await nextTick(); button('knowledge-preview').click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('不会自动升级版本'));
  expect(preview).toHaveBeenCalledWith(expertRef, 'original question');
  expect(session.context.value.knowledgeExpertRef).toEqual(expertRef);
  expect(session.draft.value).toBe('original question'); expect(send).not.toHaveBeenCalled();
});
it('cancels replacement, removes explicitly and removes on code mode change without sending or losing draft', async () => {
  const { session, send } = await setup(); await selectCandidate();
  button('knowledge-cancel').click(); await nextTick();
  expect(session.context.value).not.toHaveProperty('knowledgeExpertRef');
  await selectCandidate(); button('knowledge-use').click(); await nextTick();
  button('knowledge-remove').click(); await nextTick();
  expect(session.context.value).not.toHaveProperty('knowledgeExpertRef');
  expect(host.textContent).toContain('已移除知识引用');
  await selectCandidate(); button('knowledge-use').click(); await nextTick();
  button('composer-add').click(); await nextTick(); button('composer-cat-actions').click(); await nextTick();
  const mode = host.querySelector('.composer-popup-content select') as HTMLSelectElement;
  expect(mode).not.toBeNull(); mode.value = 'code'; mode.dispatchEvent(new Event('change', { bubbles: true })); await nextTick();
  expect(session.context.value).not.toHaveProperty('knowledgeExpertRef');
  expect(host.querySelector('[data-testid=knowledge-open]')).toBeNull();
  expect(host.textContent).toContain('已移除知识引用');
  expect(session.draft.value).toBe('original question'); expect(send).not.toHaveBeenCalled();
});
it('chooses a persisted enabled expert, previews the exact draft, then explicitly sends only its reference', async () => {
  const { session, send, preview } = await setup(); await selectCandidate();
  expect(document.querySelector('[data-testid=knowledge-candidate-disabled]')).toBeNull();
  button('knowledge-preview').click();
  await vi.waitFor(() => expect(document.body.textContent).toContain('untrusted excerpt'));
  expect(preview).toHaveBeenCalledWith(expertRef, 'original question');
  expect(document.querySelector('[data-testid=knowledge-dialog] script')).toBeNull();
  expect(document.body.textContent).toContain('不调用模型');
  expect(document.body.textContent).toContain('摘录');
  button('knowledge-use').click(); await nextTick();
  expect(session.context.value.knowledgeExpertRef).toEqual(expertRef);
  expect(session.draft.value).toBe('original question'); expect(send).not.toHaveBeenCalled();
  await session.send();
  expect(send.mock.calls[0]).toEqual(['c1', 'original question', 'none', expect.objectContaining({ knowledgeExpertRef: expertRef, instructions: '', files: [] })]);
});
