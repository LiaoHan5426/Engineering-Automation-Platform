// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { createApp, defineComponent, h, nextTick, ref, type App } from 'vue';
import { i18n } from '../../lib/i18n';
import { createPluginHost } from './host';
import PluginSlot from './PluginSlot.vue';

const ChatProbe = defineComponent({
  props: ['active'],
  setup() {
    const answer = ref('waiting');
    return () => h('section', { 'data-testid': 'chat-probe' }, [
      h('input'), h('button', { onClick: async () => { await pending; answer.value = 'finished'; } }, 'Send'), h('p', answer.value),
    ]);
  },
});
vi.mock('./BuilderWorkspace.vue', () => ({ default: defineComponent({
  props: ['instanceId'],
  setup(props) { return () => h('section', { 'data-testid': `builder-${props.instanceId}` }, [h('textarea')]); },
}) }));
let finish: () => void;
let pending: Promise<void>;
let app: App;
let root: HTMLDivElement;
afterEach(() => { app?.unmount(); root?.remove(); });

it('retains independent drafts and an in-flight response across areas, and releases disabled plugins', async () => {
  pending = new Promise(resolve => { finish = resolve; });
  const view = ref('chat');
  const host = createPluginHost({ getItem: () => null, setItem: () => {} });
  host.setEnabled('chat', true); host.setEnabled('builder', true);
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(PluginSlot, { viewId: view.value, host, chatView: ChatProbe }) }); app.use(i18n).mount(root);
  const chat = root.querySelector('[data-testid="chat-probe"]') as HTMLElement;
  (chat.querySelector('input')!).value = 'chat draft';
  chat.querySelector('button')!.click();
  view.value = 'builder-alpha'; await nextTick();
  const alpha = root.querySelector('[data-testid="builder-alpha"]') as HTMLElement;
  alpha.querySelector('textarea')!.value = 'alpha draft';
  view.value = 'builder-beta'; await nextTick();
  root.querySelector('[data-testid="builder-beta"] textarea')!.textContent = 'beta draft';
  view.value = 'model-settings'; await nextTick();
  finish(); await pending; await nextTick();
  expect(chat.style.display).toBe('none');
  expect(chat.textContent).toContain('finished');
  view.value = 'chat'; await nextTick();
  expect(root.querySelector('[data-testid="chat-probe"]')).toBe(chat);
  expect(chat.querySelector('input')!.value).toBe('chat draft');
  view.value = 'builder-alpha'; await nextTick();
  expect(root.querySelector('[data-testid="builder-alpha"]')).toBe(alpha);
  expect(alpha.querySelector('textarea')!.value).toBe('alpha draft');
  host.setEnabled('builder', false); await nextTick();
  expect(root.querySelector('[data-testid="builder-alpha"]')).toBeNull();
  expect(root.querySelector('[data-testid="builder-beta"]')).toBeNull();
  expect(root.querySelector('[data-testid="plugin-disabled"]')).not.toBeNull();
});
