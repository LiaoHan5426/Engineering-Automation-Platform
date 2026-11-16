// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/dom'
import { Fragment, h, shallowRef } from 'vue'
import { renderVue as render, cleanupVue as cleanup, flushVue } from './vue-render.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Tooltip } from '../src/Tooltip.tsx'
let bubbleSize: ResizeObserverSize
let automaticResize: boolean
const observers: TooltipResizeObserver[] = []
class TooltipResizeObserver implements ResizeObserver {
  private target: Element | undefined
  constructor(private readonly callback: ResizeObserverCallback) { observers.push(this); }
  observe(target: Element): void {
    this.target = target
    if (automaticResize)
      this.deliver()
  }
  unobserve(): void { this.target = undefined; }
  disconnect(): void { this.target = undefined; }
  deliver(): void {
    if (this.target === undefined)
      return
    this.callback([{
        target: this.target, borderBoxSize: [bubbleSize], contentBoxSize: [bubbleSize],
        devicePixelContentBoxSize: [bubbleSize],
        contentRect: new DOMRect(0, 0, bubbleSize.inlineSize, bubbleSize.blockSize),
      }], this)
  }
}
beforeEach(async () => {
  bubbleSize = { inlineSize: 0, blockSize: 0 }
  automaticResize = true
  observers.length = 0
  vi.stubGlobal('ResizeObserver', TooltipResizeObserver)
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  await fireEvent.keyDown(document.body, { key: 'Tab' })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
describe('Tooltip', () => {
  describe('touch interaction', () => {
    beforeEach(() => { vi.useFakeTimers(); })
    afterEach(() => { cleanup(); vi.useRealTimers(); })
    it('ignores emulated mouse entry on touch-only devices while preserving keyboard focus and connected mice', async () => {
      const media = vi.fn(() => ({ matches: false }))
      vi.stubGlobal('matchMedia', media)
      const view = render(h(Tooltip, { "label": "Copy" }, () => [h("button", {}, ["anchor"])]))
      const anchor = screen.getByText('anchor')
      await fireEvent.pointerDown(anchor, { pointerType: 'touch' })
      await fireEvent.click(anchor)
      for (const label of ['Copied', 'Copy']) {
        await flushVue(() => view.rerender(h(Tooltip, { "label": label }, () => [h("button", {}, ["anchor"])])))
        await fireEvent.pointerEnter(anchor, { pointerType: 'mouse' })
        expect(screen.queryByRole('tooltip')).toBeNull()
      }
      expect(media).toHaveBeenCalledWith('(any-hover: hover)')
      await fireEvent.keyDown(document.body, { key: 'Tab' })
      await fireEvent.focus(anchor)
      expect(screen.getByRole('tooltip').textContent).toBe('Copy')
      await fireEvent.blur(anchor)
      media.mockReturnValue({ matches: true })
      await fireEvent.pointerEnter(anchor, { pointerType: 'mouse' })
      expect(screen.getByRole('tooltip').textContent).toBe('Copy')
    })
    it('executes an action once without showing a tooltip for touch or compatibility mouse events', async () => {
      const clicked = vi.fn()
      const label = vi.fn(() => 'Copy')
      render(h(Tooltip, { "label": label, "delayMs": 500 }, () => [h("button", { "onClick": clicked }, ["anchor"])]))
      const anchor = screen.getByText('anchor')
      await fireEvent.pointerEnter(anchor, { pointerType: 'touch' })
      await fireEvent.pointerDown(anchor, { pointerType: 'touch' })
      await fireEvent.mouseEnter(anchor)
      await fireEvent.focus(anchor)
      await flushVue(() => { vi.advanceTimersByTime(500); })
      expect(label).not.toHaveBeenCalled()
      expect(screen.queryByRole('tooltip')).toBeNull()
      await fireEvent.pointerUp(anchor, { pointerType: 'touch' })
      await fireEvent.pointerLeave(anchor, { pointerType: 'touch' })
      await fireEvent.click(anchor)
      await fireEvent.mouseLeave(anchor)
      await fireEvent.mouseEnter(anchor)
      await flushVue(() => { vi.advanceTimersByTime(500); })
      expect(clicked).toHaveBeenCalledOnce()
      expect(label).not.toHaveBeenCalled()
      expect(screen.queryByRole('tooltip')).toBeNull()
    })
    it.each([0, 500])('cancels an existing mouse hover on touch with a %i ms delay', async (delayMs) => {
      render(h(Tooltip, { "label": "Copy", "delayMs": delayMs }, () => [h("button", {}, ["anchor"])]))
      const anchor = screen.getByText('anchor')
      await fireEvent.pointerEnter(anchor, { pointerType: 'mouse' })
      expect(screen.queryByRole('tooltip') !== null).toBe(delayMs === 0)
      await fireEvent.pointerDown(anchor, { pointerType: 'touch' })
      await flushVue(() => { vi.advanceTimersByTime(500); })
      expect(screen.queryByRole('tooltip')).toBeNull()
      await fireEvent.pointerLeave(anchor, { pointerType: 'touch' })
      await fireEvent.pointerEnter(anchor, { pointerType: 'mouse' })
      await flushVue(() => { vi.advanceTimersByTime(500); })
      expect(screen.getByRole('tooltip').textContent).toBe('Copy')
      await fireEvent.pointerLeave(anchor, { pointerType: 'mouse' })
      await fireEvent.keyDown(document.body, { key: 'Tab' })
      await fireEvent.focus(anchor)
      expect(screen.getByRole('tooltip').textContent).toBe('Copy')
    })
    it('opens an explanation only on tap and keeps it readable until another tap or outside press', async () => {
      render(h(Tooltip, { "label": "Plugin information", "delayMs": 500, "openOnClick": true, "portal": true }, () => [h("button", {}, ["anchor"])]))
      const anchor = screen.getByText('anchor')
      const tap = async () => {
        await fireEvent.pointerEnter(anchor, { pointerType: 'touch' })
        await fireEvent.pointerDown(anchor, { pointerType: 'touch' })
        await fireEvent.focus(anchor)
        await fireEvent.pointerUp(anchor, { pointerType: 'touch' })
        await fireEvent.pointerLeave(anchor, { pointerType: 'touch' })
        await fireEvent.click(anchor)
      }
      await fireEvent.pointerEnter(anchor, { pointerType: 'touch' })
      await flushVue(() => { vi.advanceTimersByTime(500); })
      expect(screen.queryByRole('tooltip')).toBeNull()
      await tap()
      const bubble = screen.getByRole('tooltip')
      expect(bubble.textContent).toBe('Plugin information')
      expect(anchor.getAttribute('aria-describedby')).toBe(bubble.id)
      await fireEvent.blur(anchor)
      await fireEvent.pointerDown(bubble, { pointerType: 'touch' })
      expect(screen.getByRole('tooltip')).toBe(bubble)
      await tap()
      expect(screen.queryByRole('tooltip')).toBeNull()
      await tap()
      await fireEvent.pointerDown(document.body, { pointerType: 'touch' })
      expect(screen.queryByRole('tooltip')).toBeNull()
    })
  })
  it('updates independent keycaps and the accessible combination while visible', async () => {
    const view = render(h(Tooltip, { "label": "Reload", "shortcutKeys": ['⌘', 'R'] }, () => [h("button", {}, ["anchor"])]))
    await fireEvent.focus(screen.getByText('anchor'))
    expect(Array.from(screen.getByRole('tooltip', { name: 'Reload ⌘ R' }).querySelectorAll('kbd'), key => key.textContent)).toEqual(['⌘', 'R'])
    await flushVue(() => view.rerender(h(Tooltip, { "label": "Reload", "shortcutKeys": ['Ctrl', '+', 'R'] }, () => [h("button", {}, ["anchor"])])))
    expect(Array.from(screen.getByRole('tooltip', { name: 'Reload Ctrl + R' }).querySelectorAll('kbd'), key => key.textContent)).toEqual(['Ctrl', '+', 'R'])
    await flushVue(() => view.rerender(h(Tooltip, { "label": "Reload", "shortcutKeys": [] }, () => [h("button", {}, ["anchor"])])))
    expect(screen.getByRole('tooltip').querySelector('kbd')).toBeNull()
    await fireEvent.click(screen.getByText('anchor'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
  it('fits from observed sizes without synchronously measuring the bubble', async () => {
    automaticResize = false
    const measured = vi.spyOn(Element.prototype, 'getBoundingClientRect')
    const view = render(h(Tooltip, { "label": "Observed", "side": "bottom" }, () => [h("button", {}, ["anchor"])]))
    const anchor = screen.getByText('anchor')
    await fireEvent.pointerEnter(anchor)
    const bubble = view.container.querySelector<HTMLElement>('[role="tooltip"]')!
    expect(measured.mock.contexts).toEqual([anchor])
    expect(bubble.style.visibility).toBe('hidden')
    await fireEvent(window, new Event('resize'))
    expect(bubble.style.visibility).toBe('hidden')
    expect(measured.mock.contexts).toEqual([anchor, anchor])
    bubbleSize = { inlineSize: 100, blockSize: 20 }
    await flushVue(() => { observers[0]!.deliver(); })
    expect(screen.getByRole('tooltip').style.left).toBe('62px')
    await fireEvent(window, new Event('resize'))
    expect(measured.mock.contexts).toEqual([anchor, anchor, anchor])
    const disconnect = vi.spyOn(observers[0]!, 'disconnect')
    view.unmount()
    expect(disconnect).toHaveBeenCalledOnce()
  })
  it('fits a default right-edge tooltip left and follows its focused anchor on resize', async () => {
    vi.stubGlobal('innerWidth', 1280)
    vi.stubGlobal('innerHeight', 900)
    bubbleSize = { inlineSize: 118, blockSize: 26 }
    render(h(Tooltip, { "label": "Pin", "portal": true }, () => [h("button", {}, ["anchor"])]))
    const anchor = screen.getByText('anchor')
    const measure = vi.spyOn(anchor, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(1150.5, 736.08, 22, 22))
    await fireEvent.keyDown(document.body, { key: 'Tab' })
    await flushVue(() => { anchor.focus(); })
    const bubble = screen.getByRole('tooltip')
    expect(bubble.dataset.side).toBe('left')
    expect(bubble.style.left).toBe('1022.5px')
    expect(bubble.parentElement).toBe(document.body)
    expect(document.activeElement).toBe(anchor)
    vi.stubGlobal('innerWidth', 390)
    measure.mockReturnValue(new DOMRect(180, 300, 22, 22))
    bubbleSize = { inlineSize: 195, blockSize: 66 }
    await fireEvent(window, new Event('resize'))
    await flushVue(() => { observers[0]!.deliver(); })
    expect(bubble.dataset.side).toBe('bottom')
    expect(bubble.style.left).toBe('191px')
    expect(bubble.style.top).toBe('330px')
    await flushVue(() => { observers[0]!.deliver(); })
    expect(bubble.dataset.side).toBe('bottom')
    expect(document.activeElement).toBe(anchor)
    vi.stubGlobal('innerWidth', 1280)
    measure.mockReturnValue(new DOMRect(400, 400, 22, 22))
    await fireEvent(window, new Event('resize'))
    expect(bubble.dataset.side).toBe('right')
    expect(bubble.style.left).toBe('432px')
    expect(document.activeElement).toBe(anchor)
  })
  it('handles resize during anchor ref cleanup and removes its listener on unmount', async () => {
    const measure = vi.spyOn(Element.prototype, 'getBoundingClientRect')
    const childRef = (element: Element | import('vue').ComponentPublicInstance | null) => {
      if (element === null)
        fireEvent(window, new Event('resize'))
    }
    const view = render(h(Tooltip, { "label": "Cleanup" }, () => [h("button", { "ref": childRef }, ["anchor"])]))
    await fireEvent.pointerEnter(screen.getByText('anchor'))
    expect(screen.getByRole('tooltip')).toBeTruthy()
    view.unmount()
    expect(screen.queryByRole('tooltip')).toBeNull()
    await fireEvent(window, new Event('resize'))
    expect(measure).toHaveBeenCalledOnce()
  })
  it('resolves lazy labels only after the bubble becomes visible', async () => {
    vi.useFakeTimers()
    try {
      const label = vi.fn(() => 'Timing details')
      render(h(Tooltip, { "label": label, "delayMs": 500 }, () => [h("button", { "type": "button" }, ["anchor"])]))
      expect(label).not.toHaveBeenCalled()
      await fireEvent.pointerEnter(screen.getByText('anchor'))
      await flushVue(() => { vi.advanceTimersByTime(499); })
      expect(label).not.toHaveBeenCalled()
      await flushVue(() => { vi.advanceTimersByTime(1); })
      expect(screen.getByRole('tooltip').textContent).toBe('Timing details')
      expect(label).toHaveBeenCalledOnce()
    }
    finally {
      vi.useRealTimers()
    }
  })
  it('can delay pointer hover without delaying keyboard focus', async () => {
    vi.useFakeTimers()
    try {
      render(h(Tooltip, { "label": "Timing details", "delayMs": 500 }, () => [h("button", { "type": "button" }, ["anchor"])]))
      const anchor = screen.getByText('anchor')
      await fireEvent.pointerEnter(anchor)
      await flushVue(() => { vi.advanceTimersByTime(499); })
      expect(screen.queryByRole('tooltip')).toBeNull()
      await fireEvent.pointerLeave(anchor)
      await flushVue(() => { vi.advanceTimersByTime(1); })
      expect(screen.queryByRole('tooltip')).toBeNull()
      await fireEvent.pointerEnter(anchor)
      await flushVue(() => { vi.advanceTimersByTime(500); })
      expect(screen.getByRole('tooltip').textContent).toBe('Timing details')
      await fireEvent.pointerLeave(anchor)
      await fireEvent.focus(anchor)
      expect(screen.getByRole('tooltip').textContent).toBe('Timing details')
    }
    finally {
      vi.useRealTimers()
    }
  })
  describe('keyboard focus delay', () => {
    beforeEach(async () => {
      vi.useFakeTimers()
      await fireEvent.keyDown(document.body, { key: 'Tab' })
    })
    afterEach(async () => {
      cleanup()
      vi.useRealTimers()
      await fireEvent.keyDown(document.body, { key: 'Tab' })
    })
    it('shows at 500ms, but not at 499ms', async () => {
      const label = vi.fn(() => 'Refresh')
      render(h(Tooltip, { "label": label, "delayMs": 500, "focusDelayMs": 500 }, () => [h("button", {}, ["anchor"])]))
      await fireEvent.focus(screen.getByText('anchor'))
      expect(screen.queryByRole('tooltip')).toBeNull()
      await flushVue(() => { vi.advanceTimersByTime(499); })
      expect(screen.queryByRole('tooltip')).toBeNull()
      expect(label).not.toHaveBeenCalled()
      await flushVue(() => { vi.advanceTimersByTime(1); })
      expect(screen.getByRole('tooltip').textContent).toBe('Refresh')
    })
    it.each(['blur', 'click', 'pointerLeave', 'disabled', 'unmount'] as const)('cancels a pending focus bubble on %s', async (cancel) => {
      const view = render(h(Tooltip, { "label": "Refresh", "focusDelayMs": 500 }, () => [h("button", {}, ["anchor"])]))
      const anchor = screen.getByText('anchor')
      const initialTimers = vi.getTimerCount()
      await fireEvent.focus(anchor)
      expect(vi.getTimerCount()).toBe(initialTimers + 1)
      await flushVue(() => { vi.advanceTimersByTime(499); })
      if (cancel === 'disabled') {
        await flushVue(() => view.rerender(h(Tooltip, { "label": "Refresh", "focusDelayMs": 500, "disabled": true }, () => [h("button", {}, ["anchor"])])))
      }
      else if (cancel === 'unmount') {
        view.unmount()
      }
      else {
        await fireEvent[cancel](anchor)
      }
      expect(vi.getTimerCount()).toBe(initialTimers)
      await flushVue(() => { vi.advanceTimersByTime(500); })
      expect(screen.queryByRole('tooltip')).toBeNull()
      if (cancel === 'disabled') {
        await flushVue(() => view.rerender(h(Tooltip, { "label": "Refresh", "focusDelayMs": 500 }, () => [h("button", {}, ["anchor"])])))
        expect(screen.queryByRole('tooltip')).toBeNull()
      }
    })
    it('keeps default focus immediate and cancels a pending hover delay', async () => {
      render(h(Tooltip, { "label": "Refresh", "delayMs": 500 }, () => [h("button", {}, ["anchor"])]))
      const anchor = screen.getByText('anchor')
      const initialTimers = vi.getTimerCount()
      await fireEvent.pointerEnter(anchor)
      await flushVue(() => { vi.advanceTimersByTime(499); })
      expect(screen.queryByRole('tooltip')).toBeNull()
      await fireEvent.focus(anchor)
      expect(screen.getByRole('tooltip').textContent).toBe('Refresh')
      expect(vi.getTimerCount()).toBe(initialTimers)
    })
    it('does not schedule pointer-driven focus and resumes delay after a key press', async () => {
      render(h(Tooltip, { "label": "Refresh", "focusDelayMs": 500 }, () => [h("button", {}, ["anchor"])]))
      const anchor = screen.getByText('anchor')
      const initialTimers = vi.getTimerCount()
      await fireEvent.pointerDown(document.body)
      await fireEvent.focus(anchor)
      expect(vi.getTimerCount()).toBe(initialTimers)
      await flushVue(() => { vi.advanceTimersByTime(500); })
      expect(screen.queryByRole('tooltip')).toBeNull()
      await fireEvent.blur(anchor)
      await fireEvent.keyDown(document.body, { key: 'Tab' })
      await fireEvent.focus(anchor)
      await flushVue(() => { vi.advanceTimersByTime(499); })
      expect(screen.queryByRole('tooltip')).toBeNull()
      await flushVue(() => { vi.advanceTimersByTime(1); })
      expect(screen.getByRole('tooltip').textContent).toBe('Refresh')
    })
  })
  it('shows the bubble to the right on hover and hides it on leave', async () => {
    render(h(Tooltip, { "label": "Open sidebar" }, () => [h("button", { "type": "button" }, ["anchor"])]))
    const anchor = screen.getByText('anchor')
    await fireEvent.pointerEnter(anchor)
    const bubble = screen.getByRole('tooltip')
    expect(bubble.textContent).toBe('Open sidebar')
    expect(bubble.getAttribute('data-side')).toBe('right')
    expect(bubble.style.left).toBe('12px')
    expect(bubble.style.top).toBe('12px')
    await fireEvent.pointerLeave(anchor)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
  it('supports bottom placement and the focus/blur channel', async () => {
    render(h(Tooltip, { "label": "Below", "side": "bottom" }, () => [h("button", { "type": "button" }, ["anchor"])]))
    const anchor = screen.getByText('anchor')
    await fireEvent.focus(anchor)
    const bubble = screen.getByRole('tooltip')
    expect(bubble.getAttribute('data-side')).toBe('bottom')
    // Zero-width jsdom rect at x=0 clamps to the 12px edge margin.
    expect(bubble.style.left).toBe('12px')
    expect(bubble.style.top).toBe('12px')
    await fireEvent.blur(anchor)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
  // Anchor geometry and observed bubble sizes are independent browser inputs.
  const rect = (left: number, right: number): DOMRect => ({ left, right, top: 0, bottom: 20, width: right - left, height: 20, x: left, y: 0, toJSON: () => ({}) })
  it('aligns the end of a bottom tooltip with the anchor right edge', async () => {
    bubbleSize = { inlineSize: 100, blockSize: 20 }
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect(100, 200))
    try {
      render(h(Tooltip, { "label": "End aligned", "side": "bottom", "align": "end" }, () => [h("button", { "type": "button" }, ["anchor"])]))
      await fireEvent.pointerEnter(screen.getByText('anchor'))
      const bubble = screen.getByRole('tooltip')
      expect(bubble.getAttribute('data-align')).toBe('end')
      expect(bubble.style.left).toBe('200px')
    }
    finally {
      spy.mockRestore()
    }
  })
  it('caps the bubble width where the label would otherwise slab across the surface', async () => {
    render(h(Tooltip, { "label": "A description long enough to need a cap", "side": "bottom", "maxWidth": 360 }, () => [h("button", { "type": "button" }, ["anchor"])]))
    await fireEvent.pointerEnter(screen.getByText('anchor'))
    expect(screen.getByRole('tooltip').style.maxWidth).toBe('min(360px, calc(100vw - 24px))')
  })
  it('clamps a bubble overflowing the right viewport edge back inside', async () => {
    bubbleSize = { inlineSize: 200, blockSize: 20 }
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect(900, 1100))
    try {
      render(h(Tooltip, { "label": "Wide", "side": "bottom" }, () => [h("button", { "type": "button" }, ["anchor"])]))
      await fireEvent.pointerEnter(screen.getByText('anchor'))
      // pos.x = 1000 (anchor center); measured right edge 1100 overflows the
      // 1024 viewport's 12px safe margin (limit 1012) by 88, so the clamp
      // shifts left to 912.
      expect(screen.getByRole('tooltip').style.left).toBe('912px')
    }
    finally {
      spy.mockRestore()
    }
  })
  it('reclamps after label and viewport width changes', async () => {
    const originalWidth = window.innerWidth
    bubbleSize = { inlineSize: 200, blockSize: 20 }
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect(900, 1000))
    try {
      const view = render(h(Tooltip, { "label": "Wide", "side": "bottom" }, () => [h("button", { "type": "button" }, ["anchor"])]))
      await fireEvent.pointerEnter(screen.getByText('anchor'))
      expect(screen.getByRole('tooltip').style.left).toBe('912px')
      await flushVue(() => view.rerender(h(Tooltip, { "label": "Short", "side": "bottom" }, () => [h("button", { "type": "button" }, ["anchor"])])))
      bubbleSize = { inlineSize: 100, blockSize: 20 }
      await flushVue(() => { observers[0]!.deliver(); })
      expect(screen.getByRole('tooltip').style.left).toBe('950px')
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 })
      await fireEvent(window, new Event('resize'))
      expect(screen.getByRole('tooltip').style.left).toBe('838px')
      expect(observers).toHaveLength(1)
      expect(spy).toHaveBeenCalledTimes(2)
    }
    finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth })
      spy.mockRestore()
    }
  })
  it('clamps a bubble past the left viewport edge back inside', async () => {
    bubbleSize = { inlineSize: 100, blockSize: 20 }
    const spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(rect(-20, 80))
    try {
      render(h(Tooltip, { "label": "Wide", "side": "bottom" }, () => [h("button", { "type": "button" }, ["anchor"])]))
      await fireEvent.pointerEnter(screen.getByText('anchor'))
      // pos.x = 30 (anchor center); measured left edge -20 underflows the
      // 12px safe margin by 32, so the clamp shifts right to 62.
      expect(screen.getByRole('tooltip').style.left).toBe('62px')
    }
    finally {
      spy.mockRestore()
    }
  })
  const placed = (top: number, bottom: number, bubbleHeight: number) => {
    bubbleSize = { inlineSize: 100, blockSize: bubbleHeight }
    return vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 100, right: 200, top, bottom, width: 100, height: bottom - top, x: 100, y: top, toJSON: () => ({}),
    })
  }
  it('supports top placement for anchors at the viewport bottom', async () => {
    const spy = placed(700, 720, 20)
    try {
      render(h(Tooltip, { "label": "Above", "side": "top" }, () => [h("button", { "type": "button" }, ["anchor"])]))
      await fireEvent.pointerEnter(screen.getByText('anchor'))
      const bubble = screen.getByRole('tooltip')
      // There is room above, so the requested side stands: the bubble's own
      // top sits at the anchor's top less the 8px gutter.
      expect(bubble.getAttribute('data-side')).toBe('top')
      expect(bubble.style.top).toBe('692px')
      expect(bubble.style.left).toBe('150px')
    }
    finally {
      spy.mockRestore()
    }
  })
  it('flips a bottom bubble above an anchor with no room below', async () => {
    // jsdom's viewport is 768 tall: a 300px bubble under an anchor ending at
    // 700 would run off, and there is room for it above.
    const spy = placed(600, 700, 300)
    try {
      render(h(Tooltip, { "label": "Tall", "side": "bottom" }, () => [h("button", { "type": "button" }, ["anchor"])]))
      await fireEvent.pointerEnter(screen.getByText('anchor'))
      const bubble = screen.getByRole('tooltip')
      expect(bubble.getAttribute('data-side')).toBe('top')
      expect(bubble.style.top).toBe('592px')
    }
    finally {
      spy.mockRestore()
    }
  })
  it('flips a top bubble below an anchor with no room above', async () => {
    const spy = placed(10, 40, 100)
    try {
      render(h(Tooltip, { "label": "Tall", "side": "top" }, () => [h("button", { "type": "button" }, ["anchor"])]))
      await fireEvent.pointerEnter(screen.getByText('anchor'))
      const bubble = screen.getByRole('tooltip')
      expect(bubble.getAttribute('data-side')).toBe('bottom')
      expect(bubble.style.top).toBe('48px')
    }
    finally {
      spy.mockRestore()
    }
  })
  it.each(['bottom', 'top'] as const)('uses a custom gap to position and flip a %s tooltip', async (side) => {
    const anchorBottom = side === 'bottom' ? window.innerHeight - 36 : 56
    const spy = placed(anchorBottom - 20, anchorBottom, 20)
    try {
      const view = render(h(Tooltip, { "label": "Gap", "side": side, "gap": 4 }, () => [h("button", { "type": "button" }, ["anchor"])]))
      await fireEvent.pointerEnter(screen.getByText('anchor'))
      const bubble = screen.getByRole('tooltip')
      expect(bubble.getAttribute('data-side')).toBe(side)
      expect(bubble.style.top).toBe(`${side === 'bottom' ? anchorBottom + 4 : anchorBottom - 24}px`)
      await flushVue(() => view.rerender(h(Tooltip, { "label": "Gap", "side": side, "gap": 12 }, () => [h("button", { "type": "button" }, ["anchor"])])))
      expect(bubble.getAttribute('data-side')).toBe(side === 'bottom' ? 'top' : 'bottom')
      expect(bubble.style.top).toBe(`${side === 'bottom' ? anchorBottom - 32 : anchorBottom + 12}px`)
    }
    finally {
      spy.mockRestore()
    }
  })
  it('uses a horizontal side for viewport-height content instead of covering the anchor', async () => {
    const spy = placed(300, 400, 900)
    try {
      render(h(Tooltip, { "label": "Huge", "side": "bottom" }, () => [h("button", { "type": "button" }, ["anchor"])]))
      await fireEvent.pointerEnter(screen.getByText('anchor'))
      expect(screen.getByRole('tooltip').getAttribute('data-side')).toBe('right')
      expect(screen.getByRole('tooltip').style.left).toBe('210px')
    }
    finally {
      spy.mockRestore()
    }
  })
  it('pins an informational tooltip on click and preserves the anchor description', async () => {
    const clicked = vi.fn()
    render(h(Fragment, {}, [h("p", { "id": "existing-description" }, ["Existing description"]), h(Tooltip, { "label": "Plugin information", "openOnClick": true, "portal": true }, () => [h("button", { "aria-describedby": "existing-description", "onClick": clicked }, ["anchor"])])]))
    const anchor = screen.getByText('anchor')
    await fireEvent.pointerDown(anchor)
    await fireEvent.focus(anchor)
    expect(screen.queryByRole('tooltip')).toBeNull()
    await fireEvent.click(anchor)
    expect(clicked).toHaveBeenCalledOnce()
    const bubble = screen.getByRole('tooltip')
    expect(bubble.textContent).toBe('Plugin information')
    expect(anchor.getAttribute('aria-describedby')).toBe(`existing-description ${bubble.id}`)
    await fireEvent.pointerLeave(anchor)
    await fireEvent.blur(anchor)
    expect(screen.getByRole('tooltip')).toBe(bubble)
    await fireEvent.pointerDown(bubble)
    expect(screen.getByRole('tooltip')).toBe(bubble)
    await fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(anchor.getAttribute('aria-describedby')).toBe('existing-description')
    await fireEvent.click(anchor)
    expect(screen.getByRole('tooltip')).toBeTruthy()
    await fireEvent.click(anchor)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
  it('shows informational tooltips on hover and focus, and consumes Escape only while open', async () => {
    const onKeyDown = vi.fn()
    render(h("div", { "onKeydown": onKeyDown }, [h(Tooltip, { "label": "Plugin information", "openOnClick": true }, () => [h("button", {}, ["anchor"])])]))
    const anchor = screen.getByText('anchor')
    await fireEvent.pointerEnter(anchor)
    expect(screen.getByRole('tooltip').textContent).toBe('Plugin information')
    await fireEvent.pointerLeave(anchor)
    expect(screen.queryByRole('tooltip')).toBeNull()
    await fireEvent.keyDown(anchor, { key: 'Tab' })
    await fireEvent.focus(anchor)
    expect(screen.getByRole('tooltip')).toBeTruthy()
    await fireEvent.keyDown(anchor, { key: 'a' })
    expect(screen.getByRole('tooltip')).toBeTruthy()
    onKeyDown.mockClear()
    expect(await fireEvent.keyDown(anchor, { key: 'Escape' })).toBe(false)
    expect(onKeyDown).not.toHaveBeenCalled()
    expect(screen.queryByRole('tooltip')).toBeNull()
    await fireEvent.keyDown(anchor, { key: 'Escape' })
    expect(onKeyDown).toHaveBeenCalledOnce()
    await fireEvent.click(anchor)
    expect(await fireEvent.keyDown(anchor, { key: 'Tab' })).toBe(true)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
  it('cancels a delayed hover when clicking to pin the information', async () => {
    vi.useFakeTimers()
    try {
      render(h(Tooltip, { "label": "Plugin information", "openOnClick": true, "delayMs": 300 }, () => [h("button", {}, ["anchor"])]))
      const anchor = screen.getByText('anchor')
      await fireEvent.pointerEnter(anchor)
      expect(screen.queryByRole('tooltip')).toBeNull()
      await fireEvent.click(anchor)
      expect(screen.getByRole('tooltip')).toBeTruthy()
      await fireEvent.pointerLeave(anchor)
      expect(screen.getByRole('tooltip')).toBeTruthy()
      await fireEvent.keyDown(anchor, { key: 'Escape' })
      await flushVue(() => { vi.advanceTimersByTime(300); })
      expect(screen.queryByRole('tooltip')).toBeNull()
    }
    finally {
      cleanup()
      vi.useRealTimers()
    }
  })
  it('drops a click pin when disabled or when click opening is removed', async () => {
    const view = render(h(Tooltip, { "label": "Plugin information", "openOnClick": true }, () => [h("button", {}, ["anchor"])]))
    const anchor = screen.getByText('anchor')
    await fireEvent.click(anchor)
    await flushVue(() => view.rerender(h(Tooltip, { "label": "Plugin information", "openOnClick": true, "disabled": true }, () => [h("button", {}, ["anchor"])])))
    expect(screen.queryByRole('tooltip')).toBeNull()
    await fireEvent.click(anchor)
    expect(screen.queryByRole('tooltip')).toBeNull()
    await flushVue(() => view.rerender(h(Tooltip, { "label": "Plugin information", "openOnClick": true }, () => [h("button", {}, ["anchor"])])))
    await fireEvent.click(anchor)
    expect(screen.getByRole('tooltip')).toBeTruthy()
    await flushVue(() => view.rerender(h(Tooltip, { "label": "Plugin information" }, () => [h("button", {}, ["anchor"])])))
    await fireEvent.pointerLeave(anchor)
    expect(screen.queryByRole('tooltip')).toBeNull()
    await flushVue(() => view.rerender(h(Tooltip, { "label": "Plugin information", "openOnClick": true }, () => [h("button", {}, ["anchor"])])))
    await fireEvent.click(anchor)
    view.unmount()
    expect(await fireEvent.keyDown(document.body, { key: 'Escape' })).toBe(true)
  })
  it('a click on the anchor dismisses the bubble even while the anchor stays focused', async () => {
    render(h(Tooltip, { "label": "Pin session" }, () => [h("button", { "type": "button" }, ["anchor"])]))
    const anchor = screen.getByText('anchor')
    // Pointer click: browsers focus the button first, then deliver the click.
    await fireEvent.focus(anchor)
    await fireEvent.pointerEnter(anchor)
    expect(screen.getByRole('tooltip')).toBeTruthy()
    await fireEvent.click(anchor)
    expect(screen.queryByRole('tooltip')).toBeNull()
    // The retained focus alone must not resurrect it on mouse leave.
    await fireEvent.pointerLeave(anchor)
    expect(screen.queryByRole('tooltip')).toBeNull()
    // A fresh hover shows the (possibly relabelled) bubble again.
    await fireEvent.pointerEnter(anchor)
    expect(screen.getByRole('tooltip')).toBeTruthy()
  })
  it('focus arriving after a pointer interaction does not raise the bubble', async () => {
    render(h(Tooltip, { "label": "View options" }, () => [h("button", { "type": "button" }, ["anchor"])]))
    const anchor = screen.getByText('anchor')
    // A closing menu refocuses its trigger after a mouse selection: the last
    // interaction was a pointerdown on the menu row, not a key press.
    await fireEvent.pointerDown(document.body)
    await fireEvent.focus(anchor)
    expect(screen.queryByRole('tooltip')).toBeNull()
    await fireEvent.blur(anchor)
    // The next key press restores focus-driven bubbles (keyboard selection).
    await fireEvent.keyDown(document.body, { key: 'Tab' })
    await fireEvent.focus(anchor)
    expect(screen.getByRole('tooltip')).toBeTruthy()
  })
  it('chains the anchor\'s own handlers ahead of the tooltip\'s', async () => {
    const onPointerEnter = vi.fn()
    const onPointerLeave = vi.fn()
    const onPointerDown = vi.fn()
    const onClick = vi.fn()
    const onFocus = vi.fn()
    const onBlur = vi.fn()
    render(h(Tooltip, { "label": "Chained" }, () => [h("button", { "type": "button", "onPointerenter": onPointerEnter, "onPointerleave": onPointerLeave, "onPointerdown": onPointerDown, "onClick": onClick, "onFocus": onFocus, "onBlur": onBlur }, ["anchor"])]))
    const anchor = screen.getByText('anchor')
    await fireEvent.pointerEnter(anchor)
    await fireEvent.pointerDown(anchor)
    await fireEvent.pointerLeave(anchor)
    await fireEvent.click(anchor)
    await fireEvent.focus(anchor)
    await fireEvent.blur(anchor)
    expect(onPointerEnter).toHaveBeenCalledOnce()
    expect(onPointerLeave).toHaveBeenCalledOnce()
    expect(onPointerDown).toHaveBeenCalledOnce()
    expect(onClick).toHaveBeenCalledOnce()
    expect(onFocus).toHaveBeenCalledOnce()
    expect(onBlur).toHaveBeenCalledOnce()
  })
  it('suppresses the bubble while disabled without remounting the anchor', async () => {
    const { rerender } = render(h(Tooltip, { "label": "Rail", "disabled": true }, () => [h("button", { "type": "button" }, ["anchor"])]))
    const anchor = screen.getByText('anchor')
    await fireEvent.pointerEnter(anchor)
    expect(screen.queryByRole('tooltip')).toBeNull()
    await flushVue(() => rerender(h(Tooltip, { "label": "Rail" }, () => [h("button", { "type": "button" }, ["anchor"])])))
    // Same DOM node: toggling disabled never remounted the anchor.
    expect(screen.getByText('anchor')).toBe(anchor)
    await fireEvent.pointerEnter(anchor)
    expect(screen.getByRole('tooltip')).toBeTruthy()
  })
  it('shows a clipped-only bubble when the anchor or a descendant overflows at show time', async () => {
    render(h(Tooltip, { "label": "Full label", "onlyWhenClipped": true }, () => [h("button", { "type": "button" }, [h("svg", {}), h("span", {}, ["Full\u2026"])])]))
    const anchor = screen.getByRole('button')
    const label = screen.getByText('Full…')
    const overflowing = new Set<Element>()
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) { return overflowing.has(this) ? 120 : 80; })
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(80)
    await fireEvent.pointerEnter(anchor)
    expect(screen.queryByRole('tooltip')).toBeNull()
    await fireEvent.pointerLeave(anchor)
    overflowing.add(label)
    await fireEvent.pointerEnter(anchor)
    expect(screen.getByRole('tooltip').textContent).toBe('Full label')
    await fireEvent.pointerLeave(anchor)
    overflowing.clear()
    overflowing.add(anchor)
    await fireEvent.pointerEnter(anchor)
    expect(screen.getByRole('tooltip').textContent).toBe('Full label')
  })
  it('mouse leave hides the bubble immediately, even while the anchor stays focused', async () => {
    render(h(Tooltip, { "label": "Sticky" }, () => [h("button", { "type": "button" }, ["anchor"])]))
    const anchor = screen.getByText('anchor')
    // Focused AND hovered: leaving with the mouse drops the bubble at once.
    await fireEvent.focus(anchor)
    await fireEvent.pointerEnter(anchor)
    await fireEvent.pointerLeave(anchor)
    expect(screen.queryByRole('tooltip')).toBeNull()
    // Re-entering shows it again; blurring while still hovered keeps it.
    await fireEvent.pointerEnter(anchor)
    await fireEvent.blur(anchor)
    expect(screen.getByRole('tooltip')).toBeTruthy()
    await fireEvent.pointerLeave(anchor)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
  it('forwards the anchor element to the child ref (object and callback)', async () => {
    const objectRef = shallowRef<HTMLButtonElement | null>(null)
    const callbackRef = vi.fn()
    const { rerender } = render(h(Tooltip, { "label": "Add" }, () => [h("button", { "type": "button", "ref": objectRef }, ["anchor"])]))
    expect(objectRef.value).toBe(screen.getByText('anchor'))
    // Tooltip's own positioning still works through the merged ref.
    await fireEvent.pointerEnter(screen.getByText('anchor'))
    expect(screen.getByRole('tooltip')).toBeTruthy()
    await flushVue(() => rerender(h(Tooltip, { "label": "Add" }, () => [h("button", { "type": "button", "ref": callbackRef }, ["anchor"])])))
    expect(callbackRef.mock.calls[0]?.[0]).toBe(screen.getByText('anchor'))
  })
  it('drops an already-visible bubble when disabled flips mid-hover', async () => {
    const { rerender } = render(h(Tooltip, { "label": "Rail" }, () => [h("button", { "type": "button" }, ["anchor"])]))
    await fireEvent.pointerEnter(screen.getByText('anchor'))
    expect(screen.getByRole('tooltip')).toBeTruthy()
    // e.g. clicking a rail control expands the sidebar: no mouseleave fires.
    await flushVue(() => rerender(h(Tooltip, { "label": "Rail", "disabled": true }, () => [h("button", { "type": "button" }, ["anchor"])])))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
  it('withdraws the enclosing bubble while a nested tooltip shows its own', async () => {
    render(h(Tooltip, { "label": "Open sidebar" }, () => [h("button", { "type": "button" }, ["anchor", h(Tooltip, { "label": "Update — V1.2.3" }, () => [h("span", { "data-testid": "badge" })])])]))
    const anchor = screen.getByText('anchor')
    const badge = screen.getByTestId('badge')
    await fireEvent.pointerEnter(anchor)
    expect(screen.getByRole('tooltip').textContent).toBe('Open sidebar')
    // Entering the nested anchor withdraws the enclosing bubble instead of
    // stacking both; the enclosing anchor stays hovered, so nothing is lost.
    await fireEvent.pointerEnter(badge)
    expect(screen.getAllByRole('tooltip').map(bubble => bubble.textContent)).toEqual(['Update — V1.2.3'])
    // Leaving the nested anchor for the enclosing one restores its bubble
    // the pointer never left the enclosing anchor, so only the badge is left.
    await fireEvent.pointerLeave(badge, { relatedTarget: anchor })
    expect(screen.getByRole('tooltip').textContent).toBe('Open sidebar')
    await fireEvent.pointerLeave(anchor)
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
  it('releases the enclosing bubble when a shown nested tooltip unmounts', async () => {
    const view = render(h(Tooltip, { "label": "Open sidebar" }, () => [h("button", { "type": "button" }, ["anchor", h(Tooltip, { "label": "Update" }, () => [h("span", { "data-testid": "badge" })])])]))
    await fireEvent.pointerEnter(screen.getByText('anchor'))
    await fireEvent.pointerEnter(screen.getByTestId('badge'))
    expect(screen.getAllByRole('tooltip').map(bubble => bubble.textContent)).toEqual(['Update'])
    await flushVue(() => view.rerender(h(Tooltip, { "label": "Open sidebar" }, () => [h("button", { "type": "button" }, ["anchor"])])))
    expect(screen.getByRole('tooltip').textContent).toBe('Open sidebar')
  })
})
it('keeps the anchor in its clipping container and portals only the tooltip', async () => {
  const view = render(h("div", { "style": { overflow: 'hidden', contain: 'layout' } }, [h(Tooltip, { "portal": true, "label": "Open in Music", "side": "bottom" }, () => [h("button", { "type": "button" }, ["File action"])])]))
  const anchor = screen.getByRole('button', { name: 'File action' })
  await fireEvent.pointerEnter(anchor)
  const tooltip = screen.getByRole('tooltip')
  expect(tooltip.parentElement).toBe(document.body)
  expect(view.container.contains(anchor)).toBe(true)
  expect(view.container.contains(tooltip)).toBe(false)
  view.unmount()
  expect(screen.queryByRole('tooltip')).toBeNull()
})
