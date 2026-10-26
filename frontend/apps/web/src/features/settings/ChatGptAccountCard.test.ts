// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test';
import { createApp, h, nextTick, type App } from 'vue';
import { runtimeApi } from '@eap/runtime-client';
import { i18n } from '../../lib/i18n';
import ChatGptAccountCard from './ChatGptAccountCard.vue';
let app: App; let root: HTMLDivElement;
afterEach(() => { app?.unmount(); root?.remove(); vi.restoreAllMocks(); vi.useRealTimers(); sessionStorage.clear(); });
async function flush() { for (let i = 0; i < 8; i++) await nextTick(); }
it('recovers a completed authorization when returning after the saved link expiry', async () => {
  const connected = vi.fn();
  sessionStorage.setItem('eap.chatgpt.pending-login', JSON.stringify({ loginId: 'finished', authorizationUrl: 'https://auth.openai.com/api/accounts/authorize?state=public-state', expiresAt: new Date(Date.now() - 1000).toISOString() }));
  const status = vi.spyOn(runtimeApi, 'chatGptLoginState').mockResolvedValue({ loginId: 'finished', state: 'connected', connectionId: 'account', error: '' });
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(ChatGptAccountCard, { onConnected: connected }) }); app.use(i18n).mount(root); await flush();
  expect(status).toHaveBeenCalledWith('finished');
  expect(connected).toHaveBeenCalledWith('account');
  expect(sessionStorage.getItem('eap.chatgpt.pending-login')).toBeNull();
});
it('starts browser authorization without requesting an API key and opens model setup only after a connected callback', async () => {
  vi.useFakeTimers(); const connected = vi.fn();
  vi.spyOn(window, 'open').mockReturnValue(null);
  vi.spyOn(runtimeApi, 'startChatGptLogin').mockResolvedValue({ loginId: 'login', authorizationUrl: 'https://auth.openai.com/api/accounts/authorize?state=public-state', expiresAt: new Date(Date.now() + 300000).toISOString() });
  vi.spyOn(runtimeApi, 'chatGptLoginState').mockResolvedValue({ loginId: 'login', state: 'connected', connectionId: 'account', error: '' });
  root = document.createElement('div'); document.body.append(root);
  app = createApp({ render: () => h(ChatGptAccountCard, { onConnected: connected }) }); app.use(i18n).mount(root); await flush();
  expect(root.querySelector('input')).toBeNull();
  (root.querySelector('button') as HTMLButtonElement).click(); await flush();
  expect(root.textContent).toContain('等待本机回调');
  expect(window.open).toHaveBeenCalledWith(expect.stringContaining('https://auth.openai.com/'), '_blank', 'noopener,noreferrer');
  expect(connected).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1500); await flush();
  expect(connected).toHaveBeenCalledWith('account');
  expect(sessionStorage.getItem('eap.chatgpt.pending-login')).toBeNull();
});
