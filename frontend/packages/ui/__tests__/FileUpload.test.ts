// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createApp, nextTick, type App } from 'vue'
import FileUpload from '../src/file/FileUpload.vue'

let app: App
afterEach(() => {
  app?.unmount()
  document.body.innerHTML = ''
})
async function mount(request?: (file: File, options: { signal: AbortSignal }) => Promise<unknown>) {
  const host = document.createElement('div')
  document.body.append(host)
  const selected = vi.fn(),
    uploaded = vi.fn()
  app = createApp(FileUpload, {
    request,
    accept: '.txt',
    maxSize: 10,
    onSelect: selected,
    onUploaded: uploaded,
  })
  app.mount(host)
  return { host, selected, uploaded }
}
async function choose(host: HTMLElement, file: File) {
  const input = host.querySelector('input')!
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  input.dispatchEvent(new Event('change', { bubbles: true }))
  await nextTick()
}
it('validates selection and requires a separate upload action', async () => {
  const request = vi.fn(async () => ({ saved: true }))
  const { host, selected, uploaded } = await mount(request)
  await choose(host, new File(['content'], 'bad.png'))
  expect(selected).not.toHaveBeenCalled()
  await choose(host, new File(['x'.repeat(11)], 'large.txt'))
  expect(selected).not.toHaveBeenCalled()
  await choose(host, new File(['text'], 'good.txt'))
  expect(selected).toHaveBeenCalledTimes(1)
  expect(request).not.toHaveBeenCalled()
  ;[...host.querySelectorAll('button')].find((button) => button.textContent === '上传')!.click()
  await vi.waitFor(() => expect(uploaded).toHaveBeenCalledWith([{ saved: true }]))
})
it('aborts on unmount and ignores late completion', async () => {
  let finish!: (value: unknown) => void
  let signal!: AbortSignal
  const { host, uploaded } = await mount(async (_file, options) => {
    signal = options.signal
    return new Promise((resolve) => {
      finish = resolve
    })
  })
  await choose(host, new File(['text'], 'good.txt'))
  ;[...host.querySelectorAll('button')].find((button) => button.textContent === '上传')!.click()
  await nextTick()
  app.unmount()
  expect(signal.aborted).toBe(true)
  finish({ saved: true })
  await nextTick()
  expect(uploaded).not.toHaveBeenCalled()
})
