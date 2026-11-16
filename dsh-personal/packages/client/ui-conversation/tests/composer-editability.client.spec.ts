// @vitest-environment jsdom
import { createEditor, type LexicalEditor } from 'lexical'
import { createApp, defineComponent, h, nextTick, shallowRef } from 'vue'
import { expect, it, onTestFinished, vi } from 'vitest'
import { ComposerContentEditable } from '../src/client/input/editor/ComposerContentEditable.tsx'

it('commits the accepted echo before changing the resident editing host gate', async () => {
  const editor = createEditor({ namespace: 'composer-gate', onError: error => { throw error } })
  const bound = shallowRef<LexicalEditor | null>(editor)
  const editable = shallowRef(true)
  const echo = shallowRef('')
  const container = document.createElement('div')
  document.body.append(container)
  const app = createApp(defineComponent(() => () => h('section', null, [
    h(ComposerContentEditable, { editor: bound.value, editable: editable.value }),
    h('p', { 'data-echo': '' }, echo.value),
  ])))
  onTestFinished(() => { app.unmount(); container.remove() })
  app.mount(container)
  await nextTick()
  const host = container.querySelector<HTMLDivElement>('[data-composer-input]')!
  expect(editor.getRootElement()).toBe(host)
  expect(host.getAttribute('contenteditable')).toBe('true')
  const atGate: string[] = []
  const setAttribute = host.setAttribute.bind(host)
  const write = vi.spyOn(host, 'setAttribute').mockImplementation((name, value) => {
    if (name === 'contenteditable' && value === 'false') {
      atGate.push(container.querySelector('[data-echo]')?.textContent ?? '')
    }
    setAttribute(name, value)
  })
  onTestFinished(() => { write.mockRestore() })
  editable.value = false
  echo.value = 'Accepted message'
  await nextTick()
  expect(atGate).toEqual(['Accepted message'])
  expect(editor.isEditable()).toBe(false)
  expect(editor.getRootElement()).toBe(host)
  expect(host.getAttribute('contenteditable')).toBe('false')
  editable.value = true
  await nextTick()
  expect(editor.isEditable()).toBe(true)
  expect(host.getAttribute('contenteditable')).toBe('true')
  bound.value = null
  await nextTick()
  expect(editor.getRootElement()).toBeNull()
  expect(container.querySelector('[data-composer-input]')).toBe(host)
  expect(host.getAttribute('contenteditable')).toBe('false')
})
