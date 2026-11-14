// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { mountContextMenu } from '../src/index'
let instance: Awaited<ReturnType<typeof mountContextMenu>> | undefined
afterEach(async () => {
  await instance?.dispose()
  instance = undefined
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})
async function boot(locale = 'en', renderSettingsEntry = true) {
  const host = document.createElement('div')
  document.body.append(host)
  instance = await mountContextMenu(host, {
    locale,
    renderSettingsEntry,
    copyLabel: 'Copy',
    downloadLabel: 'Download message',
    failureLabel: 'Failed',
    copyText: async () => {},
  })
  if (renderSettingsEntry)
    await vi.waitFor(() => expect(document.querySelector('button')).not.toBeNull())
}
it('renders original shortcut entry and searchable reference, localizes and disposes', async () => {
  await boot()
  ;[...document.querySelectorAll('button')]
    .find((x) => x.getAttribute('aria-label') === 'Edit shortcuts')!
    .click()
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
  expect(document.body.textContent).toContain('Keyboard shortcuts')
  const search =
    document.querySelector<HTMLInputElement>('input[type="search"]') ??
    document.querySelector<HTMLInputElement>('input')
  expect(search).not.toBeNull()
  instance!.setLocale('zh')
  await vi.waitFor(() => expect(document.body.textContent).toContain('快捷键'))
  await instance!.dispose()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  await boot()
  expect(
    [...document.querySelectorAll('button')].filter(
      (x) => x.getAttribute('aria-label') === 'Edit shortcuts',
    ),
  ).toHaveLength(1)
})
it('uses the original keyboard command and rejects a duplicate React root', async () => {
  await boot()
  const host = document.body.firstElementChild as HTMLElement
  await expect(
    mountContextMenu(host, {
      locale: 'en',
      copyLabel: 'Copy',
      failureLabel: 'Failed',
      copyText: async () => {},
    }),
  ).rejects.toThrow('DSH_DUPLICATE_MOUNT')
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: '/',
      code: 'Slash',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }),
  )
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
  )
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
})
it('downloads captured message bytes using original BrowserFileActions and revokes on disposal', async () => {
  const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:eap-download')
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  await boot()
  const target = { conversationId: 'a', messageId: 'a', text: 'original bytes' }
  instance!.open(new MouseEvent('contextmenu'), target)
  target.text = 'new conversation'
  await vi.waitFor(() =>
    expect(
      [...document.querySelectorAll('button')].some((x) =>
        x.textContent?.includes('Download message'),
      ),
    ).toBe(true),
  )
  ;[...document.querySelectorAll('button')]
    .find((x) => x.textContent?.includes('Download message'))!
    .click()
  await vi.waitFor(() => expect(click).toHaveBeenCalledTimes(1))
  expect(await create.mock.calls[0]![0].text()).toBe('original bytes')
  await instance!.dispose()
  expect(revoke).toHaveBeenCalledWith('blob:eap-download')
})

it('opens the original editor through a compact host entry without rendering the settings card', async () => {
  await boot('en', false)
  expect(document.body.textContent).not.toContain('View and edit available shortcuts')
  expect(instance!.openShortcuts()).toBe(true)
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
  expect(document.body.textContent).toContain('Keyboard shortcuts')
  expect(document.querySelector('input')).not.toBeNull()
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
  )
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
  document.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: '/',
      code: 'Slash',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    }),
  )
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull())
  await instance!.dispose()
  expect(instance!.openShortcuts()).toBe(false)
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})
