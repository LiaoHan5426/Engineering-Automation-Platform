// @vitest-environment jsdom
/** The outside-pointer dismissal primitive as observable popover behavior. */
import { h } from 'vue'
import { fireEvent, screen } from '@testing-library/dom'
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from './vue-render.ts'
import { shallowRef, defineComponent, Teleport } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { useDismissOnOutsidePointer } from '../src/useDismissOnOutsidePointer.ts'
afterEach(cleanup)
const Popover = defineComponent(({ portaled }: {
  portaled: boolean
}) => {
  const open = shallowRef(true)
  const rootRef = shallowRef<HTMLDivElement | null>(null)
  const panelRef = shallowRef<HTMLDivElement | null>(null)
  useDismissOnOutsidePointer(rootRef, () => open.value, (value) => { open.value = value }, portaled ? panelRef : undefined)
  return () => (h('div', { 'ref': rootRef, 'data-testid': 'root' }, [h('button', { 'type': 'button' }, ['trigger']), open.value && !portaled && h('div', { 'data-testid': 'surface' }, ['surface']), open.value && portaled && h(Teleport, { 'to': 'body' }, { default: () => [h('div', { 'ref': panelRef, 'data-testid': 'surface' }, ['surface'])] })]))
}, { props: ['portaled'] })
describe('useDismissOnOutsidePointer', () => {
  it('closes on an outside pointerdown but not on one inside the root', async () => {
    await act(async () => render(h(Popover, { 'portaled': false }, undefined)))
    await act(async () => fireEvent.pointerDown(screen.getByTestId('root')))
    expect(screen.queryByTestId('surface')).not.toBeNull()
    await act(async () => fireEvent.pointerDown(document.body))
    expect(screen.queryByTestId('surface')).toBeNull()
  })
  it('counts the portaled surface as inside while still closing outside it', async () => {
    await act(async () => render(h(Popover, { 'portaled': true }, undefined)))
    await act(async () => fireEvent.pointerDown(screen.getByTestId('surface')))
    expect(screen.queryByTestId('surface')).not.toBeNull()
    await act(async () => fireEvent.pointerDown(document.body))
    expect(screen.queryByTestId('surface')).toBeNull()
  })
})
