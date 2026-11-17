// @vitest-environment jsdom
import { act, cleanup, render } from '@deepseek-ai/dsh-client-test-runtime/src/vue-test.ts'
import { createEvent, fireEvent, screen } from '@testing-library/dom'
import { h, Fragment, Teleport, nextTick } from 'vue'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import { SlotTestRuntime } from '@deepseek-ai/dsh-client-test-runtime'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { apply, inject } from '../src/client/index.ts'
import { createContextMenuBindings } from '../src/client/trigger.ts'
import type { ContextMenuTriggerProps, ContextMenuTarget } from '../src/client/types.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
afterEach(cleanup)
const target = (id: string): ContextMenuTarget => ({ kind: 'session', value: { sessionId: brandString<SessionId>(id), displayTitle: id } })
it('binds targets in loops, captures deferred identity before focus changes it, and composes existing handlers', () => {
  const open = vi.fn(), previous = vi.fn(), clicked = vi.fn()
  let selected = 'first'
  const { getTriggerProps } = createContextMenuBindings(open, () => true)
  const view = render(h(Fragment, null, [['one', 'two'].map(id => h('button', { 'key': id, ...getTriggerProps(target(id), { onContextmenu: previous }) }, [id])), h('button', { ...getTriggerProps(() => target(selected), { tabindex: -1 }), 'onFocus': () => { selected = 'changed' }, 'onClick': clicked }, ['Captured'])]))
  for (const id of ['one', 'two']) {
    fireEvent.contextMenu(view.getByRole('button', { name: id }), { clientX: 12, clientY: 23 })
    expect(open).toHaveBeenLastCalledWith(target(id), { x: 12, y: 23 })
  }
  expect(previous).toHaveBeenCalledTimes(2)
  const button = view.getByRole('button', { name: 'Captured' })
  button.getBoundingClientRect = () => new DOMRect(30, 40, 50, 20)
  const focus = vi.spyOn(button, 'focus')
  fireEvent.keyDown(button, { key: 'F10', shiftKey: true })
  expect(open).toHaveBeenLastCalledWith(target('first'), { x: 30, y: 60 })
  expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  expect(button.tabIndex).toBe(-1)
  expect(clicked).not.toHaveBeenCalled()
  fireEvent.contextMenu(button)
  expect(open).toHaveBeenLastCalledWith(target('changed'), { x: 30, y: 60 })
})
it('honors prevented and nested gestures, portals, repeats, composition, and missing targets', () => {
  const open = vi.fn(), outer = vi.fn(), existing = vi.fn()
  const bindings = createContextMenuBindings(open, () => true)
  const parent = createContextMenuBindings(outer, () => true)
  const inner = bindings.getTriggerProps(target('inner'))
  const composed = bindings.getTriggerProps(target('second'), inner)
  const view = render(h('div', { ...parent.getTriggerProps(target('outer')) }, [h('button', { ...composed }, ['Inner']), h('button', { ...bindings.getTriggerProps(target('blocked'), {
    onContextmenu: (event) => { event.preventDefault() }, onKeydown: (event) => { event.preventDefault() },
  }) }, ['Blocked']), h('button', { ...bindings.getTriggerProps(undefined, { onKeydown: existing }) }, ['Native']), h(Teleport, { to: document.body }, [h('button', { ...inner }, ['Portal'])])]))
  const button = view.getByRole('button', { name: 'Inner' })
  fireEvent.contextMenu(button, { clientX: 1, clientY: 2 })
  fireEvent.keyDown(button, { key: 'ContextMenu' })
  expect(open).toHaveBeenCalledTimes(2)
  expect(open).toHaveBeenLastCalledWith(target('inner'), { x: 0, y: 0 })
  fireEvent.contextMenu(view.getByRole('button', { name: 'Blocked' }))
  fireEvent.keyDown(view.getByRole('button', { name: 'Blocked' }), { key: 'ContextMenu' })
  for (const extra of [{ repeat: true }, { isComposing: true }, { ctrlKey: true }, { altKey: true }, { metaKey: true }, { key: 'Enter' }]) {
    fireEvent.keyDown(button, { key: 'ContextMenu', ...extra })
  }
  const prevented = createEvent.contextMenu(button)
  prevented.preventDefault()
  fireEvent(button, prevented)
  expect(open).toHaveBeenCalledTimes(2)
  fireEvent.contextMenu(screen.getByRole('button', { name: 'Portal' }), { clientX: 4, clientY: 5 })
  expect(open).toHaveBeenCalledTimes(3)
  expect(outer).not.toHaveBeenCalled()
  fireEvent.keyDown(view.getByRole('button', { name: 'Native' }), { key: 'a' })
  expect(existing).toHaveBeenCalledOnce()
})
it('injects the hook through the root Slot and withdraws both its prop and retained handlers on unload', async () => {
  const runtime = await SlotTestRuntime.create()
  onTestFinished(() => runtime.dispose())
  runtime.ctx.provide('shortcuts', { catalog: createSnapshotStore([]) } as never)
  runtime.ctx.provide('locale', { register: () => () => { }, bind: () => (key: string) => key } as never)
  let retained: ContextMenuTriggerProps = {}
  let received = false
  await runtime.root.declare({}, ({ useContextMenu }) => {
    received = typeof useContextMenu === 'function'
    if (!received)
      return null
    retained = useContextMenu().getTriggerProps(target('injected'))
    return h('button', { ...retained }, ['Injected'])
  })
  const plugin = await runtime.mount({ inject, apply })
  const view = runtime.renderRoot()
  await nextTick()
  expect(received).toBe(true)
  await act(() => { fireEvent.contextMenu(view.getByRole('button')) })
  expect(runtime.ctx.contextMenus.active.getSnapshot()).toEqual(target('injected'))
  const source = runtime.ctx.contextMenus.active
  await plugin.dispose()
  expect(received).toBe(false)
  expect(source.getSnapshot()).toBeNull()
  const detached = render(h('button', { ...retained }, ['Retained']))
  expect(fireEvent.contextMenu(detached.getByRole('button'))).toBe(true)
  expect(fireEvent.keyDown(detached.getByRole('button'), { key: 'ContextMenu' })).toBe(true)
  expect(source.getSnapshot()).toBeNull()
})
