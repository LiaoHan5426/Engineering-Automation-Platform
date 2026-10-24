// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { createApp, nextTick, type App } from 'vue';
import { runtimeApi, type ModelConnection } from '@eap/runtime-client';
import { i18n } from '../../lib/i18n';
import ModelSettings from './ModelSettings.vue';
let app: App; let root: HTMLDivElement;
afterEach(() => { app?.unmount(); root?.remove(); vi.restoreAllMocks(); });
const row = (id: string): ModelConnection => ({ id, name: id, model: id === 'GPT' ? 'gpt-test' : 'deepseek-chat', kind: 'openai-compatible', enabled: true, baseUrl: 'https://example.test', secretPresent: true, revision: 1, defaultSelected: false, environment: false, configurationRevision: '1' });
async function flush() { for (let i = 0; i < 8; i++) await nextTick(); }
it('adds a second connection without updating the first, and only edits when explicitly selected', async () => {
  const rows = [row('GPT')];
  vi.spyOn(runtimeApi, 'modelConnections').mockImplementation(async () => ({ items: [...rows], effectiveDefaultId: null }));
  const save = vi.spyOn(runtimeApi, 'saveModelConnection').mockImplementation(async (input) => { const added = { ...row('DeepSeek'), ...input, secretPresent: true }; rows.push(added); return added; });
  root = document.createElement('div'); document.body.append(root);
  app = createApp(ModelSettings); app.use(i18n).mount(root); await flush();
  expect(root.querySelectorAll('li')).toHaveLength(1);
  expect(document.querySelector('form')).toBeNull();
  (root.querySelector('.connection-list-heading button') as HTMLButtonElement).click(); await flush();
  const inputs = document.querySelectorAll('form input');
  (inputs[0] as HTMLInputElement).value = 'DeepSeek'; inputs[0].dispatchEvent(new Event('input'));
  document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush();
  expect(save.mock.calls[0][1]).toBeUndefined();
  expect(root.querySelectorAll('li')).toHaveLength(2);
  expect(document.querySelector('form')).toBeNull();
  (root.querySelector('li button') as HTMLButtonElement).click(); await flush();
  expect((document.querySelector('form input') as HTMLInputElement).value).toBe('GPT');
  expect(rows[0].name).toBe('GPT');
});
