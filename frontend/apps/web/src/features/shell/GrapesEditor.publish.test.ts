// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { createApp, type App } from 'vue';
import { runtimeApi } from '@eap/runtime-client';
import { i18n } from '../../lib/i18n';
import GrapesEditorScaffold from './GrapesEditorScaffold.vue';
vi.mock('grapesjs', () => ({ default: { init: () => ({
  on: () => {}, setComponents: () => {}, destroy: () => {}, loadProjectData: () => {},
  getProjectData: () => ({ pages: [{ frames: [{ component: { tagName: 'section', components: [{ tagName: 'button', content: 'Design action' }] } }] }] }),
}) } }));
let app: App, root: HTMLDivElement;
afterEach(() => { app?.unmount(); root?.remove(); vi.restoreAllMocks(); localStorage.clear(); });
it('publishes into the actual Builder instance rather than always alpha', async () => {
  const save = vi.spyOn(runtimeApi, 'savePrototypeVersion').mockResolvedValue({ id: 'beta-design', sourceRef: 'builder-beta', title: 'Design', body: '', buttonPresses: 0, interaction: '', acceptance: [], contentHash: 'hash' });
  const published = vi.fn();
  root = document.createElement('div'); document.body.append(root);
  app = createApp(GrapesEditorScaffold, { sourceRef: 'builder-beta', onPublished: published }); app.use(i18n).mount(root);
  await vi.waitFor(() => expect((root.querySelector('[data-testid=grapes-publish]') as HTMLButtonElement).disabled).toBe(false));
  (root.querySelector('[data-testid=grapes-publish]') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(save).toHaveBeenCalledWith(expect.objectContaining({ sourceRef: 'builder-beta' })));
  expect(published).toHaveBeenCalledWith('beta-design');
  const body = JSON.parse(save.mock.calls[0]![0].body);
  expect(body.format).toBe('eap-prototype-v1');
  expect(body.schema.grapesProject.pages).toHaveLength(1);
});
