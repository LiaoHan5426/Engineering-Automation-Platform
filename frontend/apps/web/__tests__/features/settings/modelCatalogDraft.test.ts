// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import { runtimeApi, type ModelConnection } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import ModelSettings from '../../../src/features/settings/ModelSettings.vue'
let app: App
let root: HTMLDivElement
const connection: ModelConnection = {
  id: 'desk',
  name: 'desk',
  kind: 'openai-compatible',
  wireApi: 'responses',
  enabled: true,
  baseUrl: 'https://example.test',
  secretPresent: true,
  defaultSelected: true,
  revision: 1,
  configurationRevision: '1',
  discoveredAt: '',
  discoveryError: '',
  models: [{ id: 'a', reasoningEfforts: [] }],
  allowedModels: ['a'],
  defaultModel: 'a',
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
})
async function flush() {
  for (let i = 0; i < 10; i++) await nextTick()
}
async function mount() {
  vi.spyOn(runtimeApi, 'modelConnections').mockResolvedValue({
    items: [connection],
    effectiveDefaultId: 'desk',
  })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(ModelSettings)
  app.use(i18n)
  const vm = app.mount(root) as unknown as { guardLeave: (callback?: () => void) => boolean }
  await flush()
  const manage = [...root.querySelectorAll('button')].find((b) =>
    b.textContent?.trim().startsWith(i18n.global.t('modelUi.manage')),
  )!
  expect(manage).toBeDefined()
  manage.click()
  await flush()
  return vm
}
for (const path of ['button', 'escape', 'backdrop'] as const) {
  it(`protects catalog changes through ${path} and retains draft on keep editing`, async () => {
    await mount()
    const choice = document.querySelector('.catalog-model input') as HTMLInputElement
    choice.click()
    await flush()
    if (path === 'button')
      (
        document.querySelector(
          '.model-catalog .catalog-actions:last-child button:last-child',
        ) as HTMLButtonElement
      ).click()
    else if (path === 'escape')
      document
        .querySelector('.model-catalog')!
        .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    else (document.querySelector('.eap-dialog-backdrop') as HTMLButtonElement).click()
    await flush()
    expect(document.querySelector('.eap-confirm')).not.toBeNull()
    ;(document.querySelector('[data-confirm-cancel]') as HTMLButtonElement).click()
    await flush()
    expect(choice.checked).toBe(false)
    expect(document.querySelector('.model-catalog')).not.toBeNull()
  })
}
it('runs navigation callback only after catalog discard confirmation', async () => {
  const vm = await mount()
  ;(document.querySelector('.catalog-model input') as HTMLInputElement).click()
  await flush()
  const leave = vi.fn()
  expect(vm.guardLeave(leave)).toBe(false)
  await flush()
  expect(leave).not.toHaveBeenCalled()
  ;(document.querySelector('.eap-confirm button') as HTMLButtonElement).click()
  await flush()
  expect(leave).toHaveBeenCalledOnce()
  expect(document.querySelector('.model-catalog')).toBeNull()
})
