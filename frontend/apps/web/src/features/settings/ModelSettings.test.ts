// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { createApp, nextTick, type App } from 'vue';
import { runtimeApi, type ModelConnection } from '@eap/runtime-client';
import { i18n } from '../../lib/i18n';
import ModelSettings from './ModelSettings.vue';
vi.mock('../../lib/serviceConfig', () => ({ useMockServices: false }));
let app: App; let root: HTMLDivElement;
afterEach(() => { app?.unmount(); root?.remove(); vi.restoreAllMocks(); });
const row = (id: string): ModelConnection => ({ id, name: id, defaultModel: '', models: [], allowedModels: [], discoveredAt: '', discoveryError: '', kind: 'openai-compatible', enabled: true, baseUrl: 'https://example.test', secretPresent: true, revision: 1, defaultSelected: false,  configurationRevision: '1' });
async function flush() { for (let i = 0; i < 8; i++) await nextTick(); }
it('adds a second connection without updating the first, and only edits when explicitly selected', async () => {
  const rows = [row('GPT')];
  vi.spyOn(runtimeApi, 'modelConnections').mockImplementation(async () => ({ items: [...rows], effectiveDefaultId: null }));
  vi.spyOn(runtimeApi, 'refreshConnectionModels').mockImplementation(async () => row('DeepSeek'));
  const save = vi.spyOn(runtimeApi, 'saveModelConnection').mockImplementation(async (input) => { const added = { ...row('DeepSeek'), ...input, secretPresent: true }; rows.push(added); return added; });
  root = document.createElement('div'); document.body.append(root);
  app = createApp(ModelSettings); app.use(i18n).mount(root); await flush();
  expect(root.textContent).toContain('模型设置');
  expect(root.querySelectorAll('li')).toHaveLength(1);
  expect(document.querySelector('form')).toBeNull();
  (root.querySelector('.connection-list-heading button') as HTMLButtonElement).click(); await flush();
  const inputs = document.querySelectorAll('form input');
  (inputs[0] as HTMLInputElement).value = 'DeepSeek'; inputs[0].dispatchEvent(new Event('input'));
  document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush();
  expect(save.mock.calls[0][1]).toBeUndefined();
  expect(save.mock.calls[0][0]).not.toHaveProperty("model");
  expect(root.querySelectorAll('li')).toHaveLength(2);
  expect(document.querySelector('.connection-form')).toBeNull();
  expect(document.body.textContent).toContain('请选择允许使用的模型');
  expect(document.querySelector('[data-testid="allowlist-hint"]')?.textContent).toContain('不会自动勾选');
  (document.querySelector('.model-catalog .catalog-actions:last-child button:last-child') as HTMLButtonElement).click(); await flush();
  (root.querySelector('li button') as HTMLButtonElement).click(); await flush();
  expect((document.querySelector('form input') as HTMLInputElement).value).toBe('GPT');
  expect(rows[0].name).toBe('GPT');
});
it('keeps the cached-catalog note when post-save discovery fails', async () => {
  const rows = [row('GPT')];
  vi.spyOn(runtimeApi, 'modelConnections').mockImplementation(async () => ({ items: [...rows], effectiveDefaultId: null }));
  vi.spyOn(runtimeApi, 'refreshConnectionModels').mockResolvedValue({
    ...row('DeepSeek'),
    revision: 2,
    discoveryError: 'MODEL_DISCOVERY_UNAVAILABLE',
  });
  vi.spyOn(runtimeApi, 'saveModelConnection').mockImplementation(async (input) => {
    const added = { ...row('DeepSeek'), ...input, secretPresent: true, revision: 2 };
    rows.push(added);
    return added;
  });
  root = document.createElement('div'); document.body.append(root);
  app = createApp(ModelSettings); app.use(i18n).mount(root); await flush();
  (root.querySelector('.connection-list-heading button') as HTMLButtonElement).click(); await flush();
  const inputs = document.querySelectorAll('form input');
  (inputs[0] as HTMLInputElement).value = 'DeepSeek'; inputs[0].dispatchEvent(new Event('input'));
  document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush();
  expect(document.body.textContent).toContain('同步失败，保留已有目录');
  expect(document.querySelector('.model-catalog')).not.toBeNull();
});
