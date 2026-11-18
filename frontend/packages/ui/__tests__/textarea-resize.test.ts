// @vitest-environment happy-dom
import { expect, it } from 'vite-plus/test'
import { createApp, h, ref, nextTick } from 'vue'
import Textarea from '../src/field/Textarea.vue'
it('grows and shrinks with the controlled draft, caps height, and preserves focus and selection', async () => {
  const root = document.createElement('div')
  document.body.append(root)
  const text = ref('draft')
  const app = createApp({
    render: () => h(Textarea, { modelValue: text.value, autoResize: true, maxHeight: 240 }),
  })
  app.mount(root)
  const input = root.querySelector('textarea')!
  Object.defineProperty(input, 'scrollHeight', {
    configurable: true,
    get: () => (text.value.length > 10 ? 800 : 100),
  })
  input.focus()
  input.setSelectionRange(2, 2)
  text.value = 'draft that grows beyond the budget'
  await nextTick()
  await nextTick()
  expect(input.style.height).toBe('240px')
  expect(input.style.overflowY).toBe('auto')
  expect(document.activeElement).toBe(input)
  text.value = 'short'
  await nextTick()
  await nextTick()
  expect(input.style.height).toBe('100px')
  expect(input.style.overflowY).toBe('hidden')
  expect(document.activeElement).toBe(input)
  app.unmount()
  root.remove()
})
