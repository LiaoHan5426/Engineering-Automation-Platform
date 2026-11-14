// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import { runtimeApi, type ModelConnection } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import ModelSettings from '../../../src/features/settings/ModelSettings.vue'
let app: App
let root: HTMLDivElement
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
})
const row = (id: string): ModelConnection => ({
  id,
  name: id,
  defaultModel: '',
  models: [],
  allowedModels: [],
  discoveredAt: '',
  discoveryError: '',
  kind: 'openai-compatible',
  enabled: true,
  baseUrl: 'https://example.test',
  secretPresent: true,
  revision: 1,
  defaultSelected: false,
  configurationRevision: '1',
})
async function flush() {
  for (let i = 0; i < 8; i++) await nextTick()
}
it('adds a second connection without updating the first, and only edits when explicitly selected', async () => {
  const rows = [row('GPT')]
  vi.spyOn(runtimeApi, 'modelConnections').mockImplementation(async () => ({
    items: [...rows],
    effectiveDefaultId: null,
  }))
  vi.spyOn(runtimeApi, 'refreshConnectionModels').mockImplementation(async () => row('DeepSeek'))
  const save = vi.spyOn(runtimeApi, 'saveModelConnection').mockImplementation(async (input) => {
    const added = { ...row('DeepSeek'), ...input, secretPresent: true }
    rows.push(added)
    return added
  })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(ModelSettings)
  app.use(i18n).mount(root)
  await flush()
  expect(root.textContent).toContain('模型设置')
  expect(root.querySelectorAll('li')).toHaveLength(1)
  expect(document.querySelector('form')).toBeNull()
  const addConnection = root.querySelector('.connection-list-heading button') as HTMLButtonElement
  expect(addConnection.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
  expect(addConnection.textContent?.trim()).toBe(i18n.global.t('composerUi.addConnection'))
  ;(root.querySelector('.connection-list-heading button') as HTMLButtonElement).click()
  await flush()
  const inputs = document.querySelectorAll('form input')
  const protocol = document.querySelector('[data-testid="wire-api"]') as HTMLSelectElement
  expect(protocol.value).toBe('chat-completions')
  protocol.value = 'responses'
  protocol.dispatchEvent(new Event('change', { bubbles: true }))
  ;(inputs[0] as HTMLInputElement).value = 'DeepSeek'
  inputs[0].dispatchEvent(new Event('input'))
  document
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
  expect(save.mock.calls[0][1]).toBeUndefined()
  expect(save.mock.calls[0][0]).toHaveProperty('wireApi', 'responses')
  expect(save.mock.calls[0][0]).not.toHaveProperty('model')
  expect(root.querySelectorAll('li')).toHaveLength(2)
  expect(document.querySelector('.connection-form')).toBeNull()
  expect(document.body.textContent).toContain('请选择允许使用的模型')
  expect(document.querySelector('[data-testid="allowlist-hint"]')?.textContent).toContain(
    '不会自动勾选',
  )
  ;(
    document.querySelector(
      '.model-catalog .catalog-actions:last-child button:last-child',
    ) as HTMLButtonElement
  ).click()
  await flush()
  ;(root.querySelector('li button') as HTMLButtonElement).click()
  await flush()
  expect((document.querySelector('form input') as HTMLInputElement).value).toBe('GPT')
  expect((document.querySelector('[data-testid="wire-api"]') as HTMLSelectElement).value).toBe(
    'chat-completions',
  )
  expect(rows[0].name).toBe('GPT')
})
it('keeps the cached-catalog note when post-save discovery fails', async () => {
  const rows = [row('GPT')]
  vi.spyOn(runtimeApi, 'modelConnections').mockImplementation(async () => ({
    items: [...rows],
    effectiveDefaultId: null,
  }))
  vi.spyOn(runtimeApi, 'refreshConnectionModels').mockResolvedValue({
    ...row('DeepSeek'),
    revision: 2,
    discoveryError: 'MODEL_DISCOVERY_UNAVAILABLE',
  })
  vi.spyOn(runtimeApi, 'saveModelConnection').mockImplementation(async (input) => {
    const added = { ...row('DeepSeek'), ...input, secretPresent: true, revision: 2 }
    rows.push(added)
    return added
  })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(ModelSettings)
  app.use(i18n).mount(root)
  await flush()
  ;(root.querySelector('.connection-list-heading button') as HTMLButtonElement).click()
  await flush()
  const inputs = document.querySelectorAll('form input')
  ;(inputs[0] as HTMLInputElement).value = 'DeepSeek'
  inputs[0].dispatchEvent(new Event('input'))
  document
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
  expect(document.body.textContent).toContain('同步失败，保留已有目录')
  expect(document.querySelector('.model-catalog')).not.toBeNull()
})

it('restores and saves Responses on edit and displays the effective account protocol', async () => {
  const configured = { ...row('responses-api'), wireApi: 'responses' as const }
  vi.spyOn(runtimeApi, 'modelConnections').mockResolvedValue({
    items: [configured, { ...row('plan'), kind: 'chatgpt-plan' }],
    effectiveDefaultId: null,
  })
  const save = vi.spyOn(runtimeApi, 'saveModelConnection').mockResolvedValue(configured)
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(ModelSettings)
  app.use(i18n).mount(root)
  await flush()
  for (const card of root.querySelectorAll('.connection-identity'))
    expect(card.textContent).toContain('Responses')
  ;(root.querySelector('li button') as HTMLButtonElement).click()
  await flush()
  expect((document.querySelector('[data-testid="wire-api"]') as HTMLSelectElement).value).toBe(
    'responses',
  )
  document
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
  expect(save).toHaveBeenCalledWith(
    expect.objectContaining({ wireApi: 'responses', secret: '' }),
    'responses-api',
  )
})

it('does not resync or replace the retained catalog on a protocol-only edit', async () => {
  const configured = {
    ...row('manual'),
    models: [{ id: 'manual-model', reasoningEfforts: [] }],
    allowedModels: ['manual-model'],
    defaultModel: 'manual-model',
  }
  vi.spyOn(runtimeApi, 'modelConnections').mockResolvedValue({
    items: [configured],
    effectiveDefaultId: null,
  })
  vi.spyOn(runtimeApi, 'saveModelConnection').mockResolvedValue({
    ...configured,
    wireApi: 'responses',
    revision: 2,
  })
  const refresh = vi.spyOn(runtimeApi, 'refreshConnectionModels').mockResolvedValue(configured)
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(ModelSettings)
  app.use(i18n).mount(root)
  await flush()
  ;(root.querySelector('li button') as HTMLButtonElement).click()
  await flush()
  const protocol = document.querySelector('[data-testid="wire-api"]') as HTMLSelectElement
  protocol.value = 'responses'
  protocol.dispatchEvent(new Event('change', { bubbles: true }))
  document
    .querySelector('form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
  expect(refresh).not.toHaveBeenCalled()
  expect(document.querySelector('.model-catalog')?.textContent).toContain('manual-model')
})

it('settles an accepted new connection when overview refresh fails without offering duplicate creation', async () => {
  vi.spyOn(runtimeApi, 'modelConnections')
    .mockResolvedValueOnce({ items: [], effectiveDefaultId: null })
    .mockRejectedValue(new Error('overview unavailable'))
  const saved = { ...row('accepted'), name: 'Accepted connection' }
  const save = vi.spyOn(runtimeApi, 'saveModelConnection').mockResolvedValue(saved)
  vi.spyOn(runtimeApi, 'refreshConnectionModels').mockResolvedValue(saved)
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(ModelSettings)
  app.use(i18n).mount(root)
  await flush()
  ;(root.querySelector('.connection-list-heading button') as HTMLButtonElement).click()
  await flush()
  const name = document.querySelector('.connection-form input') as HTMLInputElement
  name.value = 'Accepted connection'
  name.dispatchEvent(new Event('input'))
  document
    .querySelector('.connection-form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
  expect(save).toHaveBeenCalledOnce()
  expect(document.querySelector('.connection-form')).toBeNull()
  expect(document.querySelector('.model-catalog')).not.toBeNull()
  expect(root.querySelectorAll('.connection-cards li')).toHaveLength(1)
  expect(document.body.textContent).toContain('无需再次创建')
  ;(
    document.querySelector(
      '.model-catalog .catalog-actions:last-child button:last-child',
    ) as HTMLButtonElement
  ).click()
  await flush()
  ;(root.querySelector('.connection-cards li button') as HTMLButtonElement).click()
  await flush()
  expect((document.querySelector('.connection-form input') as HTMLInputElement).value).toBe(
    'Accepted connection',
  )
  expect(
    (document.querySelector('.connection-form input[type="password"]') as HTMLInputElement).value,
  ).toBe('')
})
