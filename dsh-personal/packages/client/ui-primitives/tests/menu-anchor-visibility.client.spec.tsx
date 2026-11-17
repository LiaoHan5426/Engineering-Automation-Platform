// @vitest-environment jsdom
/** A portalled menu follows its anchor's interactive lifetime. */
import { defineComponent, shallowRef } from 'vue'
import { h, Fragment } from 'vue'
import { fireEvent, screen } from '@testing-library/dom'
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from './vue-render.ts'
import { afterEach, expect, it, vi } from 'vitest'
import { Menu } from '../src/Menu.tsx'
afterEach(() => { cleanup(); vi.restoreAllMocks() })
it.each(['inert', 'hidden'].flatMap(attribute => [false, true].map(contextual => ({ attribute, contextual }))))('closes when the retained anchor becomes $attribute with contextual=$contextual', async ({ attribute, contextual }) => {
  const Fixture = defineComponent(() => {
    const open = shallowRef(true)
    const trigger = shallowRef<HTMLButtonElement | null>(null)
    return () => {
      const menu = h(Menu, { 'open': open.value, 'onClose': () => { open.value = false }, 'portal': true, 'contextual': contextual, ...(contextual ? { returnFocus: () => trigger.value } : {}), 'items': [{ id: 'copy', label: 'Copy' }] }, { anchor: () => contextual ? null : h('button', null, ['Open']) })
      return h(Fragment, null, [h('div', { 'data-testid': 'owner' }, [contextual ? h('button', { 'ref': trigger }, ['Open']) : menu]), contextual && menu])
    }
  }, { props: [] })
  await act(async () => render(h(Fixture)))
  expect(screen.getByRole('menu')).toBeTruthy()
  await act(async () => { screen.getByTestId('owner').setAttribute(attribute, ''); await Promise.resolve() })
  expect(screen.queryByRole('menu')).toBeNull()
  expect(screen.getByTestId('owner').isConnected).toBe(true)
})
it('closes when an external anchor leaves the document', async () => {
  const anchor = document.createElement('button')
  const anchorRef = shallowRef(anchor)
  document.body.append(anchor)
  const Fixture = defineComponent(() => {
    const open = shallowRef(true)
    return () => {
      return h(Menu, { 'open': open.value, 'portal': true, 'anchorRef': anchorRef, 'onClose': () => { open.value = false }, 'items': [{ id: 'copy', label: 'Copy' }] }, { anchor: () => null })
    }
  }, { props: [] })
  await act(async () => render(h(Fixture)))
  expect(screen.getByRole('menu')).toBeTruthy()
  await act(async () => { anchor.remove(); await Promise.resolve() })
  expect(screen.queryByRole('menu')).toBeNull()
})
it.each(['hidden', 'inert'])('tracks %s on an external anchor that mounts after opening', async (attribute) => {
  const Fixture = defineComponent((props: {
    ready: boolean
  }) => {
    const open = shallowRef(true)
    const anchor = shallowRef<HTMLButtonElement | null>(null)
    return () => {
      const { ready } = props
      return h(Fragment, null, [ready && h('button', { 'ref': anchor }, ['Late anchor']), h(Menu, { 'open': open.value, 'portal': true, 'anchorRef': anchor, 'onClose': () => { open.value = false }, 'items': [{ id: 'copy', label: 'Copy' }] }, { anchor: () => null })])
    }
  }, { props: ['ready'] })
  const view = await act(async () => render(h(Fixture, { 'ready': false }, undefined)))
  expect(screen.queryByRole('menu')).toBeNull()
  await act(async () => { view.rerender(h(Fixture, { 'ready': true }, undefined)) })
  expect(screen.getByRole('menu')).toBeTruthy()
  await act(async () => { screen.getByRole('button').setAttribute(attribute, ''); await Promise.resolve() })
  expect(screen.queryByRole('menu')).toBeNull()
})
it('retargets visibility when an open menu receives a replacement element through the same ref', async () => {
  const Fixture = defineComponent((props: {
    generation: number
  }) => {
    const open = shallowRef(true)
    const anchor = shallowRef<HTMLButtonElement | null>(null)
    return () => {
      const { generation } = props
      return h(Fragment, null, [h('button', { 'key': generation, 'ref': anchor }, ['Anchor ', generation]), h(Menu, { 'open': open.value, 'portal': true, 'anchorRef': anchor, 'onClose': () => { open.value = false }, 'items': [{ id: 'copy', label: 'Copy' }] }, { anchor: () => null })])
    }
  }, { props: ['generation'] })
  const view = await act(async () => render(h(Fixture, { 'generation': 0 }, undefined)))
  const original = screen.getByRole('button')
  await act(async () => { await act(async () => { view.rerender(h(Fixture, { 'generation': 1 }, undefined)) }); await Promise.resolve() })
  expect(original.isConnected).toBe(false)
  expect(screen.getByRole('menu')).toBeTruthy()
  await act(async () => { screen.getByRole('button').setAttribute('hidden', ''); await Promise.resolve() })
  expect(screen.queryByRole('menu')).toBeNull()
})
it('does not restart a contextual dismissal while its original control remains inert', async () => {
  const close = vi.fn()
  const Fixture = defineComponent(() => {
    const exiting = shallowRef<'dismiss' | undefined>()
    const trigger = shallowRef<HTMLButtonElement | null>(null)
    return () => {
      return h(Fragment, null, [h('div', { 'data-testid': 'owner' }, [h('button', { 'ref': trigger }, ['Open'])]), h(Menu, { 'open': true, 'portal': true, 'contextual': true, 'returnFocus': () => trigger.value, ...(exiting.value === undefined ? {} : { exiting: exiting.value }), 'onClose': () => { close(); exiting.value = 'dismiss' }, 'items': [{ id: 'copy', label: 'Copy' }] }, { anchor: () => null })])
    }
  }, { props: [] })
  await act(async () => render(h(Fixture)))
  const menu = screen.getByRole('menu')
  const anchorName = menu.style.positionAnchor
  await act(async () => { screen.getByTestId('owner').setAttribute('inert', ''); await Promise.resolve() })
  await act(async () => { screen.getByTestId('owner').setAttribute('hidden', ''); await Promise.resolve() })
  expect(close).toHaveBeenCalledTimes(1)
  expect(menu.style.visibility).not.toBe('hidden')
  expect(menu.style.positionAnchor).toBe(anchorName)
})
it.each([undefined, 'existing-panel'])('restores the trigger aria-controls value %s after closing', async (previous) => {
  const Fixture = defineComponent((props: {
    open: boolean
  }) => {
    const trigger = shallowRef<HTMLButtonElement | null>(null)
    return () => {
      const { open } = props
      return h(Fragment, null, [h('button', { 'ref': trigger, 'aria-controls': previous }, ['Open']), h(Menu, { 'open': open, 'portal': true, 'contextual': true, 'returnFocus': () => trigger.value, 'onClose': vi.fn(), 'items': [{ id: 'copy', label: 'Copy' }] }, { anchor: () => null })])
    }
  }, { props: ['open'] })
  const view = await act(async () => render(h(Fixture, { 'open': true }, undefined)))
  const trigger = screen.getByRole('button', { name: 'Open' })
  const menu = screen.getByRole('menu')
  expect(trigger.getAttribute('aria-controls')?.split(' ')).toContain(menu.id)
  await act(async () => { view.rerender(h(Fixture, { 'open': false }, undefined)) })
  expect(trigger.getAttribute('aria-controls')).toBe(previous ?? null)
})
it('reopens after its external anchor is replaced while closed', async () => {
  const Fixture = defineComponent(() => {
    const open = shallowRef(false)
    const generation = shallowRef(0)
    const anchor = shallowRef<HTMLButtonElement | null>(null)
    return () => {
      return h(Fragment, null, [h('button', { 'onClick': () => { generation.value = (value => value + 1)(generation.value) } }, ['Replace anchor']), h('button', { 'key': generation.value, 'ref': anchor, 'onClick': () => { open.value = true } }, ['Open']), h(Menu, { 'open': open.value, 'portal': true, 'anchorRef': anchor, 'onClose': () => { open.value = false }, 'items': [{ id: 'copy', label: 'Copy' }] }, { anchor: () => null })])
    }
  }, { props: [] })
  await act(async () => render(h(Fixture)))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open' })))
  expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeTruthy()
  await act(async () => fireEvent.keyDown(document, { key: 'Escape' }))
  expect(screen.queryByRole('menu')).toBeNull()
  const previous = screen.getByRole('button', { name: 'Open' })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Replace anchor' })))
  expect(previous.isConnected).toBe(false)
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open' })))
  expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeTruthy()
})
it.each(['before', 'after'])('opens with an external anchor mounted %s the menu in the same commit', async (order) => {
  const Fixture = defineComponent(() => {
    const open = shallowRef(false)
    const anchor = shallowRef<HTMLButtonElement | null>(null)
    return () => {
      const trigger = open.value && h('button', { 'ref': anchor }, ['External anchor'])
      return h(Fragment, null, [h('button', { 'onClick': () => { open.value = true } }, ['Open']), order === 'before' && trigger, h(Menu, { 'open': open.value, 'portal': true, 'anchorRef': anchor, 'onClose': () => { open.value = false }, 'items': [{ id: 'copy', label: 'Copy' }] }, { anchor: () => null }), order === 'after' && trigger])
    }
  }, { props: [] })
  await act(async () => render(h(Fixture)))
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open' })))
  expect(screen.getByRole('menuitem', { name: 'Copy' })).toBeTruthy()
})
it('returns focus to the input that opened an external-anchor menu', async () => {
  const Fixture = defineComponent(() => {
    const open = shallowRef(false)
    const anchor = shallowRef<HTMLButtonElement | null>(null)
    return () => {
      return h(Fragment, null, [h('input', { 'aria-label': 'Draft', 'onKeydown': (event) => {
        if (event.key === 'F2')
          open.value = true
      } }, undefined), h('button', { 'ref': anchor }, ['Anchor']), h(Menu, { 'open': open.value, 'portal': true, 'autoFocus': true, 'anchorRef': anchor, 'onClose': () => { open.value = false }, 'items': [{ id: 'copy', label: 'Copy' }] }, { anchor: () => null })])
    }
  }, { props: [] })
  await act(async () => render(h(Fixture)))
  const input = screen.getByRole('textbox', { name: 'Draft' })
  await act(() => { input.focus() })
  await act(async () => fireEvent.keyDown(input, { key: 'F2' }))
  expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Copy' }))
  await act(async () => fireEvent.keyDown(document, { key: 'Escape' }))
  expect(document.activeElement).toBe(input)
})
