// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  onUnmounted,
  ref,
  type App,
  type VNode,
} from 'vue'
import { useFocusTrap } from '../src/hooks/useFocusTrap'
import Dialog from '../src/dialog/Dialog.vue'
import ConfirmBox from '../src/confirm-box/ConfirmBox.vue'

let app: App | undefined
let host: HTMLElement | undefined
const tick = async () => {
  await nextTick()
  await nextTick()
}
afterEach(async () => {
  app?.unmount()
  await tick()
  host?.remove()
  app = undefined
  host = undefined
  vi.restoreAllMocks()
})

function trap(children: () => VNode[]) {
  return defineComponent({
    setup() {
      const root = ref<HTMLElement | null>(null)
      const { onKeydown } = useFocusTrap(root)
      return () => h('section', { ref: root, tabindex: -1, role: 'dialog', onKeydown }, children())
    },
  })
}
async function mount(children: () => VNode[]) {
  host = document.createElement('div')
  document.body.append(host)
  app = createApp(trap(children))
  app.mount(host)
  await tick()
  return host.querySelector<HTMLElement>('[role="dialog"]')!
}
function tab(target: HTMLElement, shiftKey = false) {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true,
  })
  target.dispatchEvent(event)
  return event
}

it('cycles in both directions when initial focus is the dialog panel', async () => {
  const panel = await mount(() => [
    h('button', { id: 'first' }, 'First'),
    h('button', { id: 'last' }, 'Last'),
  ])
  expect(document.activeElement).toBe(panel)
  expect(tab(panel, true).defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(host!.querySelector('#last'))
  expect(tab(document.activeElement as HTMLElement).defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(host!.querySelector('#first'))
  panel.focus()
  expect(tab(panel).defaultPrevented).toBe(true)
  expect(document.activeElement).toBe(host!.querySelector('#first'))
})

it('keeps Tab and Shift+Tab on the panel when no enabled controls remain', async () => {
  const panel = await mount(() => [h('button', { disabled: true }, 'Saving')])
  for (const shift of [false, true]) {
    panel.focus()
    expect(tab(panel, shift).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(panel)
  }
})

it('focuses the Dialog panel when its initial close button is disabled', async () => {
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({
    render: () => h(Dialog, { title: 'Loading', busy: true }, () => h('p', 'Please wait')),
  })
  app.mount(host)
  await tick()
  const panel = document.querySelector<HTMLElement>('[role="dialog"]')!
  expect(panel.querySelector<HTMLButtonElement>('[data-eap-dialog-close]')!.disabled).toBe(true)
  expect(document.activeElement).toBe(panel)
  for (const shift of [false, true]) {
    expect(tab(panel, shift).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(panel)
  }
})

it('focuses a busy ConfirmBox and contains Tab when both actions are disabled', async () => {
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({
    render: () =>
      h(ConfirmBox, {
        title: 'Deleting',
        impact: ['A task will be deleted'],
        confirmLabel: 'Delete',
        busy: true,
      }),
  })
  app.mount(host)
  await tick()
  const panel = document.querySelector<HTMLElement>('[role="dialog"]')!
  expect(Array.from(panel.querySelectorAll('button')).every((button) => button.disabled)).toBe(true)
  expect(document.activeElement).toBe(panel)
  for (const shift of [false, true]) {
    expect(tab(panel, shift).defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(panel)
  }
})

for (const hidden of ['hidden', 'display', 'visibility', 'inert', 'negative-tabindex'] as const) {
  it('does not select a ' + hidden + ' control as a focus-cycle endpoint', async () => {
    const excluded = () => {
      if (hidden === 'hidden') return h('div', { hidden: true }, [h('button', 'Hidden')])
      if (hidden === 'display') return h('div', { style: 'display:none' }, [h('button', 'Hidden')])
      if (hidden === 'visibility')
        return h('div', { style: 'visibility:hidden' }, [h('button', 'Hidden')])
      if (hidden === 'inert') return h('div', { inert: true }, [h('button', 'Inert')])
      return h('button', { tabindex: -1 }, 'Programmatic focus only')
    }
    await mount(() => [excluded(), h('button', { id: 'only' }, 'Only'), excluded()])
    const only = host!.querySelector<HTMLButtonElement>('#only')!
    for (const shift of [false, true]) {
      only.focus()
      expect(tab(only, shift).defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(only)
    }
  })
}

it('restores focus after modal teardown releases the inert opener subtree', async () => {
  const open = ref(false)
  const Trap = trap(() => [h('button', 'Close')])
  const Modal = defineComponent({
    setup() {
      // Model a modal host which releases background inertness on teardown.
      // Restore must happen after this lifecycle cleanup, not before unmount.
      onUnmounted(() => host!.querySelector('main')!.removeAttribute('inert'))
      return () => h(Trap)
    },
  })
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({
    render: () =>
      h('div', [open.value ? h(Modal) : null, h('main', [h('button', { id: 'opener' }, 'Open')])]),
  })
  app.mount(host)
  const opener = host.querySelector<HTMLButtonElement>('#opener')!
  opener.focus()
  open.value = true
  await tick()
  expect(document.activeElement).toBe(host.querySelector('[role="dialog"]'))
  host.querySelector('main')!.setAttribute('inert', '')
  const inertAtRestore: boolean[] = []
  const focus = opener.focus.bind(opener)
  vi.spyOn(opener, 'focus').mockImplementation(() => {
    const inert = !!opener.closest('[inert]')
    inertAtRestore.push(inert)
    // happy-dom does not enforce inert focus rejection; model the browser's
    // behavior explicitly so an early focus call cannot produce a false pass.
    if (!inert) focus()
  })
  open.value = false
  await tick()
  expect(inertAtRestore).toEqual([false])
  expect(document.activeElement).toBe(opener)
})

it('preserves the caller focus handoff to a newly created item during teardown', async () => {
  const open = ref(false)
  const Trap = trap(() => [h('button', 'Save')])
  const Modal = defineComponent({
    setup() {
      onUnmounted(() => host!.querySelector<HTMLButtonElement>('#created-item')!.focus())
      return () => h(Trap)
    },
  })
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({
    render: () =>
      h('div', [
        h('button', { id: 'opener' }, 'Create'),
        open.value ? h(Modal) : h('button', { id: 'created-item' }, 'New item details'),
      ]),
  })
  app.mount(host)
  const opener = host.querySelector<HTMLButtonElement>('#opener')!
  opener.focus()
  open.value = true
  await tick()
  expect(document.activeElement).toBe(host.querySelector('[role="dialog"]'))
  const restore = vi.spyOn(opener, 'focus')
  open.value = false
  await tick()
  expect(document.activeElement).toBe(host.querySelector('#created-item'))
  expect(restore).not.toHaveBeenCalled()
})

it('does not restore focus to an opener removed while its modal is open', async () => {
  const open = ref(false)
  const Modal = trap(() => [h('button', 'Close')])
  host = document.createElement('div')
  document.body.append(host)
  app = createApp({
    render: () => h('div', [h('button', { id: 'opener' }, 'Open'), open.value ? h(Modal) : null]),
  })
  app.mount(host)
  const opener = host.querySelector<HTMLButtonElement>('#opener')!
  opener.focus()
  open.value = true
  await tick()
  const focus = vi.spyOn(opener, 'focus')
  opener.remove()
  open.value = false
  await tick()
  expect(focus).not.toHaveBeenCalled()
})
