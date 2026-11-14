// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { mountContextMenu } from '../src/index'
let menu: Awaited<ReturnType<typeof mountContextMenu>> | undefined
afterEach(async () => {
  await menu?.dispose()
  menu = undefined
  document.body.innerHTML = ''
})
async function boot(copyText = vi.fn(async (_text: string) => {})) {
  const host = document.createElement('div')
  document.body.append(host)
  menu = await mountContextMenu(host, {
    copyText,
    locale: 'en',
    copyLabel: 'Copy message',
    failureLabel: 'Cannot copy message',
  })
  return copyText
}
async function open(text = 'original') {
  const target = { conversationId: 'conversation-a', messageId: 'message-a', text }
  const gesture = new MouseEvent('contextmenu', { clientX: 50, clientY: 50, cancelable: true })
  expect(menu!.open(gesture, target)).toBe(true)
  expect(gesture.defaultPrevented).toBe(true)
  target.text = 'changed after gesture'
  await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).not.toBeNull())
}
it('loads original client and executes once against captured text', async () => {
  const copy = await boot()
  await open()
  const button = [...document.querySelectorAll('button')].find((x) =>
    x.textContent?.includes('Copy message'),
  )!
  expect(button).toBeTruthy()
  button.click()
  await vi.waitFor(() => expect(copy).toHaveBeenCalledExactlyOnceWith('original'))
})
it('closes with Escape and outside pointer, then disposes and restarts', async () => {
  await boot()
  await open()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull())
  await open('second')
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  await vi.waitFor(() => expect(document.querySelector('[role="menu"]')).toBeNull())
  await menu!.dispose()
  expect(
    menu!.open(new MouseEvent('click'), { conversationId: 'b', messageId: 'b', text: 'b' }),
  ).toBe(false)
  await boot()
  await open('restart')
})
it('shows original action failure feedback', async () => {
  await boot(
    vi.fn(async () => {
      throw new Error('clipboard denied')
    }),
  )
  await open()
  ;[...document.querySelectorAll('button')]
    .find((x) => x.textContent?.includes('Copy message'))!
    .click()
  await vi.waitFor(() => expect(document.body.textContent).toContain('Cannot copy message'))
})
