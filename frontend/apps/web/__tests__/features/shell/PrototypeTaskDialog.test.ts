// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, type App } from 'vue'
import { RequestError } from '@eap/request'
import { runtimeApi, type BoardTask, type PrototypeVersionRecord } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import PrototypeTaskDialog from '../../../src/features/shell/PrototypeTaskDialog.vue'
import { localProjectState } from '../../../src/features/shell/localProjects'
import { apiStorageScope } from '../../../src/lib/runtimeConfig'

let app: App, root: HTMLElement
const version = {
  id: 'version',
  title: 'Page',
  acceptance: ['Check page'],
} as PrototypeVersionRecord
const key = apiStorageScope + '.eap.prototype-task.v1.version'
const saved = { id: 'task', projectId: 'local-eap', prototypeVersionId: 'version' } as BoardTask
const button = (id: string) => document.querySelector(`[data-testid=${id}]`) as HTMLButtonElement
const title = () => document.querySelector('[data-testid=prototype-task-title]') as HTMLInputElement
function mount() {
  localProjectState.selectedId = 'local-eap'
  root = document.createElement('div')
  document.body.append(root)
  const close = vi.fn()
  app = createApp({ render: () => h(PrototypeTaskDialog, { version, onClose: close }) })
  app.use(i18n).mount(root)
  return close
}
async function edit(value: string) {
  title().value = value
  title().dispatchEvent(new Event('input'))
  await nextTick()
}
function closeDialog() {
  ;(document.querySelector('[data-eap-dialog-close]') as HTMLButtonElement).click()
}
afterEach(() => {
  app?.unmount()
  root?.remove()
  localStorage.clear()
  vi.restoreAllMocks()
})

it('protects an edited draft, retains edits on cancel and closes only after confirmation', async () => {
  const close = mount()
  await edit('Reviewed page')
  closeDialog()
  await nextTick()
  expect(close).not.toHaveBeenCalled()
  expect(document.querySelector('.eap-confirm')).not.toBeNull()
  ;(document.querySelector('[data-confirm-cancel]') as HTMLButtonElement).click()
  await nextTick()
  expect(title().value).toBe('Reviewed page')
  expect(document.querySelector('.eap-confirm')).toBeNull()
  closeDialog()
  await nextTick()
  ;(document.querySelector('.eap-confirm__actions button') as HTMLButtonElement).click()
  expect(close).toHaveBeenCalledTimes(1)
})
it('closes unchanged or reverted drafts without confirmation', async () => {
  const close = mount()
  await edit('Temporary')
  await edit('Page')
  closeDialog()
  expect(close).toHaveBeenCalledTimes(1)
  expect(document.querySelector('.eap-confirm')).toBeNull()
})
it('unlocks a fresh request after definitive 400 and creates a new identity for corrected input', async () => {
  const create = vi
    .spyOn(runtimeApi, 'createPrototypeTask')
    .mockRejectedValueOnce(new RequestError('Invalid input', { status: 400, data: {} }))
    .mockResolvedValueOnce(saved)
  mount()
  await edit('Invalid page')
  button('prototype-task-save').click()
  await vi.waitFor(() => expect(title().disabled).toBe(false))
  expect(localStorage.getItem(key)).toBeNull()
  expect(title().value).toBe('Invalid page')
  await edit('Correct page')
  button('prototype-task-save').click()
  await vi.waitFor(() => expect(button('prototype-task-board')).not.toBeNull())
  expect(create).toHaveBeenCalledTimes(2)
  expect(create.mock.calls[1]![0].requestId).not.toBe(create.mock.calls[0]![0].requestId)
  expect(create.mock.calls[1]![0].title).toBe('Correct page')
})
it('preserves an unknown request through a later 4xx and replays only its original identity', async () => {
  const create = vi
    .spyOn(runtimeApi, 'createPrototypeTask')
    .mockRejectedValueOnce(new Error('Response lost'))
    .mockRejectedValueOnce(new RequestError('Temporarily blocked', { status: 403, data: {} }))
    .mockResolvedValueOnce(saved)
  const close = mount()
  await edit('Reviewed page')
  button('prototype-task-save').click()
  await vi.waitFor(() => {
    expect(document.querySelector('.eap-dialog [role="alert"]')).not.toBeNull()
    expect(
      (document.querySelector('[data-eap-dialog-close]') as HTMLButtonElement).disabled,
    ).toBe(false)
  })
  const pending = localStorage.getItem(key)
  expect(pending).not.toBeNull()
  expect(title().disabled).toBe(true)
  closeDialog()
  expect(close).toHaveBeenCalledTimes(1)
  expect(document.querySelector('.eap-confirm')).toBeNull()
  button('prototype-task-save').click()
  await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(2))
  await vi.waitFor(() => expect(button('prototype-task-save').disabled).toBe(false))
  expect(localStorage.getItem(key)).toBe(pending)
  expect(title().disabled).toBe(true)
  button('prototype-task-save').click()
  await vi.waitFor(() => expect(button('prototype-task-board')).not.toBeNull())
  expect(create.mock.calls.map(([request]) => request)).toEqual([
    create.mock.calls[0]![0],
    create.mock.calls[0]![0],
    create.mock.calls[0]![0],
  ])
})
it('keeps restored intents frozen after a definitive error', async () => {
  const pending = {
    projectId: 'local-eap',
    title: 'Saved page',
    goal: 'Goal',
    acceptanceCriteria: 'Check',
    versionId: version.id,
    requestId: crypto.randomUUID(),
  }
  localStorage.setItem(key, JSON.stringify(pending))
  const create = vi.spyOn(runtimeApi, 'createPrototypeTask').mockRejectedValue(
    new RequestError('Not found', { status: 404, data: {} }),
  )
  mount()
  button('prototype-task-save').click()
  await vi.waitFor(() => expect(button('prototype-task-save').disabled).toBe(false))
  expect(title().disabled).toBe(true)
  expect(JSON.parse(localStorage.getItem(key)!)).toEqual(pending)
  expect(create).toHaveBeenCalledWith(pending)
})
