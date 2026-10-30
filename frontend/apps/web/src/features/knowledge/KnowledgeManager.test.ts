// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { createApp, nextTick, type App } from 'vue';
import { runtimeApi } from '@eap/runtime-client';
import KnowledgeManager from './KnowledgeManager.vue';
let app: App; let root: HTMLDivElement;
afterEach(() => { app?.unmount(); root?.remove(); vi.restoreAllMocks(); });
const button = (text: string) => [...root.querySelectorAll('button')].find(node => node.textContent?.trim() === text)!;
it('submits creation by clicking the visible button and scopes retrieval explicitly', async () => {
  vi.spyOn(runtimeApi, 'knowledgeBases').mockResolvedValue({ items: [] });
  const create = vi.spyOn(runtimeApi, 'createKnowledgeBase').mockResolvedValue({ id: 'base-a' });
  vi.spyOn(runtimeApi, 'knowledgeDocuments').mockResolvedValue({ items: [] });
  const search = vi.spyOn(runtimeApi, 'searchKnowledge').mockResolvedValue({ items: [] });
  root = document.createElement('div'); document.body.append(root); app = createApp(KnowledgeManager); app.mount(root);
  await Promise.resolve(); await Promise.resolve(); await nextTick();
  await vi.waitFor(() => expect(root.textContent).toContain('还没有知识库'));
  button('＋ 新建').click(); await nextTick();
  const input = root.querySelector('form input') as HTMLInputElement;
  input.value = 'Acceptance'; input.dispatchEvent(new Event('input', { bubbles: true })); await nextTick();
  button('创建').click();
  await vi.waitFor(() => expect(create).toHaveBeenCalledWith('Acceptance', ''));
  await vi.waitFor(() => expect(root.textContent).toContain('知识库已创建'));
  button('知识检索').click(); await nextTick();
  const scope = root.querySelector('select')!; scope.value = 'current'; scope.dispatchEvent(new Event('change', { bubbles: true }));
  const query = root.querySelector('[aria-label="检索关键词"]') as HTMLInputElement;
  query.value = 'marker'; query.dispatchEvent(new Event('input', { bubbles: true })); await nextTick();
  button('检索').click();
  await vi.waitFor(() => expect(search).toHaveBeenCalledWith('marker', 'base-a'));
});
it('shows selection failures instead of rejecting an unhandled promise', async () => {
  vi.spyOn(runtimeApi, 'knowledgeBases').mockResolvedValue({ items: [{ id: 'a', name: 'A', description: '', documents: 0 }] });
  vi.spyOn(runtimeApi, 'knowledgeDocuments').mockRejectedValue(new Error('selection failed'));
  root = document.createElement('div'); document.body.append(root); app = createApp(KnowledgeManager); app.mount(root);
  await vi.waitFor(() => expect(root.textContent).toContain('A'));
  await vi.waitFor(() => expect(root.querySelector('.manager-item')).not.toBeNull());
  (root.querySelector('.manager-item') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(root.textContent).toContain('selection failed'));
});
