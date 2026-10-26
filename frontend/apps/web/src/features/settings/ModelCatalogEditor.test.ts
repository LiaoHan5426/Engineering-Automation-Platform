// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { createApp, h, nextTick, type App } from 'vue';
import { runtimeApi, type ModelConnection } from '@eap/runtime-client';
import { i18n } from '../../lib/i18n';
import ModelCatalogEditor from './ModelCatalogEditor.vue';
let app: App;
let root: HTMLDivElement;
afterEach(() => { app?.unmount(); root?.remove(); vi.restoreAllMocks(); });
const connection: ModelConnection = { id: 'desk', name: 'desk', kind: 'openai-compatible', enabled: true, baseUrl: 'https://example.test', defaultModel: '', models: [{ id: 'model-a', reasoningEfforts: [] }], allowedModels: [], discoveredAt: '', discoveryError: '', secretPresent: true, revision: 1, defaultSelected: true,  configurationRevision: '1' };
async function flush() { for (let i = 0; i < 8; i++) await nextTick(); }
async function mount() {
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(ModelCatalogEditor, { connection }) }); app.use(i18n).mount(root); await flush();
}
it('saves allowed models and explicitly configured effort separately from connection credentials', async () => {
  const save = vi.spyOn(runtimeApi, 'configureConnectionModels').mockResolvedValue(connection);
  await mount();
  const allowed = root.querySelector('.catalog-model input') as HTMLInputElement;
  allowed.checked = true; allowed.dispatchEvent(new Event('change')); await flush();
  const effort = root.querySelector('details input[value="high"]') as HTMLInputElement;
  effort.checked = true; effort.dispatchEvent(new Event('change')); await flush();
  root.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); await flush();
  expect(save).toHaveBeenCalledWith('desk', { models: [{ id: 'model-a', reasoningEfforts: ['high'] }], allowedModels: ['model-a'], defaultModel: 'model-a' });
});
it('merges synced models without silently enabling them and retains local selections after a failed refresh', async () => {
  vi.spyOn(runtimeApi, 'refreshConnectionModels').mockResolvedValue({ ...connection, models: [...connection.models, { id: 'model-b', reasoningEfforts: [] }], discoveryError: 'MODEL_DISCOVERY_HTTP_401' });
  await mount();
  const allowed = root.querySelector('.catalog-model input') as HTMLInputElement;
  allowed.checked = true; allowed.dispatchEvent(new Event('change')); await flush();
  (root.querySelector('.catalog-actions button') as HTMLButtonElement).click(); await flush();
  const choices = root.querySelectorAll('.catalog-model>label input');
  expect(choices.length).toBe(2);
  expect((choices[0] as HTMLInputElement).checked).toBe(true);
  expect((choices[1] as HTMLInputElement).checked).toBe(false);
  expect(root.textContent).toContain('MODEL_DISCOVERY_HTTP_401');
});
