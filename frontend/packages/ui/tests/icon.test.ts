// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vite-plus/test';
import { createApp, h, ref, nextTick, type App } from 'vue';
import * as ui from '../src/index';
let app: App | undefined;
let root: HTMLDivElement | undefined;
afterEach(() => { app?.unmount(); root?.remove(); });
it('provides a single typed Icon entry through UI with reactive name and accessible label', async () => {
  expect(ui).toHaveProperty('Icon');
  const name = ref<'plus' | 'x'>('plus');
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(ui.Icon, { name: name.value, label: 'Action', size: 20 }) });
  app.mount(root);
  const svg = root.querySelector('svg')!;
  expect(svg.getAttribute('aria-label')).toBe('Action');
  expect(svg.getAttribute('role')).toBe('img');
  const shape = svg.innerHTML; name.value = 'x'; await nextTick();
  expect(root.querySelector('svg')!.innerHTML).not.toBe(shape);
});
it('fails closed for an unknown runtime icon name instead of loading remote content', () => {
  expect(ui).toHaveProperty('Icon');
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(ui.Icon, { name: 'https://invalid/icon.svg' as never }) });
  app.mount(root);
  expect(root.querySelector('svg, img')).toBeNull();
});
