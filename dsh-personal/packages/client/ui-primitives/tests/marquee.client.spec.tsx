// @vitest-environment jsdom
import { defineComponent, h, shallowRef } from 'vue'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { fireEvent, screen } from '@testing-library/dom'
import { cleanupVue, flushVue, renderVue } from './vue-render.ts'
import { MarqueeText, useHoverMarquee } from '../src/Marquee.tsx'
afterEach(cleanupVue)
const Row = defineComponent({
  props: { text: { type: String, required: true }, hold: Boolean },
  setup(props) {
    const text = shallowRef<HTMLElement | null>(null)
    const handlers = useHoverMarquee(text, { hold: () => props.hold })
    return () => h('div', { role: 'row', onPointerenter: handlers.onPointerEnter, onPointerleave: handlers.onPointerLeave }, [
      h(MarqueeText, { elementRef: (element: HTMLSpanElement | null) => { text.value = element }, className: 'cell', 'data-cell': '' }, { default: () => props.text }),
    ])
  },
})
function element(): HTMLElement { return document.querySelector('[data-cell]') as HTMLElement }
function geometry(text: HTMLElement, scrollWidth: number, clientWidth: number): void {
  Object.defineProperty(text, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(text, 'clientWidth', { value: clientWidth, configurable: true })
}
function state(text: HTMLElement): (string | undefined)[] {
  return [text.dataset.marquee, text.style.getPropertyValue('--dsh-marquee-range'), text.style.getPropertyValue('--dsh-marquee-duration')]
}
describe('useHoverMarquee', () => {
  it('reveals overflow at 30px/s, ignores touch and repeated entry, and rests on leave', async () => {
    renderVue(h(Row, { text: 'A cell long enough to clip' }))
    const row = screen.getByRole('row'), text = element()
    expect(text.className).toContain('cell')
    expect(text.firstElementChild?.textContent).toBe('A cell long enough to clip')
    geometry(text, 320, 180)
    const touch = new Event('pointerenter')
    Object.defineProperty(touch, 'pointerType', { value: 'touch' })
    await flushVue(() => row.dispatchEvent(touch))
    expect(state(text)).toEqual([undefined, '', ''])
    await flushVue(() => fireEvent.pointerEnter(row))
    expect(state(text)).toEqual(['', '140px', '4667ms'])
    geometry(text, 400, 180)
    await flushVue(() => fireEvent.pointerEnter(row))
    expect(state(text)).toEqual(['', '140px', '4667ms'])
    await flushVue(() => fireEvent.pointerLeave(row))
    expect(state(text)).toEqual([undefined, '', ''])
  })
  it('keeps overflow of at most 8px at rest', async () => {
    renderVue(h(Row, { text: 'Short' }))
    const row = screen.getByRole('row'), text = element()
    for (const [width, expected] of [[180, false], [188, false], [189, true]] as const) {
      geometry(text, width, 180)
      await flushVue(() => fireEvent.pointerEnter(row))
      expect(text.hasAttribute('data-marquee')).toBe(expected)
      await flushVue(() => fireEvent.pointerLeave(row))
    }
  })
  it('keeps text revealed while held and rests only after both hold and hover end', async () => {
    const view = renderVue(h(Row, { text: 'Held text' }))
    const row = screen.getByRole('row'), text = element()
    geometry(text, 300, 200)
    await flushVue(() => view.rerender(h(Row, { text: 'Held text', hold: true })))
    expect(state(text)).toEqual(['', '100px', '3333ms'])
    await flushVue(() => fireEvent.pointerEnter(row))
    await flushVue(() => fireEvent.pointerLeave(row))
    expect(text.hasAttribute('data-marquee')).toBe(true)
    await flushVue(() => view.rerender(h(Row, { text: 'Held text' })))
    expect(text.hasAttribute('data-marquee')).toBe(false)
    await flushVue(() => fireEvent.pointerEnter(row))
    await flushVue(() => view.rerender(h(Row, { text: 'Held text', hold: true })))
    await flushVue(() => view.rerender(h(Row, { text: 'Held text' })))
    expect(text.hasAttribute('data-marquee')).toBe(true)
  })
  it('ignores hover while its element is detached', async () => {
    const Detached = defineComponent({ setup() {
      const handlers = useHoverMarquee(shallowRef<HTMLElement | null>(null))
      return () => h('div', { role: 'row', onPointerenter: handlers.onPointerEnter, onPointerleave: handlers.onPointerLeave })
    } })
    renderVue(h(Detached))
    await flushVue(() => fireEvent.pointerEnter(screen.getByRole('row')))
    await flushVue(() => fireEvent.pointerLeave(screen.getByRole('row')))
    expect(screen.getByRole('row').childElementCount).toBe(0)
  })
})
