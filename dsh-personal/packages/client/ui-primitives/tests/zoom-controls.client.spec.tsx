// @vitest-environment jsdom
/** Document controls share fitting, preset selection, gesture display, and focus-safe activation. */
import { defineComponent, h, shallowRef, type ShallowRef } from 'vue'
import { afterEach, expect, test, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/dom'
import { flushVue as act, cleanupVue as cleanup, renderVue as render } from './vue-render.ts'
import { ZoomControls, type ZoomControlsHandle } from '../src/ZoomControls.tsx'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

type ZoomProps = InstanceType<typeof ZoomControls>['$props']
const ZoomHarness = defineComponent((props: ZoomProps & { controls?: ShallowRef<ZoomControlsHandle | null> }) => () => {
  const { controls, ...input } = props
  return h(ZoomControls, { ...input, ...(controls === undefined ? {} : { ref: controls }) })
}, { props: ['zoom', 'fit', 'className', 'labels', 'visible', 'onZoom', 'onActiveChange', 'controls'] })

const labels = { controls: 'Document zoom', menu: 'Choose zoom', into: 'Zoom in', out: 'Zoom out', value: (percent: number) => `${String(percent)}%` }

test('shows owner-specific fitting, changes scale, and follows gesture updates without a document rerender', async () => {
  const zoom = vi.fn(), fit = vi.fn(), active = vi.fn(), ref = shallowRef<ZoomControlsHandle | null>(null)
  const props = { zoom: 1.13, visible: true, labels, onZoom: zoom, onActiveChange: active,
    fit: { label: 'Fit page', selected: true, onSelect: fit } }
  const view = render(h(ZoomHarness, { ...props, controls: ref }))
  await act(() => fireEvent.click(screen.getByRole('button', { name: 'Choose zoom' })))
  await act(() => fireEvent.click(screen.getByRole('menuitem', { name: 'Fit page' })))
  expect(fit).toHaveBeenCalledOnce()
  await act(() => fireEvent.click(screen.getByRole('button', { name: 'Choose zoom' })))
  await act(() => fireEvent.click(screen.getByRole('menuitem', { name: '150%' })))
  expect(zoom).toHaveBeenLastCalledWith(1.5)
  await act(() => { ref.value!.showZoom(0.8) })
  expect(screen.getByRole('button', { name: 'Choose zoom' }).textContent).toContain('80%')
  await act(() => fireEvent.click(screen.getByRole('button', { name: 'Zoom out' })))
  expect(zoom).toHaveBeenLastCalledWith(0.75)
  await act(() => fireEvent.click(screen.getByRole('button', { name: 'Zoom in' })))
  expect(zoom).toHaveBeenLastCalledWith(1)
  await act(() => view.rerender(h(ZoomHarness, { ...props, zoom: 4, controls: ref })))
  expect(screen.getByRole('button', { name: 'Zoom in' }).hasAttribute('disabled')).toBe(true)
  await act(() => view.rerender(h(ZoomHarness, { ...props, zoom: 0.25, controls: ref })))
  expect(screen.getByRole('button', { name: 'Zoom out' }).hasAttribute('disabled')).toBe(true)
})

test('without fit, lists only presets and keeps the toolbar active during pointer, focus, and menu interaction', async () => {
  const active = vi.fn(), zoom = vi.fn()
  const view = render(h(ZoomHarness, { zoom: 1, visible: false, labels: labels, onZoom: zoom, onActiveChange: active }))
  const panel = screen.getByRole('toolbar'), button = screen.getByRole('button', { name: 'Choose zoom' })
  expect(panel.hasAttribute('data-document-zoom-visible')).toBe(false)
  await act(() => fireEvent.pointerEnter(panel))
  expect(active).toHaveBeenLastCalledWith(true)
  await act(() => fireEvent.pointerLeave(panel))
  expect(active).toHaveBeenLastCalledWith(false)
  await act(() => fireEvent.focus(button))
  expect(active).toHaveBeenLastCalledWith(true)
  await act(() => fireEvent.blur(button, { relatedTarget: screen.getByRole('button', { name: 'Zoom in' }) }))
  expect(active).toHaveBeenLastCalledWith(true)
  await act(() => fireEvent.blur(button, { relatedTarget: document.body }))
  expect(active).toHaveBeenLastCalledWith(false)
  expect(fireEvent.mouseDown(button)).toBe(false)
  expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'Zoom in' }))).toBe(false)
  expect(fireEvent.mouseDown(screen.getByRole('button', { name: 'Zoom out' }))).toBe(false)
  await act(() => fireEvent.click(button))
  expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['25%', '50%', '100%', '150%', '200%'])
  expect(active).toHaveBeenLastCalledWith(true)
  await act(() => fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' }))
  expect(screen.queryByRole('menu')).toBeNull()
  view.unmount()
})

test('without fit, marks the matching preset and no row for an unlisted scale', async () => {
  const props = { visible: true, labels, onZoom: vi.fn(), onActiveChange: vi.fn() }
  const view = render(h(ZoomHarness, { ...props, zoom: 1 }))
  await act(() => fireEvent.click(screen.getByRole('button', { name: 'Choose zoom' })))
  expect(screen.getAllByRole('menuitem').filter(item => item.querySelector('svg') !== null).map(item => item.textContent))
    .toEqual(['100%'])
  await act(() => view.rerender(h(ZoomHarness, { ...props, zoom: 1.13 })))
  expect(screen.getByRole('button', { name: 'Choose zoom' }).textContent).toContain('113%')
  expect(screen.getAllByRole('menuitem').filter(item => item.querySelector('svg') !== null)).toEqual([])
})

test('drops a shown scale once the committed zoom changes, even when it later returns', async () => {
  const zoom = vi.fn(), ref = shallowRef<ZoomControlsHandle | null>(null)
  const props = { visible: true, labels, onZoom: zoom, onActiveChange: vi.fn() }
  const view = render(h(ZoomHarness, { ...props, zoom: 1, controls: ref }))
  await act(() => { ref.value!.showZoom(0.8) })
  await act(() => view.rerender(h(ZoomHarness, { ...props, zoom: 2, controls: ref })))
  await act(() => view.rerender(h(ZoomHarness, { ...props, zoom: 1, controls: ref })))
  expect(screen.getByRole('button', { name: 'Choose zoom' }).textContent).toContain('100%')
  await act(() => fireEvent.click(screen.getByRole('button', { name: 'Zoom in' })))
  expect(zoom).toHaveBeenLastCalledWith(1.25)
})
