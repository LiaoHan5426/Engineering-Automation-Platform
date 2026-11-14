// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import { runtimeApi, type ModelConnection } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import ModelSettings from '../../../src/features/settings/ModelSettings.vue'

let app: App
let root: HTMLDivElement
const connection: ModelConnection = {
  id: 'existing',
  name: 'Existing connection',
  kind: 'openai-compatible',
  wireApi: 'chat-completions',
  baseUrl: 'https://example.test',
  secretPresent: true,
  enabled: true,
  defaultSelected: true,
  revision: 1,
  configurationRevision: '1',
  models: [],
  allowedModels: [],
  defaultModel: '',
  discoveredAt: '',
  discoveryError: '',
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
})
async function flush() {
  for (let i = 0; i < 8; i++) await nextTick()
}
async function mount() {
  vi.spyOn(runtimeApi, 'modelConnections').mockResolvedValue({
    items: [connection],
    effectiveDefaultId: connection.id,
  })
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(ModelSettings)
  app.use(i18n).mount(root)
  await flush()
}
async function open(edit = false) {
  const selector = edit ? '.connection-cards li button' : '.connection-list-heading button'
  ;(root.querySelector(selector) as HTMLButtonElement).click()
  await flush()
}
function form() {
  return document.querySelector('.connection-form') as HTMLFormElement | null
}
function input(index: number) {
  return form()!.querySelectorAll('input')[index] as HTMLInputElement
}
async function fill(index: number, value: string) {
  input(index).value = value
  input(index).dispatchEvent(new Event('input', { bubbles: true }))
  await flush()
}
type ClosePath = 'button' | 'escape' | 'backdrop'
async function close(path: ClosePath) {
  if (path === 'button') {
    ;(form()!.querySelector('.connection-editor-heading button') as HTMLButtonElement).click()
  } else if (path === 'escape') {
    form()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  } else {
    ;(document.querySelector('.eap-dialog-backdrop') as HTMLButtonElement).click()
  }
  await flush()
}
function confirmation() {
  return document.querySelector('.eap-confirm')
}
async function keep() {
  ;(confirmation()!.querySelector('[data-confirm-cancel]') as HTMLButtonElement).click()
  await flush()
}
async function discard() {
  ;(confirmation()!.querySelector('button') as HTMLButtonElement).click()
  await flush()
}

for (const path of ['button', 'escape', 'backdrop'] as const) {
  it(`closes an unchanged connection through ${path} without confirmation`, async () => {
    await mount()
    await open(true)
    await close(path)
    expect(form()).toBeNull()
    expect(confirmation()).toBeNull()
  })

  it(`protects dirty connection fields through ${path} and clears discarded secrets on reopening`, async () => {
    await mount()
    const save = vi.spyOn(runtimeApi, 'saveModelConnection')
    await open(true)
    await fill(0, 'Changed name')
    await fill(1, 'https://changed.test')
    await fill(2, 'typed-secret')
    await close(path)
    expect(confirmation()).not.toBeNull()
    expect(form()).not.toBeNull()
    expect(confirmation()!.textContent).toContain(i18n.global.t('product.discardImpact'))
    await keep()
    expect(confirmation()).toBeNull()
    expect(input(0).value).toBe('Changed name')
    expect(input(1).value).toBe('https://changed.test')
    expect(input(2).value).toBe('typed-secret')
    await close(path)
    await discard()
    expect(form()).toBeNull()
    expect(confirmation()).toBeNull()
    expect(save).not.toHaveBeenCalled()
    await open(true)
    expect(input(0).value).toBe(connection.name)
    expect(input(1).value).toBe(connection.baseUrl)
    expect(input(2).value).toBe('')
  })
}

it('protects a new connection with only a typed secret and allows reverting edits', async () => {
  await mount()
  await open()
  await fill(2, 'new-secret')
  await close('escape')
  expect(confirmation()).not.toBeNull()
  await keep()
  expect(input(2).value).toBe('new-secret')
  await fill(2, '')
  await close('button')
  expect(confirmation()).toBeNull()
  expect(form()).toBeNull()
})

it('protects protocol and enabled/default changes even when text fields are unchanged', async () => {
  await mount()
  await open(true)
  const protocol = form()!.querySelector('[data-testid="wire-api"]') as HTMLSelectElement
  protocol.value = 'responses'
  protocol.dispatchEvent(new Event('change', { bubbles: true }))
  await flush()
  await close('button')
  expect(confirmation()).not.toBeNull()
  await keep()
  protocol.value = 'chat-completions'
  protocol.dispatchEvent(new Event('change', { bubbles: true }))
  await flush()
  const checkboxes = form()!.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
  checkboxes[0].click()
  await flush()
  await close('backdrop')
  expect(confirmation()).not.toBeNull()
  await keep()
  checkboxes[0].click()
  checkboxes[1].click()
  await flush()
  await close('escape')
  expect(confirmation()).not.toBeNull()
})

it('blocks every close path while saving and retains the draft after a failed save', async () => {
  await mount()
  let rejectSave!: (error: Error) => void
  vi.spyOn(runtimeApi, 'saveModelConnection').mockImplementation(
    () =>
      new Promise((_resolve, reject) => {
        rejectSave = reject
      }),
  )
  await open(true)
  await fill(0, 'Pending edit')
  form()!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flush()
  const fields = [
    ...form()!.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input, select'),
  ]
  expect(fields).toHaveLength(7)
  expect(fields.every((field) => field.disabled)).toBe(true)
  for (const path of ['button', 'escape', 'backdrop'] as const) {
    await close(path)
    expect(form()).not.toBeNull()
    expect(confirmation()).toBeNull()
  }
  rejectSave(new Error('Save unavailable'))
  await flush()
  expect(fields.every((field) => !field.disabled)).toBe(true)
  expect(input(0).value).toBe('Pending edit')
  expect(form()!.querySelector('.eap-feedback--warning')?.textContent?.trim()).toBeTruthy()
  await close('button')
  expect(confirmation()).not.toBeNull()
})
