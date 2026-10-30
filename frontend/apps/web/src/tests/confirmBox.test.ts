// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { createApp, nextTick, type App } from 'vue';
import { ConfirmBox } from '@eap/ui';
let app: App, root: HTMLDivElement;
afterEach(() => { app?.unmount(); root?.remove(); document.querySelectorAll(".eap-confirm").forEach((node) => node.remove()); });
it('focuses cancel, contains Tab navigation and cancels with Escape', async () => {
  root = document.createElement('div'); document.body.append(root);
  const cancel = vi.fn();
  app = createApp(ConfirmBox, { title: 'Unsaved edits', impact: ['Draft only'], confirmLabel: 'Discard', onCancel: cancel });
  app.mount(root); await nextTick();
  const buttons = document.querySelectorAll('.eap-confirm button');
  expect(document.activeElement).toBe(buttons[1]);
  buttons[1]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  expect(document.activeElement).toBe(buttons[0]);
  buttons[0]!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
  expect(cancel).toHaveBeenCalledTimes(1);
});
