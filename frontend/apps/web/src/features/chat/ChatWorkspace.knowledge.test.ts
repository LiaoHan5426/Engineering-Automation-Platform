// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { createApp, nextTick, type App } from 'vue';
import { runtimeApi } from '@eap/runtime-client';
import { i18n } from '../../lib/i18n';
import ChatWorkspace from './ChatWorkspace.vue';
import { chatBinding, workbench } from '../shell/workbench';

let app: App, host: HTMLDivElement;
afterEach(() => { app?.unmount(); host?.remove(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); workbench.sessionExtras = {}; chatBinding.value = null; i18n.global.locale.value = 'zh-CN'; });
function button(id: string) { const value = document.querySelector<HTMLButtonElement>(`[data-testid=${id}]`); expect(value, id).not.toBeNull(); return value!; }
it('replays nullable server knowledgeContext without a knowledge evidence section', async () => {
  localStorage.setItem('eap.chat.history.v1', JSON.stringify({ version: 1, activeId: 'c1', items: [{ id: 'c1', title: 'plain chat', archived: false, draft: '', workspaceLabel: '', memory: '' }], transcripts: { c1: [{ role: 'assistant', text: 'ordinary answer', error: '', status: 'SUCCEEDED', approval: '', verification: '', toolEvents: [], artifactError: '', artifacts: [], knowledgeContext: null, knowledgeMemoryCleared: false }] } }));
  vi.spyOn(runtimeApi, 'aiStatus').mockResolvedValue({ state: 'disabled', provider: 'none', model: '', configurationRevision: '', lastObservedAt: null, errorCode: '', tools: { git_status: false }, workspaceLabel: '' });
  vi.spyOn(runtimeApi, 'modelConnections').mockResolvedValue({ effectiveDefaultId: null, items: [] });
  vi.spyOn(runtimeApi, 'aiConversation').mockResolvedValue({ workspaceLabel: '', memory: '' } as never);
  host = document.createElement('div'); document.body.append(host); app = createApp(ChatWorkspace); app.use(i18n).mount(host);
  await vi.waitFor(() => expect(host.textContent).toContain('ordinary answer'));
  expect(host.querySelector('[data-testid=turn-knowledge]')).toBeNull();
  expect(host.textContent).not.toContain('不是持久会话保证');
});
it('shows a rejected send memory notice only when the originating session is active', async () => {
  workbench.executionMode = 'chat'; workbench.sessionExtras = {};
  localStorage.setItem('eap.chat.history.v1', JSON.stringify({ version: 1, activeId: 'c1', items: ['c1', 'c2'].map(id => ({ id, title: id, archived: false, updatedAt: '', draft: id === 'c1' ? 'keep draft' : 'other draft', workspaceLabel: '', memory: '', connectionId: null, context: { mode: 'chat', knowledgeExpertRef: { id: 'saved', revision: 4 } } })), transcripts: { c1: [], c2: [] } }));
  vi.spyOn(runtimeApi, 'aiStatus').mockResolvedValue({ state: 'disabled', provider: 'none', model: '', configurationRevision: '', lastObservedAt: null, errorCode: '', tools: { git_status: false }, workspaceLabel: '' });
  vi.spyOn(runtimeApi, 'modelConnections').mockResolvedValue({ effectiveDefaultId: 'mock-local', items: [{ id: 'mock-local', name: 'Test model', kind: 'mock', enabled: true, models: [{ id: 'reasoning-demo', reasoningEfforts: [] }], allowedModels: ['reasoning-demo'], defaultModel: 'reasoning-demo' }] } as never);
  vi.spyOn(runtimeApi, 'aiConversation').mockResolvedValue({ workspaceLabel: '', memory: '', connectionId: 'mock-local', model: 'reasoning-demo' } as never);
  let reject!: (reason: unknown) => void;
  const send = vi.spyOn(runtimeApi, 'sendAiMessage').mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
  host = document.createElement('div'); document.body.append(host); app = createApp(ChatWorkspace); app.use(i18n).mount(host);
  await vi.waitFor(() => expect(chatBinding.value?.draft).toBe('keep draft'));
  button('send-message').click(); await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  chatBinding.value!.select('c2'); await nextTick();
  reject({ response: { status: 409, data: { detail: 'EXPERT_CONTEXT_STALE', knowledgeMemoryCleared: true } } });
  await vi.waitFor(() => expect(chatBinding.value?.sending).toBe(false)); await nextTick();
  expect(host.textContent).not.toContain('不是持久会话保证');
  expect(chatBinding.value?.draft).toBe('other draft');
  chatBinding.value!.select('c1');
  await vi.waitFor(() => expect(host.textContent).toContain('不是持久会话保证'));
  expect(chatBinding.value?.draft).toBe('keep draft'); expect(host.querySelector('[data-testid=turn-knowledge]')).toBeNull();
});
it.each([
  ['zh-CN', ''], ['zh-CN', 'MODEL_CALL_FAILED'], ['en-US', ''], ['en-US', 'MODEL_CALL_FAILED'],
] as const)('renders retrieved material without claiming provider delivery or citation (%s, %s)', async (locale, error) => {
  i18n.global.locale.value = locale;
  localStorage.clear(); sessionStorage.clear(); workbench.executionMode = 'chat'; workbench.sessionExtras = {};
  vi.spyOn(runtimeApi, 'aiStatus').mockResolvedValue({ state: 'disabled', provider: 'none', model: '', configurationRevision: '', lastObservedAt: null, errorCode: '', tools: { git_status: false }, workspaceLabel: '' });
  vi.spyOn(runtimeApi, 'modelConnections').mockResolvedValue({ effectiveDefaultId: 'mock-local', items: [{ id: 'mock-local', name: 'Test model', kind: 'mock', enabled: true, models: [{ id: 'reasoning-demo', reasoningEfforts: [] }], allowedModels: ['reasoning-demo'], defaultModel: 'reasoning-demo' }] } as never);
  vi.spyOn(runtimeApi, 'openAiConversation').mockResolvedValue({ conversationId: 'c1', workspaceLabel: '', memory: '', connectionId: 'mock-local', model: 'reasoning-demo' });
  vi.spyOn(runtimeApi, 'assignConversationConnection').mockResolvedValue({ connectionId: 'mock-local', memoryCleared: false, connectionName: 'test', model: 'reasoning-demo' } as never);
  vi.spyOn(runtimeApi, 'experts').mockResolvedValue({ items: [JSON.stringify({ id: 'saved', name: 'Saved' })], states: { saved: { enabled: true, builtin: false, revision: 4 } } });
  const expertRef = { id: 'saved', revision: 4 };
  const preview = vi.spyOn(runtimeApi, 'previewExpertContext').mockResolvedValue({ expertRef, status: 'no_matches', references: [] });
  const send = vi.spyOn(runtimeApi, 'sendAiMessage').mockResolvedValue({ answer: error ? '' : 'answer', error, status: error ? 'FAILED' : 'SUCCEEDED', executionId: null, approval: '', verification: '', toolEvents: [], artifacts: [], artifactError: '', knowledgeMemoryCleared: true, knowledgeContext: { expertRef, status: 'ready', references: [{ id: 'K9', source: 'Server source', knowledgeBase: 'Actual scope', excerpt: 'server-only excerpt', retrievalMode: 'keyword' }] } });
  host = document.createElement('div'); document.body.append(host); app = createApp(ChatWorkspace); app.use(i18n).mount(host);
  await vi.waitFor(() => expect(host.querySelector('.composer-draft')).not.toBeNull());
  const draft = host.querySelector('.composer-draft') as HTMLTextAreaElement;
  draft.value = 'original question'; draft.dispatchEvent(new Event('input', { bubbles: true })); await nextTick();
  button('composer-add').click(); await nextTick(); button('composer-cat-experts').click(); await nextTick();
  button('knowledge-open').click(); await vi.waitFor(() => expect(document.querySelector('[data-testid=knowledge-candidate-saved]')).not.toBeNull());
  button('knowledge-candidate-saved').click(); await nextTick(); button('knowledge-preview').click();
  await vi.waitFor(() => expect(document.querySelector('[data-testid=knowledge-preview-result]')).not.toBeNull());
  expect(preview).toHaveBeenCalledWith(expertRef, 'original question');
  button('knowledge-use').click(); await nextTick(); expect(send).not.toHaveBeenCalled();
  button('send-message').click(); await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  expect(send.mock.calls[0]?.[3]?.knowledgeExpertRef).toEqual(expertRef);
  await vi.waitFor(() => expect(host.textContent).toContain('server-only excerpt'));
  expect(host.textContent).toContain(locale === 'zh-CN' ? '已检索 / 准备' : 'retrieved / prepared');
  expect(host.textContent).toContain(locale === 'zh-CN' ? '不证明已发送给模型提供方或被模型引用' : 'not proof of delivery to the model provider or model citation');
  expect(host.textContent).not.toContain(locale === 'zh-CN' ? '已提供给模型' : 'provided to the model');
  expect(host.textContent).toContain(locale === 'zh-CN' ? '不是持久会话保证' : 'not a durable session guarantee');
});
