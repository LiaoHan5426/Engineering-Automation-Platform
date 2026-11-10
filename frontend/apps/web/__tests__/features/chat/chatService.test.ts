// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
afterEach(() => {
  localStorage.clear()
  vi.unstubAllEnvs()
  vi.resetModules()
})
it('isolates browser history when a relative API proxy changes its configured destination', async () => {
  vi.stubEnv('VITE_API_SCOPE', 'http://127.0.0.1:8080/api')
  vi.resetModules()
  const first = (await import('../../../src/features/chat/chatService')).chatStorage(localStorage)
  first.setItem('eap.chat.history.v1', 'first-conversation')
  vi.stubEnv('VITE_API_SCOPE', 'http://127.0.0.1:53200/api')
  vi.resetModules()
  const second = (await import('../../../src/features/chat/chatService')).chatStorage(localStorage)
  expect(second.getItem('eap.chat.history.v1')).toBeNull()
  second.setItem('eap.chat.history.v1', 'second-conversation')
  expect(first.getItem('eap.chat.history.v1')).toBe('first-conversation')
  expect(second.getItem('eap.chat.history.v1')).toBe('second-conversation')
  expect(localStorage.getItem('eap.chat.history.v1')).toBeNull()
})
