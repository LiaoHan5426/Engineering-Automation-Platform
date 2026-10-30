// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { createApp, h, nextTick, type App } from 'vue';
import { modelApi } from '../chat/chatService';
import { i18n } from '../../lib/i18n';
import ChatGptAccountCard from './ChatGptAccountCard.vue';
vi.mock('../../lib/serviceConfig', () => ({ useMockServices: true }));
let app: App; let root: HTMLDivElement;
afterEach(() => { app?.unmount(); root?.remove(); sessionStorage.clear(); vi.restoreAllMocks(); });
it('requires explicit mock confirmation and never opens a real authorization page', async () => {
  const start = vi.spyOn(modelApi, 'startChatGptLogin').mockResolvedValue({ loginId: 'mock-login', authorizationUrl: '#mock', expiresAt: new Date(Date.now() + 10000).toISOString() });
  vi.spyOn(modelApi, 'chatGptLoginState').mockResolvedValue({ loginId: 'mock-login', state: 'connected', connectionId: 'mock-account', error: '' });
  const popup = vi.spyOn(window, 'open'); const connected = vi.fn();
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(ChatGptAccountCard, { onConnected: connected }) }); app.use(i18n).mount(root);
  (root.querySelector('button') as HTMLButtonElement).click(); await nextTick();
  expect(start).not.toHaveBeenCalled(); expect(root.querySelector('[data-testid="mock-login-consent"]')).not.toBeNull();
  (root.querySelector('[data-testid="mock-login-consent"] button') as HTMLButtonElement).click();
  await vi.waitFor(() => expect(connected).toHaveBeenCalledWith('mock-account'));
  expect(popup).not.toHaveBeenCalled();
});
