// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vite-plus/test';
import { chatStorage } from './chatService';
afterEach(() => localStorage.clear());
it('isolates mock drafts and backend conversation IDs from live history', () => {
  const live = chatStorage(false, localStorage), mock = chatStorage(true, localStorage);
  live.setItem('eap.chat.history.v1', 'live-conversation');
  mock.setItem('eap.chat.history.v1', 'mock-conversation');
  expect(live.getItem('eap.chat.history.v1')).toBe('live-conversation');
  expect(mock.getItem('eap.chat.history.v1')).toBe('mock-conversation');
});
