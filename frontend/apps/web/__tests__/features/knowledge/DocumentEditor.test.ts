// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, type App } from 'vue'
import { runtimeApi } from '@eap/runtime-client'
import { i18n } from '../../../src/lib/i18n'
import Editor from '../../../src/features/knowledge/DocumentEditor.vue'
let app: App, root: HTMLElement
afterEach(() => {
  app?.unmount()
  root?.remove()
  vi.restoreAllMocks()
})
it('uses the original content digest and confirms the saved document by readback', async () => {
  const save = vi.spyOn(runtimeApi, 'updateKnowledgeDocument').mockResolvedValue({})
  vi.spyOn(runtimeApi, 'knowledgeDocuments').mockResolvedValue({
    items: [{ id: 'doc', title: 'Title', content: 'new content' }],
  })
  const saved = vi.fn()
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({
    render: () =>
      h(Editor, {
        baseId: 'base',
        document: { id: 'doc', title: 'Title', content: 'old content' },
        onSaved: saved,
      }),
  })
  app.use(i18n).mount(root)
  const input = document.querySelector(
    '[data-testid=knowledge-edit-content]',
  ) as HTMLTextAreaElement
  input.value = 'new content'
  input.dispatchEvent(new Event('input'))
  await vi.waitFor(() =>
    expect(
      (document.querySelector('[data-testid=knowledge-edit-save]') as HTMLButtonElement).disabled,
    ).toBe(false),
  )
  ;(document.querySelector('[data-testid=knowledge-edit-save]') as HTMLButtonElement).click()
  await vi.waitFor(() =>
    expect(saved).toHaveBeenCalledWith({ id: 'doc', title: 'Title', content: 'new content' }),
  )
  expect(save).toHaveBeenCalledWith(
    'base',
    'doc',
    expect.objectContaining({
      content: 'new content',
      expectedHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    }),
  )
})
