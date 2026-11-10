// @vitest-environment happy-dom
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import {
  runtimeApi,
  type PrototypePublicationRequest,
  type PrototypeVersionRecord,
} from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import Editor from '../../../src/features/shell/GrapesEditorScaffold.vue'
import {
  publicationKey,
  readPublicationIntent,
} from '../../../src/features/shell/prototypePublication'
vi.mock('grapesjs', () => ({
  default: {
    init: () => ({
      on: () => {},
      destroy: () => {},
      setComponents: () => {},
      loadProjectData: () => {},
      getProjectData: () => ({
        pages: [
          {
            frames: [
              {
                component: {
                  tagName: 'section',
                  components: [{ tagName: 'button', content: 'Send' }],
                },
              },
            ],
          },
        ],
      }),
    }),
  },
}))
let app: App | undefined, root: HTMLElement
const published = vi.fn()
const version = (request: PrototypePublicationRequest): PrototypeVersionRecord => ({
  ...request,
  id: crypto.randomUUID(),
  contentHash: 'a'.repeat(64),
})
beforeEach(() => {
  localStorage.clear()
  published.mockClear()
})
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
})
async function mount() {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(Editor, { sourceRef: 'builder-alpha', onPublished: published })
  app.use(i18n).mount(root)
  await vi.waitFor(() => expect(button('grapes-publish').disabled).toBe(false))
}
const button = (id: string) => root.querySelector<HTMLButtonElement>('[data-testid="' + id + '"]')!
it('keeps a lost committed publication blocked until explicit lookup, without a second POST', async () => {
  let committed: PrototypeVersionRecord
  const save = vi.spyOn(runtimeApi, 'savePrototypeVersion').mockImplementation(async (request) => {
    expect(readPublicationIntent('builder-alpha')?.request).toEqual(request)
    committed = version(request)
    throw new Error('lost response')
  })
  const lookup = vi
    .spyOn(runtimeApi, 'prototypePublication')
    .mockImplementation(async () => committed)
  await mount()
  button('grapes-publish').click()
  await vi.waitFor(() =>
    expect(root.querySelector('[data-testid=publication-review]')).not.toBeNull(),
  )
  expect(button('grapes-publish').disabled).toBe(true)
  expect((app!._instance!.exposed as { prepareDisable: () => boolean }).prepareDisable()).toBe(
    false,
  )
  expect(published).not.toHaveBeenCalled()
  expect(lookup).not.toHaveBeenCalled()
  button('publication-check').click()
  await vi.waitFor(() => expect(published).toHaveBeenCalledWith(committed.id))
  expect(save).toHaveBeenCalledTimes(1)
  expect(readPublicationIntent('builder-alpha')).toBeNull()
})
it('retries only the original payload and identity after a confirmed absent lookup, preserving newer edits', async () => {
  const save = vi
    .spyOn(runtimeApi, 'savePrototypeVersion')
    .mockRejectedValueOnce(new Error('request interrupted'))
    .mockImplementation(async (request) => version(request))
  vi.spyOn(runtimeApi, 'prototypePublication').mockRejectedValue({ response: { status: 404 } })
  await mount()
  button('grapes-publish').click()
  await vi.waitFor(() => expect(button('publication-check')).not.toBeNull())
  const original = save.mock.calls[0]![0]
  const title = root.querySelector<HTMLInputElement>('[data-testid=grapes-title]')!
  title.value = 'Newer unsaved edit'
  title.dispatchEvent(new Event('input'))
  await nextTick()
  button('publication-check').click()
  await vi.waitFor(() => expect(button('publication-retry')).not.toBeNull())
  button('publication-retry').click()
  await vi.waitFor(() => expect(published).toHaveBeenCalledOnce())
  expect(save.mock.calls[1]![0]).toEqual(original)
  expect(title.value).toBe('Newer unsaved edit')
})
it('restores an unresolved request after remount and performs no automatic retry', async () => {
  const save = vi.spyOn(runtimeApi, 'savePrototypeVersion').mockRejectedValue(new Error('lost'))
  const lookup = vi
    .spyOn(runtimeApi, 'prototypePublication')
    .mockRejectedValue({ response: { status: 503 } })
  await mount()
  button('grapes-publish').click()
  await vi.waitFor(() => expect(readPublicationIntent('builder-alpha')).not.toBeNull())
  const raw = localStorage.getItem(publicationKey('builder-alpha'))
  app!.unmount()
  root.remove()
  app = undefined
  root = document.createElement('div')
  document.body.append(root)
  app = createApp(Editor, { sourceRef: 'builder-alpha', onPublished: published })
  app.use(i18n).mount(root)
  await vi.waitFor(() => expect(button('publication-check')).not.toBeNull())
  button('publication-check').click()
  await vi.waitFor(() => expect(lookup).toHaveBeenCalledOnce())
  expect(button('grapes-publish').disabled).toBe(true)
  expect(save).toHaveBeenCalledTimes(1)
  expect(localStorage.getItem(publicationKey('builder-alpha'))).toBe(raw)
})
it('rejects a response carrying a different publication identity', async () => {
  vi.spyOn(runtimeApi, 'savePrototypeVersion').mockImplementation(async (request) => ({
    ...version(request),
    requestId: crypto.randomUUID(),
  }))
  await mount()
  button('grapes-publish').click()
  await vi.waitFor(() => expect(button('grapes-publish').disabled).toBe(true))
  await vi.waitFor(() =>
    expect(root.querySelector('[data-testid=publication-review]')).not.toBeNull(),
  )
  expect(published).not.toHaveBeenCalled()
  expect(readPublicationIntent('builder-alpha')).not.toBeNull()
})
