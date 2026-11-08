// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vite-plus/test'
import { createApp, h, nextTick, ref, type App } from 'vue'
import EditorWorkbench from '../src/layout/EditorWorkbench.vue'

let app: App | undefined
let root: HTMLElement
afterEach(() => {
  app?.unmount()
  root?.remove()
})

it('keeps the canvas mounted when panes collapse and become accessible narrow-screen drawers', async () => {
  root = document.createElement('div')
  document.body.append(root)
  const draft = ref('draft')
  app = createApp({
    render: () =>
      h(
        EditorWorkbench,
        {
          resourcesLabel: 'Resources',
          inspectorLabel: 'Properties',
          resizeLabel: 'Resize',
          closeLabel: 'Close',
        },
        {
          default: () => h('div', { id: 'test-canvas' }, 'Canvas'),
          resources: () => h('p', 'Resource list'),
          inspector: () =>
            h('input', {
              value: draft.value,
              onInput: (e: Event) => (draft.value = (e.target as HTMLInputElement).value),
            }),
        },
      ),
  })
  app.mount(root)
  const canvas = root.querySelector('#test-canvas')!
  const frame = root.querySelector<HTMLElement>('.eap-editor-workbench')!
  Object.defineProperty(frame, 'clientWidth', { configurable: true, value: 1280 })
  window.dispatchEvent(new Event('resize'))
  await nextTick()
  const buttons = root.querySelectorAll<HTMLButtonElement>('nav button')
  buttons[0]!.click()
  await nextTick()
  expect(root.textContent).not.toContain('Resource list')
  expect(root.querySelector('#test-canvas')).toBe(canvas)
  Object.defineProperty(frame, 'clientWidth', { configurable: true, value: 600 })
  window.dispatchEvent(new Event('resize'))
  await nextTick()
  expect(root.querySelector('#test-canvas')).toBe(canvas)
  buttons[1]!.focus()
  buttons[1]!.click()
  await nextTick()
  const drawer = document.querySelector('[role=dialog]')!
  expect(drawer).not.toBeNull()
  const input = drawer.querySelector('input')!
  input.value = 'changed'
  input.dispatchEvent(new Event('input'))
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await nextTick()
  expect(document.querySelector('[role=dialog]')).toBeNull()
  expect(draft.value).toBe('changed')
  expect(root.querySelector('#test-canvas')).toBe(canvas)
})
