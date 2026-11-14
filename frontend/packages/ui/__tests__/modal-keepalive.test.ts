// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vite-plus/test'
import { createApp, defineComponent, h, KeepAlive, nextTick, ref, type App } from 'vue'
import Dialog from '../src/dialog/Dialog.vue'
import ConfirmBox from '../src/confirm-box/ConfirmBox.vue'
let app: App | undefined
let host: HTMLElement | undefined
afterEach(() => {
  app?.unmount()
  host?.remove()
})
const flush = async () => {
  await nextTick()
  await nextTick()
}
for (const confirmation of [false, true]) {
  it(`hides cached ${confirmation ? 'confirmation' : 'dialog'} and restores the same draft on return`, async () => {
    const visible = ref(true)
    const ModalPage = defineComponent({
      setup() {
        const draft = ref('unsaved')
        return () =>
          confirmation
            ? h(ConfirmBox, { title: 'Confirm', impact: ['Unsaved'], confirmLabel: 'Discard' })
            : h(Dialog, { title: 'Editor' }, () =>
                h('input', {
                  value: draft.value,
                  onInput: (event: Event) => {
                    draft.value = (event.target as HTMLInputElement).value
                  },
                }),
              )
      },
    })
    host = document.createElement('div')
    document.body.append(host)
    app = createApp({
      render: () => h(KeepAlive, null, { default: () => (visible.value ? h(ModalPage) : null) }),
    })
    app.mount(host)
    await flush()
    const root = document.querySelector<HTMLElement>(
      confirmation ? '.eap-confirm' : '.eap-dialog-root',
    )!
    expect(root.style.display).not.toBe('none')
    const input = root.querySelector('input')
    if (input) {
      input.value = 'changed draft'
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
    visible.value = false
    await flush()
    expect(root.isConnected).toBe(true)
    expect(root.style.display).toBe('none')
    visible.value = true
    await flush()
    expect(root.style.display).not.toBe('none')
    if (input) expect(root.querySelector('input')?.value).toBe('changed draft')
    expect(root.contains(document.activeElement)).toBe(true)
  })
}
