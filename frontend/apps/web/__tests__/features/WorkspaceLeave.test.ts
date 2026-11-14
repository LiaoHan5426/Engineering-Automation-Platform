// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import Shell from '../../src/App.vue'
import { i18n } from '../../src/lib/i18n'
const state = vi.hoisted(() => ({ dirty: true, resume: undefined as (() => void) | undefined }))
vi.mock('../../src/features/chat/ChatWorkspace.vue', () => ({
  default: { template: '<section />' },
}))
vi.mock('../../src/features/shell/ProjectBoard.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      setup(_, { expose }) {
        expose({
          guardLeave: (resume: () => void) => {
            if (!state.dirty) return true
            state.resume = resume
            return false
          },
        })
        return () => h('section', { 'data-testid': 'guarded-board' })
      },
    }),
  }
})
let app: App | undefined
let root: HTMLElement | undefined
const flush = async () => {
  for (let i = 0; i < 12; i++) await nextTick()
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
  state.dirty = true
  state.resume = undefined
  localStorage.clear()
  sessionStorage.clear()
})
it('keeps the complete board location on rejected hash navigation and resumes the intended destination after discard', async () => {
  const original = '#board?projectId=local-eap&taskId=task-kept'
  window.history.replaceState(null, '', '/' + original)
  for (const method of [
    'health',
    'capabilities',
    'databases',
    'experts',
    'tasks',
    'stats',
  ] as const) {
    vi.spyOn(runtimeApi, method).mockRejectedValue(new Error('No service needed for shell guard'))
  }
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(Shell)
  app.use(i18n).mount(root)
  await flush()
  expect(root.querySelector('[data-testid="guarded-board"]')).not.toBeNull()
  window.history.replaceState(null, '', '/#appearance')
  window.dispatchEvent(new Event('hashchange'))
  await flush()
  expect(location.hash).toBe(original)
  expect(root.querySelector('[data-testid="guarded-board"]')).not.toBeNull()
  expect(state.resume).toBeTypeOf('function')
  state.dirty = false
  state.resume?.()
  window.dispatchEvent(new Event('hashchange'))
  await flush()
  expect(location.hash).toBe('#appearance')
  await vi.waitFor(() =>
    expect(root!.querySelector('[data-testid="appearance-settings"]')).not.toBeNull(),
  )
})
