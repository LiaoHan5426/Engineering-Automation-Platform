// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, ref, type App } from 'vue'
import { runtimeApi, type ModelConnection, type TaskContext } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import TaskComposer from '../../../src/features/chat/TaskComposer.vue'
import { workbench } from '../../../src/features/shell/workbench'

let app: App
let root: HTMLDivElement
const current: ModelConnection = {
  id: 'current',
  name: 'Current',
  kind: 'openai-compatible',
  baseUrl: 'https://example.test',
  enabled: true,
  defaultSelected: false,
  secretPresent: true,
  revision: 1,
  configurationRevision: '1',
  defaultModel: 'model-a',
  models: [{ id: 'model-a', reasoningEfforts: [] }],
  allowedModels: ['model-a'],
  discoveredAt: '',
  discoveryError: '',
}
const context: TaskContext = {
  mode: 'chat',
  expert: 'general',
  instructions: '',
  reasoning: 'default',
  approval: 'review',
  files: [],
  prototypeVersionId: '',
  targetPath: '',
}
async function flush() {
  for (let i = 0; i < 12; i++) await nextTick()
}
async function mount(connectionId: string | null = current.id) {
  location.hash = '#chat'
  const draft = ref('Keep this exact draft')
  const active = ref(true)
  const composer = ref<InstanceType<typeof TaskComposer>>()
  const update = vi.fn()
  const changed = vi.fn()
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({
    render: () =>
      h(
        TaskComposer,
        {
          ref: composer,
          context,
          active: active.value,
          draft: draft.value,
          disabled: false,
          reasoningEfforts: [],
          modelConnectionId: connectionId,
          onUpdate: update,
          onConnectionsChanged: changed,
        },
        { draft: () => h('textarea', { value: draft.value }) },
      ),
  })
  app.use(i18n).mount(root)
  await flush()
  return { draft, active, update, changed, composer }
}
async function openSetup() {
  ;(root.querySelector('[data-testid="model-picker"]') as HTMLButtonElement).click()
  await flush()
  ;(document.querySelector('[data-testid="model-setup-link"]') as HTMLButtonElement).click()
  await flush()
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
  location.hash = ''
  workbench.sessionExtras = {}
})
it('ignores setup directory results after leaving the calling chat', async () => {
  let resolve!: (page: { items: ModelConnection[]; effectiveDefaultId: string | null }) => void
  vi.spyOn(runtimeApi, 'modelConnections').mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  const state = await mount()
  await openSetup()
  state.active.value = false
  await flush()
  resolve({ items: [current], effectiveDefaultId: current.id })
  await flush()
  expect(document.querySelector('.connection-form')).toBeNull()
  expect(state.changed).not.toHaveBeenCalled()
  expect(state.draft.value).toBe('Keep this exact draft')
})
it('edits only the current connection in place and protects the draft on discard', async () => {
  vi.spyOn(runtimeApi, 'modelConnections').mockResolvedValue({
    items: [current],
    effectiveDefaultId: current.id,
  })
  const save = vi.spyOn(runtimeApi, 'saveModelConnection')
  const state = await mount()
  const activeSession = workbench.activeSessionId
  await openSetup()
  expect(location.hash).toBe('#chat')
  const name = document.querySelector('.connection-form input') as HTMLInputElement
  expect(name.value).toBe('Current')
  name.value = 'Unsaved'
  name.dispatchEvent(new Event('input'))
  ;(document.querySelector('.connection-editor-heading button') as HTMLButtonElement).click()
  await flush()
  expect(document.querySelector('.connection-form')).not.toBeNull()
  const discard = [...document.querySelectorAll('button')].find(
    (button) => button.textContent?.trim() === i18n.global.t('product.discard'),
  )!
  discard.click()
  await flush()
  expect(document.querySelector('.connection-form')).toBeNull()
  expect(state.draft.value).toBe('Keep this exact draft')
  expect((root.querySelector('textarea') as HTMLTextAreaElement).value).toBe(state.draft.value)
  expect(workbench.activeSessionId).toBe(activeSession)
  expect(state.update).not.toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
})
it('keeps save errors inside the bounded editor without changing chat context', async () => {
  vi.spyOn(runtimeApi, 'modelConnections').mockResolvedValue({
    items: [current],
    effectiveDefaultId: current.id,
  })
  vi.spyOn(runtimeApi, 'saveModelConnection').mockRejectedValue(new Error('Save failed here'))
  const state = await mount()
  await openSetup()
  document
    .querySelector('.connection-form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
  expect(document.querySelector('.connection-form')?.textContent).toContain(
    i18n.global.t('presentation.failure'),
  )
  expect(location.hash).toBe('#chat')
  expect(state.update).not.toHaveBeenCalled()
  expect(state.changed).not.toHaveBeenCalled()
})
it('creates once, retries only readback, and never selects or submits a model', async () => {
  const read = vi
    .spyOn(runtimeApi, 'modelConnections')
    .mockResolvedValueOnce({ items: [], effectiveDefaultId: null })
    .mockRejectedValueOnce(new Error('Read unavailable'))
    .mockResolvedValue({ items: [current], effectiveDefaultId: current.id })
  const save = vi.spyOn(runtimeApi, 'saveModelConnection').mockResolvedValue(current)
  vi.spyOn(runtimeApi, 'refreshConnectionModels').mockResolvedValue(current)
  const state = await mount(null)
  await openSetup()
  document
    .querySelector('.connection-form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
  expect(save).toHaveBeenCalledOnce()
  expect(save.mock.calls[0][1]).toBeUndefined()
  expect(document.querySelector('.connection-form')).toBeNull()
  expect(document.querySelector('[data-testid="connection-dialog"]')?.textContent).toContain(
    '无需再次创建',
  )
  const retry = document.querySelector(
    '[data-testid="connection-readback-retry"]',
  ) as HTMLButtonElement
  retry.click()
  await flush()
  expect(read).toHaveBeenCalledTimes(3)
  expect(save).toHaveBeenCalledOnce()
  expect(state.changed).toHaveBeenCalled()
  expect(state.update).not.toHaveBeenCalled()
  expect(state.draft.value).toBe('Keep this exact draft')
  expect(location.hash).toBe('#chat')
})

it('blocks host navigation for dirty edits and runs only the confirmed discard callback', async () => {
  vi.spyOn(runtimeApi, 'modelConnections').mockResolvedValue({
    items: [current],
    effectiveDefaultId: current.id,
  })
  const state = await mount()
  await openSetup()
  const name = document.querySelector('.connection-form input') as HTMLInputElement
  name.value = 'Unsaved'
  name.dispatchEvent(new Event('input'))
  const leave = vi.fn()
  expect(state.composer.value!.guardLeave(leave)).toBe(false)
  await flush()
  expect(leave).not.toHaveBeenCalled()
  ;(document.querySelector('[data-confirm-cancel]') as HTMLButtonElement).click()
  await flush()
  expect(document.querySelector('.connection-form')).not.toBeNull()
  expect(state.composer.value!.guardLeave(leave)).toBe(false)
  await flush()
  ;[...document.querySelectorAll('button')]
    .find((b) => b.textContent?.trim() === i18n.global.t('product.discard'))!
    .click()
  await flush()
  expect(leave).toHaveBeenCalledOnce()
  expect(document.activeElement).toBe(root.querySelector('[data-testid="model-picker"]'))
})
it('blocks navigation during saving and restores keyboard escape after a failed save', async () => {
  vi.spyOn(runtimeApi, 'modelConnections').mockResolvedValue({
    items: [current],
    effectiveDefaultId: current.id,
  })
  let reject!: (error: Error) => void
  vi.spyOn(runtimeApi, 'saveModelConnection').mockImplementation(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail
      }),
  )
  const state = await mount()
  await openSetup()
  const name = document.querySelector('.connection-form input') as HTMLInputElement
  name.value = 'Unsaved'
  name.dispatchEvent(new Event('input'))
  document
    .querySelector('.connection-form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
  expect(state.composer.value!.guardLeave(vi.fn())).toBe(false)
  expect(document.body.textContent).not.toContain(i18n.global.t('product.discardTitle'))
  // A browser blurs the disabled submit button while the request is pending.
  document.body.tabIndex = -1
  document.body.focus()
  reject(new Error('failed'))
  await flush()
  expect(document.querySelector('.connection-form')!.contains(document.activeElement)).toBe(true)
  document.activeElement!.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  )
  await flush()
  expect(document.body.textContent).toContain(i18n.global.t('product.discardTitle'))
  document.body.removeAttribute('tabindex')
})
it('locks the catalog while the first credential-save readback is pending', async () => {
  let resolveRead!: (page: { items: ModelConnection[]; effectiveDefaultId: string }) => void
  vi.spyOn(runtimeApi, 'modelConnections')
    .mockResolvedValueOnce({ items: [], effectiveDefaultId: null })
    .mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve
        }),
    )
  vi.spyOn(runtimeApi, 'saveModelConnection').mockResolvedValue(current)
  const discover = vi.spyOn(runtimeApi, 'refreshConnectionModels').mockResolvedValue(current)
  const configure = vi.spyOn(runtimeApi, 'configureConnectionModels')
  const state = await mount(null)
  await openSetup()
  document
    .querySelector('.connection-form')!
    .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
  const catalog = document.querySelector('.model-catalog')!
  expect(catalog).not.toBeNull()
  expect(
    [...catalog.querySelectorAll('input, select, button')].every(
      (control) => (control as HTMLInputElement).disabled,
    ),
  ).toBe(true)
  expect(state.composer.value!.guardLeave()).toBe(false)
  catalog.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  ;(catalog.querySelector('.catalog-actions button') as HTMLButtonElement).click()
  ;(
    catalog.querySelector('.catalog-actions:last-child button:last-child') as HTMLButtonElement
  ).click()
  await flush()
  expect(document.querySelector('.model-catalog')).toBe(catalog)
  expect(configure).not.toHaveBeenCalled()
  expect(discover).toHaveBeenCalledOnce()
  resolveRead({ items: [current], effectiveDefaultId: current.id })
  await flush()
  expect(state.changed).toHaveBeenLastCalledWith([current])
  expect(state.composer.value!.guardLeave()).toBe(true)
})
it.each(['save', 'discovery'] as const)(
  'keeps accepted catalog %s open on failed readback and retries only the read',
  async (operation) => {
    const plan = { ...current, kind: 'chatgpt-plan' as const }
    let resolveRead!: (page: { items: ModelConnection[]; effectiveDefaultId: string }) => void
    const read = vi
      .spyOn(runtimeApi, 'modelConnections')
      .mockResolvedValueOnce({ items: [plan], effectiveDefaultId: plan.id })
      .mockRejectedValueOnce(new Error('Read failed'))
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveRead = resolve
          }),
      )
    const save = vi.spyOn(runtimeApi, 'configureConnectionModels').mockResolvedValue(plan)
    const discover = vi.spyOn(runtimeApi, 'refreshConnectionModels').mockResolvedValue(plan)
    const state = await mount()
    await openSetup()
    if (operation === 'save')
      document
        .querySelector('.model-catalog')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    else (document.querySelector('.catalog-actions button') as HTMLButtonElement).click()
    await flush()
    expect(document.querySelector('.model-catalog')).not.toBeNull()
    expect(document.querySelector('[data-testid="connection-readback-retry"]')).not.toBeNull()
    expect(save).toHaveBeenCalledTimes(operation === 'save' ? 1 : 0)
    ;(
      document.querySelector('[data-testid="connection-readback-retry"]') as HTMLButtonElement
    ).click()
    await flush()
    expect(read).toHaveBeenCalledTimes(3)
    const catalog = document.querySelector('.model-catalog')!
    expect(
      [...catalog.querySelectorAll('input, select, button')].every(
        (control) => (control as HTMLInputElement).disabled,
      ),
    ).toBe(true)
    expect(state.composer.value!.guardLeave()).toBe(false)
    catalog.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    ;(catalog.querySelector('.catalog-actions button') as HTMLButtonElement).click()
    ;(
      catalog.querySelector('.catalog-actions:last-child button:last-child') as HTMLButtonElement
    ).click()
    document.activeElement?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
    await flush()
    expect(document.querySelector('.model-catalog')).toBe(catalog)
    expect(read).toHaveBeenCalledTimes(3)
    resolveRead({ items: [plan], effectiveDefaultId: plan.id })
    await flush()
    expect(state.changed).toHaveBeenLastCalledWith([plan])
    expect(save).toHaveBeenCalledTimes(operation === 'save' ? 1 : 0)
    expect(discover).toHaveBeenCalledTimes(operation === 'discovery' ? 1 : 0)
    expect(state.composer.value!.guardLeave()).toBe(true)
  },
)
