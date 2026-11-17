// @vitest-environment jsdom
/** Bottom Inspector lifetime and shortcuts through the production slot renderer. */
import { afterEach, expect, it } from 'vitest'
import { act as actNative } from '../../../test-support/client-runtime/src/vue-test.ts'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client'
import ShortcutsService from '@deepseek-ai/dsh-client-shortcuts/client'
import type { ShortcutCommandId } from '@deepseek-ai/dsh-client-shortcuts/client'
import { registerInspectorPage } from '../src/client/bottom/page.tsx'
import { inspectorId } from '../src/shared/identity.ts'
const ID = 'inspector.toggle' as ShortcutCommandId
const sourceId = inspectorId<'InspectorSourceId'>('client-page', 'sourceId')
const runtimes: SlotTestRuntime[] = []
afterEach(async () => {
  for (const runtime of runtimes.splice(0)) await runtime.dispose()
  localStorage.clear()
})
async function setup() {
  const runtime = await SlotTestRuntime.create()
  runtimes.push(runtime)
  const locale = new LocaleRuntime(runtime.ctx)
  runtime.ctx.provide('locale', locale)
  runtime.slots.installLocale(locale)
  locale.setLocale('en')
  await runtime.ctx.plugin(ShortcutsService).await()
  await expect.poll(() => runtime.ctx.shortcuts.config.getSnapshot().status).toBe('ready')
  await runtime.declare({ 'shell.bottom': { kind: 'single', scope: 'root' } })
  const plugin = {
    inject: ['locale', 'shortcuts', 'slots'],
    apply: (ctx: typeof runtime.ctx) => {
      registerInspectorPage(ctx, sourceId)
    },
  }
  const provider = await runtime.mount(plugin)
  const body = await runtime.renderSlot('shell.bottom', {})
  return { runtime, locale, provider, body, plugin }
}
async function press(target: EventTarget = window, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key: '>',
    code: 'Period',
    ctrlKey: true,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
    composed: true,
    ...options,
  })
  await act(() => {
    target.dispatchEvent(event)
  })
  return event
}
it('opens on Mod+Shift+Period without a Session or Sidebar and retains the iframe while collapsed', async () => {
  const { runtime, body } = await setup()
  expect(body.container.querySelector('iframe')).toBeNull()
  expect(runtime.ctx.shortcuts.catalog.getSnapshot().find(row => row.id === ID)?.binding).toEqual(
    { code: 'Period', modifiers: ['control', 'shift'] },
  )
  expect((await press(window, { ctrlKey: false })).defaultPrevented).toBe(false)
  expect(body.container.querySelector('iframe')).toBeNull()
  expect((await press()).defaultPrevented).toBe(true)
  const frame = body.view.getByTitle('NodeJS inspector')
  expect(frame.getAttribute('src')).toBe(
    'inspector/devtools/devtools_app.html?disableLocaleInfoBar=true&clientSourceId=client-page',
  )
  expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer')
  expect(frame.getAttribute('name')).toBe('dsh-nodejs-inspector')
  const close = body.view.getByRole('button', { name: 'Collapse' })
  expect(close.textContent).toBe('')
  expect(close.querySelector('svg')).not.toBeNull()
  expect((await press(window, { repeat: true })).defaultPrevented).toBe(true)
  expect(body.container.querySelector('section')?.hidden).toBe(false)
  await press()
  expect(body.container.querySelector('section')?.hidden).toBe(true)
  await press()
  expect(body.view.getByTitle('NodeJS inspector')).toBe(frame)
  expect(body.container.querySelector('section')?.hidden).toBe(false)
})
it('resizes with the owned pointer, bounds the height, and retains it across collapse', async () => {
  const { body } = await setup()
  await press()
  const panel = body.container.querySelector('section')!
  const frame = body.view.getByTitle('NodeJS inspector')
  const divider = body.view.getByRole('separator', { name: 'Resize NodeJS inspector panel' })
  let captured: number | undefined
  Object.assign(divider, {
    setPointerCapture: (id: number) => {
      captured = id
    },
    hasPointerCapture: (id: number) => captured === id,
    releasePointerCapture: () => {
      captured = undefined
    },
  })
  const pointer = async (type: string, clientY: number, pointerId = 1, button = 0) => {
    await act(() => {
      divider.dispatchEvent(new PointerEvent(type, { clientY, pointerId, button, bubbles: true }))
    })
  }
  const height = () => parseFloat(panel.style.getPropertyValue('--inspector-height'))
  await pointer('pointerdown', 500, 1, 2)
  await pointer('pointermove', 400)
  expect(height()).toBe(45)
  await pointer('pointerdown', 500)
  await pointer('pointerdown', 200, 2)
  await pointer('pointermove', 0, 2)
  await pointer('pointerup', 0, 2)
  expect(height()).toBe(45)
  await pointer('pointermove', 500 - window.innerHeight / 10)
  expect(height()).toBeCloseTo(55)
  await pointer('pointerup', 500 - window.innerHeight / 5)
  expect(height()).toBeCloseTo(65)
  expect(captured).toBeUndefined()
  await pointer('pointermove', 0)
  expect(height()).toBeCloseTo(65)
  await pointer('pointerdown', 500)
  await pointer('pointermove', -window.innerHeight)
  expect(height()).toBe(80)
  await pointer('pointermove', window.innerHeight * 2)
  expect(height()).toBe(20)
  await pointer('pointercancel', 0)
  expect(captured).toBeUndefined()
  await pointer('pointermove', 0)
  expect(height()).toBe(20)
  await pointer('pointerdown', 500)
  await pointer('lostpointercapture', 500)
  await pointer('pointermove', 0)
  expect(height()).toBe(20)
  await press()
  await press()
  expect(height()).toBe(20)
  expect(body.view.getByTitle('NodeJS inspector')).toBe(frame)
})
it('resizes the horizontal divider with arrow keys and Home or End', async () => {
  const { body } = await setup()
  await press()
  const divider = body.view.getByRole('separator')
  expect(divider.getAttribute('aria-orientation')).toBe('horizontal')
  expect(divider.getAttribute('aria-controls')).toBe(body.container.querySelector('section')!.id)
  for (const [key, value] of [
    ['ArrowUp', '50'],
    ['ArrowDown', '45'],
    ['Home', '20'],
    ['End', '80'],
  ] as const) {
    expect(
      (await press(divider, { key, code: key, ctrlKey: false, shiftKey: false })).defaultPrevented,
    ).toBe(true)
    expect(divider.getAttribute('aria-valuenow')).toBe(value)
  }
  expect(
    (await press(divider, { key: 'a', code: 'KeyA', ctrlKey: false, shiftKey: false }))
      .defaultPrevented,
  ).toBe(false)
  expect(divider.getAttribute('aria-valuenow')).toBe('80')
})
it('routes frame input through the effective binding and restores opener focus', async () => {
  const { runtime, body } = await setup()
  const opener = document.createElement('input')
  document.body.append(opener)
  try {
    opener.focus()
    await press(opener)
    const frame = body.view.getByTitle<HTMLIFrameElement>('NodeJS inspector')
    const document = frame.contentDocument!
    frame.focus()
    expect((await press(document)).defaultPrevented).toBe(true)
    expect(body.container.querySelector('section')?.hidden).toBe(true)
    expect(opener.ownerDocument.activeElement).toBe(opener)
    await press(opener)
    await press(document, { isComposing: true })
    expect(body.container.querySelector('section')?.hidden).toBe(false)
    await act(async () => {
      const { revision } = runtime.ctx.shortcuts.config.getSnapshot()
      await runtime.ctx.shortcuts.edit(
        { type: 'set', id: ID, binding: { code: 'Comma', modifiers: ['primary', 'shift'] } },
        revision,
      )
    })
    expect((await press(document)).defaultPrevented).toBe(false)
    expect(body.container.querySelector('section')?.hidden).toBe(false)
    expect(
      (await press(document, { code: 'Comma', key: '<', ctrlKey: true })).defaultPrevented,
    ).toBe(true)
    expect(body.container.querySelector('section')?.hidden).toBe(true)
  } finally {
    opener.remove()
  }
})
it('keeps modal arbitration and updates locale without replacing the iframe', async () => {
  const { locale, body } = await setup()
  const modal = document.createElement('div')
  modal.setAttribute('role', 'dialog')
  modal.setAttribute('aria-modal', 'true')
  document.body.append(modal)
  try {
    await press()
    expect(body.container.querySelector('iframe')).toBeNull()
  } finally {
    modal.remove()
  }
  await press()
  const frame = body.view.getByTitle('NodeJS inspector')
  await act(() => {
    locale.setLocale('zh')
  })
  expect(body.view.getByTitle('NodeJS 诊断')).toBe(frame)
  await act(() => {
    body.view.getByRole('button', { name: '收起' }).click()
  })
  expect(body.container.querySelector('section')?.hidden).toBe(true)
})
it('removes the command and frame on unload and starts a fresh closed panel on reload', async () => {
  const { runtime, locale, provider, body, plugin } = await setup()
  await press()
  const frame = body.view.getByTitle('NodeJS inspector')
  await provider.dispose()
  expect(runtime.ctx.shortcuts.catalog.getSnapshot().find(row => row.id === ID)).toBeUndefined()
  expect(frame.isConnected).toBe(false)
  expect(locale.bind('inspectorPanel')('frameTitle')).toBe('frameTitle')
  await runtime.mount(plugin)
  expect(body.container.querySelector('iframe')).toBeNull()
  await press()
  expect(body.view.getByTitle('NodeJS inspector')).not.toBe(frame)
})
it('uses Japanese panel and shortcut labels through the production registration', async () => {
  const { runtime, locale, body } = await setup()
  await act(() => {
    locale.addLanguage({ id: 'ja', label: '日本語', fallback: 'en' })
    locale.setLocale('ja')
  })
  await press()
  expect(body.view.getByRole('button', { name: '折りたたむ' })).toBeTruthy()
  expect(body.view.getByTitle('NodeJS インスペクター')).toBeTruthy()
  expect(body.container.querySelector('section')?.getAttribute('aria-label')).toBe(
    'NodeJS インスペクター',
  )
  expect(runtime.ctx.shortcuts.catalog.getSnapshot().find(row => row.id === ID)?.label).toBe(
    'NodeJS インスペクターの表示切り替え',
  )
})
const act = actNative
