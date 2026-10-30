// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { createApp, type App } from 'vue';
import { runtimeApi } from '@eap/runtime-client';
import { i18n } from '../../lib/i18n';
import RepositoryBrowser from '../../components/RepositoryBrowser.vue';
let app: App; let root: HTMLDivElement;
afterEach(() => { app?.unmount(); root?.remove(); vi.restoreAllMocks(); });
it('keeps directory choices after a source is denied so another file can be selected', async () => {
  vi.spyOn(runtimeApi, 'workspaceFiles').mockResolvedValue({ path: '', entries: [{ name: 'LICENSE', path: 'LICENSE', directory: false }, { name: 'App.vue', path: 'App.vue', directory: false }], denial: '', truncated: false });
  vi.spyOn(runtimeApi, 'workspaceSource').mockResolvedValueOnce({ path: 'LICENSE', exists: false, excerpt: '', bytes: 0, baseHash: '', denial: 'SOURCE_FILES_ONLY' }).mockResolvedValueOnce({ path: 'App.vue', exists: true, excerpt: 'readable', bytes: 8, baseHash: 'baseline', denial: '' });
  root = document.createElement('div'); document.body.append(root); app = createApp(RepositoryBrowser); app.use(i18n).mount(root);
  await vi.waitFor(() => expect(root.querySelectorAll('[data-testid^=repo-file-]')).toHaveLength(2));
  (root.querySelector('[data-testid="repo-file-LICENSE"]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(root.querySelector('[role="alert"]')?.textContent).toMatch(/源码预览仅支持|SOURCE_FILES_ONLY|source files/i));
  expect(root.querySelectorAll('[data-testid^=repo-file-]')).toHaveLength(2);
  (root.querySelector('[data-testid="repo-file-App.vue"]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(root.querySelector('pre')?.textContent).toBe('readable'));
  expect(root.querySelector('[role="alert"]')).toBeNull();
});
it('expands directories in-tree instead of entering the next path layer', async () => {
  const list = vi.spyOn(runtimeApi, 'workspaceFiles')
    .mockResolvedValueOnce({ path: '', entries: [{ name: 'frontend', path: 'frontend', directory: true }, { name: 'App.vue', path: 'App.vue', directory: false }], denial: '', truncated: false })
    .mockResolvedValueOnce({ path: 'frontend', entries: [{ name: 'package.json', path: 'frontend/package.json', directory: false }], denial: '', truncated: false });
  vi.spyOn(runtimeApi, 'workspaceSource').mockResolvedValue({ path: 'App.vue', exists: true, excerpt: 'source fixture', bytes: 14, baseHash: 'baseline', denial: '' });
  const apply = vi.spyOn(runtimeApi, 'applyCodeProposal'), send = vi.spyOn(runtimeApi, 'sendAiMessage');
  root = document.createElement('div'); document.body.append(root); app = createApp(RepositoryBrowser); app.use(i18n).mount(root);
  await vi.waitFor(() => expect(list).toHaveBeenCalledWith(''));
  await vi.waitFor(() => expect(root.querySelector('[data-testid="repo-dir-frontend"]')).not.toBeNull());
  expect(root.querySelector('[data-testid="repo-tree-hint"]')?.textContent).toMatch(/展开目录|Expand folders/);
  (root.querySelector('[data-testid="repo-dir-frontend"]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(list).toHaveBeenCalledWith('frontend'));
  await vi.waitFor(() => expect(root.textContent).toContain('package.json'));
  expect(root.querySelector('[data-testid="repo-dir-frontend"]')?.getAttribute('aria-expanded')).toBe('true');
  (root.querySelector('[data-testid="repo-file-App.vue"]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(root.querySelector('pre')?.textContent).toBe('source fixture'));
  expect(apply).not.toHaveBeenCalled(); expect(send).not.toHaveBeenCalled();
});
