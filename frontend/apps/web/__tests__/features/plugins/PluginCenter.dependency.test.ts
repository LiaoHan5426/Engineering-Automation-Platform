import { runtimeSnapshot } from './runtimeSnapshot'
// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import { createPluginHost } from '../../../src/features/plugins/host'
import { memoryStore } from '../../../src/features/plugins/model'
import PluginCenter from '../../../src/features/plugins/PluginCenter.vue'
let app: App | undefined
let root: HTMLDivElement
async function settle() {
  await Promise.resolve()
  await nextTick()
  await Promise.resolve()
  await nextTick()
}
afterEach(() => {
  app?.unmount()
  app = undefined
  root?.remove()
  vi.restoreAllMocks()
})
it('checks only on explicit click, displays scoped evidence, and ignores a late failure after unmount (simulated)', async () => {
  let reject!: (error: Error) => void
  const query = vi
    .spyOn(runtimeApi, 'boardRuntime')
    .mockImplementationOnce(async (project) => runtimeSnapshot(project))
    .mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail
        }),
    )
  const host = createPluginHost(memoryStore())
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(PluginCenter, { host })
  app.use(i18n).mount(root)
  expect(root.querySelector('[data-testid="plugin-runtime-board"]')?.textContent).toContain(
    '未检查',
  )
  expect(query).not.toHaveBeenCalled()
  const input = root.querySelector('[data-testid="plugin-check-project"]') as HTMLInputElement
  expect(input).not.toBeNull()
  input.value = 'project one'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  const button = root.querySelector(
    '[data-testid="plugin-check-dependencies"]',
  ) as HTMLButtonElement
  button.click()
  await settle()
  expect(query).toHaveBeenCalledExactlyOnceWith('project one', expect.any(AbortSignal))
  expect(
    root.querySelector('[data-testid="plugin-dependency-observation"]')?.textContent,
  ).toContain('Task/Run 状态可读取')
  expect(root.textContent).toContain('GET /api/board/runtime?projectId=project%20one')
  expect(root.textContent).toContain(host.boardDependencyCheck.value.observedAt)
  input.value = 'project two'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  expect(root.querySelector('[data-testid="plugin-check-stale"]')?.textContent).toContain(
    '重新检查',
  )
  expect(query).toHaveBeenCalledTimes(1)
  input.value = 'project one'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await nextTick()
  expect(root.querySelector('[data-testid="plugin-check-stale"]')).toBeNull()
  button.click()
  await nextTick()
  expect(button.disabled).toBe(true)
  expect(input.disabled).toBe(true)
  app.unmount()
  app = undefined
  reject(new Error('late failure'))
  await settle()
  expect(host.boardDependencyCheck.value.status).toBe('unchecked')
})
