// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import PluginCenter from '../../../src/features/plugins/PluginCenter.vue'
import { createPluginHost } from '../../../src/features/plugins/host'
import { memoryStore, readInstallation } from '../../../src/features/plugins/model'
import { runtimeSnapshot } from './runtimeSnapshot'

let app: App | undefined
let root: HTMLDivElement
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve()
  await nextTick()
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
})
async function mount(store = memoryStore()) {
  const host = createPluginHost(store)
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(PluginCenter, { host })
  app.use(i18n).mount(root)
  const input = root.querySelector<HTMLInputElement>('[data-testid="plugin-check-project"]')!
  input.value = 'one'
  input.dispatchEvent(new Event('input', { bubbles: true }))
  await settle()
  return host
}
function click(id: string) {
  root.querySelector<HTMLButtonElement>('[data-testid="' + id + '"]')!.click()
}
it('confirms UI-only disable, preserves active core observation, checks while disabled and restores installation', async () => {
  const snapshot = runtimeSnapshot('one', {
    taskCount: 1,
    runCount: 2,
    activeRunCount: 1,
    unknownRunCount: 1,
  })
  const query = vi.spyOn(runtimeApi, 'boardRuntime').mockResolvedValue(snapshot)
  const cancel = vi.spyOn(runtimeApi, 'startBoardRun')
  const store = memoryStore()
  const host = await mount(store)
  click('plugin-check-dependencies')
  await settle()
  expect(root.textContent).toContain('Run：在途 1 · 结果未知 1')
  click('plugin-toggle-board')
  await settle()
  expect(host.installation.value.enabled.board).toBe(true)
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('2 条在途')
  document.querySelector<HTMLButtonElement>('[data-confirm-cancel]')!.click()
  await settle()
  expect(host.installation.value.enabled.board).toBe(true)
  click('plugin-toggle-board')
  await settle()
  document.querySelector<HTMLButtonElement>('.eap-confirm__actions button')!.click()
  await settle()
  expect(readInstallation(store).enabled.board).toBe(false)
  expect(host.boardDependencyCheck.value.snapshot).toEqual(snapshot)
  query.mockResolvedValue(runtimeSnapshot('one', { taskCount: 1, runCount: 2 }))
  click('plugin-check-dependencies')
  await settle()
  expect(host.installation.value.enabled.board).toBe(false)
  expect(root.querySelector('[data-testid="plugin-no-open-work"]')).not.toBeNull()
  expect(cancel).not.toHaveBeenCalled()
  click('plugin-toggle-board')
  await settle()
  expect(host.boardContributionVisible.value).toBe(true)
  expect(host.boardDependencyCheck.value.snapshot?.runCount).toBe(2)
})
it('retains the last snapshot after an unavailable read and warns about unverified scope when disabling', async () => {
  const query = vi
    .spyOn(runtimeApi, 'boardRuntime')
    .mockResolvedValue(runtimeSnapshot('one', { activeRunCount: 1 }))
  const host = await mount()
  click('plugin-check-dependencies')
  await settle()
  query.mockRejectedValueOnce(new Error('HTTP 503'))
  click('plugin-check-dependencies')
  await settle()
  expect(host.boardDependencyCheck.value.status).toBe('failed')
  expect(host.boardDependencyCheck.value.snapshot?.activeRunCount).toBe(1)
  expect(root.querySelector('[data-testid="plugin-snapshot-old"]')).not.toBeNull()
  click('plugin-toggle-board')
  await settle()
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain('不能确认是否有后台工作')
  expect(host.installation.value.enabled.board).toBe(true)
})
it('keeps installation enabled and confirmation visible when local preference persistence fails', async () => {
  const store = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota')
    },
  }
  const host = await mount(store)
  click('plugin-toggle-board')
  await settle()
  document.querySelector<HTMLButtonElement>('.eap-confirm__actions button')!.click()
  await settle()
  expect(host.installation.value.enabled.board).toBe(true)
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  expect(root.textContent).toContain('PLUGIN_INSTALLATION_PERSIST_FAILED')
})
