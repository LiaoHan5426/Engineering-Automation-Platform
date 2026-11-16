// @vitest-environment jsdom
import { defineComponent, h, nextTick, ref, type VNode } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/dom'
import { Modal } from '../src/Modal.tsx'
import { closeTopModal, isBehindModal, useModalLayer } from '../src/useModalLayer.ts'
import { Menu } from '../src/Menu.tsx'
import { cleanupVue, renderVue } from './vue-render.ts'

afterEach(cleanupVue)
const update = async (action: () => unknown) => { action(); await nextTick() }
const escape = (init = {}) => update(() => fireEvent.keyDown(document.activeElement ?? document, { key: 'Escape', code: 'Escape', ...init }))
const click = (name: string) => update(() => fireEvent.click(screen.getByRole('button', { name })))
const mount = async (node: VNode) => { const view = renderVue(node); await nextTick(); return view }
const modal = (props: InstanceType<typeof Modal>['$props'], body?: () => VNode[]) => h(Modal, props, body && { default: body })

const Nested = defineComponent({
  props: { withSearch: { type: Boolean, default: true } },
  setup(props) {
    const settings = ref(false), reference = ref(false), menu = ref(false)
    return () => [
      h('button', { onClick: () => { settings.value = true } }, 'Settings'),
      modal({ open: settings.value, title: 'Settings', closeLabel: 'Close settings', onClose: () => { settings.value = false } }, () => [h('button', { onClick: () => { reference.value = true } }, 'Reference')]),
      modal({ open: reference.value, title: 'Reference', closeLabel: 'Close reference', onClose: () => { reference.value = false } }, () => [
        ...(props.withSearch ? [h('input', { 'data-modal-autofocus': '', 'aria-label': 'Search' })] : []),
        h(Menu, { open: menu.value, autoFocus: true, items: [{ id: 'item', label: 'Item' }], onSelect: () => { menu.value = false }, onClose: () => { menu.value = false } }, { anchor: () => h('button', { onClick: () => { menu.value = true } }, 'Menu') }),
      ]),
    ]
  },
})

it('restores the opener after a closing dialog updates its retained controls', async () => {
  const RetainedDialog = defineComponent({ props: { open: Boolean }, setup(props) {
    const dialog = ref<HTMLDivElement | null>(null)
    useModalLayer(dialog, () => props.open, () => {})
    return () => h('div', { ref: dialog, role: 'dialog', 'aria-modal': props.open || undefined }, [h('button', { 'data-modal-autofocus': '' }, props.open ? 'Close' : 'Open')])
  } })
  const tree = (open: boolean) => h('div', [h('button', 'Opener'), h(RetainedDialog, { open })])
  const view = await mount(tree(false))
  const opener = screen.getByRole('button', { name: 'Opener' }); opener.focus()
  await update(() => view.rerender(tree(true)))
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }))
  await update(() => view.rerender(tree(false)))
  expect(document.activeElement).toBe(opener)
})

it('preserves the owner return focus when a dialog unmounts', async () => {
  const Details = defineComponent({ setup() {
    const open = ref(false), more = ref<HTMLButtonElement | null>(null)
    return () => [
      h('section', { 'aria-label': 'Details', tabindex: -1 }, [h('button', { ref: more, onClick: () => { open.value = true } }, 'More')]),
      modal({ open: open.value, title: 'Confirm', closeLabel: 'Cancel', onClose: () => { open.value = false; more.value?.focus() } }),
    ]
  } })
  await mount(h(Details))
  screen.getByRole('region', { name: 'Details' }).focus()
  const more = screen.getByRole('button', { name: 'More' })
  await click('More'); await click('Cancel')
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(more)
})

it('closes only the top modal through application commands and restores each opener', async () => {
  await mount(h(Nested))
  const settings = screen.getByRole('button', { name: 'Settings' }); settings.focus(); await click('Settings')
  const reference = screen.getByRole('button', { name: 'Reference' }); reference.focus(); await click('Reference')
  await update(() => closeTopModal(document))
  expect(screen.queryByRole('dialog', { name: 'Reference' })).toBeNull()
  expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy()
  expect(document.activeElement).toBe(reference)
  await update(() => closeTopModal(document))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(settings)
  closeTopModal(document); expect(document.activeElement).toBe(settings)
})

it.each(['menu', 'dialog'])('does not dismiss a modal behind a newer %s', async role => {
  const onClose = vi.fn()
  await mount(modal({ open: true, title: 'Settings', closeLabel: 'Close', onClose }))
  const overlay = document.createElement('div'); overlay.setAttribute('role', role); overlay.setAttribute('aria-modal', 'true'); document.body.append(overlay)
  try { closeTopModal(document); expect(onClose).not.toHaveBeenCalled() } finally { overlay.remove() }
  closeTopModal(document); expect(onClose).toHaveBeenCalledTimes(1)
})

it('uses the latest close callback and retains a modal whose owner declines dismissal', async () => {
  const first = vi.fn(), busy = vi.fn()
  const view = await mount(modal({ open: true, title: 'Settings', closeLabel: 'Close', onClose: first }))
  await update(() => view.rerender(modal({ open: true, title: 'Settings', closeLabel: 'Close', onClose: busy })))
  closeTopModal(document)
  expect(first).not.toHaveBeenCalled(); expect(busy).toHaveBeenCalledTimes(1); expect(screen.getByRole('dialog')).toBeTruthy()
})

it('closes one layer per Escape, honors local menus and IME, and restores the real opener', async () => {
  expect(isBehindModal(null)).toBe(false)
  await mount(h(Nested))
  const settings = screen.getByRole('button', { name: 'Settings' }); settings.focus(); await click('Settings')
  const reference = screen.getByRole('button', { name: 'Reference' }); reference.focus(); await click('Reference')
  expect(document.activeElement).toBe(screen.getByRole('textbox'))
  fireEvent.compositionStart(screen.getByRole('textbox')); await escape(); fireEvent.compositionEnd(screen.getByRole('textbox')); await escape()
  await escape({ isComposing: true }); await escape({ ctrlKey: true }); await escape({ repeat: true })
  expect(screen.getAllByRole('dialog')).toHaveLength(2)
  await click('Menu')
  fireEvent.compositionStart(document.activeElement!); fireEvent.compositionEnd(document.activeElement!); await escape()
  expect(screen.getByRole('menu')).toBeTruthy()
  fireEvent.keyUp(document.activeElement!, { key: 'Escape' }); await escape()
  expect(screen.queryByRole('menu')).toBeNull(); expect(screen.getAllByRole('dialog')).toHaveLength(2)
  await escape(); expect(screen.getAllByRole('dialog')).toHaveLength(1); expect(document.activeElement).toBe(reference)
  await escape(); expect(screen.queryByRole('dialog')).toBeNull(); expect(document.activeElement).toBe(settings)
})

it('keeps Tab within the top dialog and releases listeners after unmount', async () => {
  const view = await mount(h(Nested)); await click('Settings')
  const last = screen.getByRole('button', { name: 'Reference' }); last.focus(); fireEvent.keyDown(last, { key: 'Tab' })
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close settings' }))
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true }); expect(document.activeElement).toBe(last)
  view.unmount()
  const event = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }); document.dispatchEvent(event); expect(event.defaultPrevented).toBe(false)
})

it.each([{ direction: 'forward', shiftKey: false, target: 'Close reference' }, { direction: 'backward', shiftKey: true, target: 'Menu' }])('moves $direction from the top dialog container into its controls', async ({ shiftKey, target }) => {
  await mount(h(Nested, { withSearch: false })); await click('Settings')
  const reference = screen.getByRole('button', { name: 'Reference' }); reference.focus(); await click('Reference')
  const dialog = screen.getByRole('dialog', { name: 'Reference' }); dialog.focus()
  expect(fireEvent.keyDown(dialog, { key: 'Tab', shiftKey })).toBe(false)
  expect(document.activeElement).toBe(screen.getByRole('button', { name: target }))
  await escape(); expect(screen.queryByRole('dialog', { name: 'Reference' })).toBeNull(); expect(document.activeElement).toBe(reference)
})

it('keeps focus in a headless empty dialog and leaves portaled menu traversal to its owner', async () => {
  await mount(modal({ open: true, headless: true, title: 'Empty', onClose: () => {} }))
  const dialog = screen.getByRole('dialog'); expect(document.activeElement).toBe(dialog)
  fireEvent.keyDown(dialog, { key: 'Tab' }); expect(document.activeElement).toBe(dialog)
  fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true }); expect(document.activeElement).toBe(dialog)
  const menu = document.createElement('div'); menu.setAttribute('role', 'menu'); const button = document.createElement('button'); menu.append(button); document.body.append(menu)
  try { button.focus(); expect(fireEvent.keyDown(button, { key: 'Tab' })).toBe(true); fireEvent.blur(window) } finally { menu.remove() }
})

it('does not steal focus when a lower layer disappears and restores a remaining parent after opener removal', async () => {
  const tree = (parent: boolean, child: boolean, opener: boolean) => h('div', [
    modal({ open: parent, title: 'Parent', closeLabel: 'Close parent', onClose: () => {} }, () => opener ? [h('button', 'Child opener')] : []),
    modal({ open: child, title: 'Child', closeLabel: 'Close child', onClose: () => {} }, () => [h('input', { 'data-modal-autofocus': '', 'aria-label': 'Child input' })]),
  ])
  const view = await mount(tree(true, false, true)); screen.getByRole('button', { name: 'Child opener' }).focus()
  await update(() => view.rerender(tree(true, true, true))); await update(() => view.rerender(tree(true, true, false))); await update(() => view.rerender(tree(true, false, false)))
  expect(document.activeElement).toBe(screen.getByRole('dialog', { name: 'Parent' }))
  await update(() => view.rerender(tree(true, false, true))); screen.getByRole('button', { name: 'Child opener' }).focus(); await update(() => view.rerender(tree(true, true, true)))
  const input = screen.getByRole('textbox'); await update(() => view.rerender(tree(false, true, true))); expect(document.activeElement).toBe(input)
  await update(() => view.rerender(tree(false, false, true))); expect(screen.queryByRole('dialog')).toBeNull()
})

it('gives a new modal Escape ahead of an older menu', async () => {
  let menuClosed = false, childClosed = false
  await mount(h('div', [
    modal({ open: true, title: 'Parent', closeLabel: 'Close parent', onClose: () => {} }, () => [h(Menu, { open: true, items: [{ id: 'item', label: 'Item' }], onSelect: () => {}, onClose: () => { menuClosed = true } }, { anchor: () => h('button', 'Menu') })]),
    modal({ open: true, title: 'Child', closeLabel: 'Close child', onClose: () => { childClosed = true } }, () => [h('input', { 'data-modal-autofocus': '' })]),
  ]))
  await escape(); expect(menuClosed).toBe(false); expect(childClosed).toBe(true)
})
