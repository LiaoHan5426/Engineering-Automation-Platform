// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, h, nextTick, type App } from 'vue'
import { i18n } from '../../../src/lib/i18n'
import WorkDocumentDialog from '../../../src/features/chat/WorkDocumentDialog.vue'
import type { ChatTurn } from '../../../src/features/chat/chatSession'
let app: App, root: HTMLElement
afterEach(() => {
  app?.unmount()
  root?.remove()
  localStorage.clear()
  vi.restoreAllMocks()
})
function mount(close = vi.fn(), text = 'Original answer', executionId?: string) {
  root = document.createElement('div')
  document.body.append(root)
  app = createApp({
    render: () =>
      h(WorkDocumentDialog, {
        conversationId: 'one',
        sourceKey: 'answer',
        turn: { text, executionId, status: 'UNKNOWN' } as ChatTurn,
        onClose: close,
      }),
  })
  app.use(i18n).mount(root)
  return close
}
async function edit(value: string) {
  const input = document.querySelector('[data-testid=work-document-body]') as HTMLTextAreaElement
  input.value = value
  input.dispatchEvent(new Event('input'))
  await nextTick()
}
it('protects unsaved edits and closes a saved draft without a false discard prompt', async () => {
  const close = mount()
  await edit('Edited report')
  ;(document.querySelector('[data-eap-dialog-close]') as HTMLButtonElement).click()
  await nextTick()
  expect(document.querySelector('.eap-confirm')).not.toBeNull()
  ;(document.querySelector('.eap-confirm__actions button:last-child') as HTMLButtonElement).click()
  await nextTick()
  ;(document.querySelector('[data-testid=work-document-save]') as HTMLButtonElement).click()
  await nextTick()
  ;(document.querySelector('[data-eap-dialog-close]') as HTMLButtonElement).click()
  await nextTick()
  expect(close).toHaveBeenCalledTimes(1)
  expect(document.querySelector('.eap-confirm')).toBeNull()
  app.unmount()
  root.remove()
  mount()
  expect(
    (document.querySelector('[data-testid=work-document-body]') as HTMLTextAreaElement).value,
  ).toBe('Edited report')
})
it('does not load or overwrite a saved document when the answer at that position changes', async () => {
  mount()
  await edit('Saved report from the original answer')
  ;(document.querySelector('[data-testid=work-document-save]') as HTMLButtonElement).click()
  await nextTick()
  const stored = Array.from({ length: localStorage.length }, (_, index) => {
    const key = localStorage.key(index)!
    return [key, localStorage.getItem(key)]
  })
  app.unmount()
  root.remove()
  mount(vi.fn(), 'Different answer', 'different-execution')
  await nextTick()
  expect(
    (document.querySelector('[data-testid=work-document-body]') as HTMLTextAreaElement).value,
  ).toBe('Different answer')
  expect(
    (document.querySelector('[data-testid=work-document-save]') as HTMLButtonElement).disabled,
  ).toBe(true)
  expect(
    (document.querySelector('[data-testid=work-document-download]') as HTMLButtonElement).disabled,
  ).toBe(false)
  for (const [key, value] of stored) expect(localStorage.getItem(key!)).toBe(value)
})
