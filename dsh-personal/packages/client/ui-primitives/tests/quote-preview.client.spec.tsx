// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from '@testing-library/dom'
import { h } from 'vue'
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from './vue-render.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { QuotePreview } from '../src/QuotePreview.tsx'
import { POINTER_GRACE_MS } from '../src/pointer-grace.ts'
afterEach(cleanup)
describe('QuotePreview', async () => {
  it('measures clipping without a ResizeObserver implementation', async () => {
    vi.stubGlobal('ResizeObserver', undefined)
    try {
      const view = render(h(QuotePreview, { 'text': 'static excerpt' }, undefined))
      await act(() => {})
      await act(() => {})
      expect(view.container.querySelector('[data-quote-preview-text]')?.textContent).toBe('static excerpt')
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
  it('renders the 16-pixel quote mark with its inherited fill color', async () => {
    const { container } = render(h(QuotePreview, { 'text': 'icon text' }, undefined))
    await act(() => {})
    const icon = container.querySelector('svg')
    expect(icon?.getAttribute('viewBox')).toBe('0 0 16 16')
    expect(icon?.getAttribute('width')).toBe('16')
    expect(icon?.getAttribute('height')).toBe('16')
    const paths = [...container.querySelectorAll('svg path')]
    expect(paths).toHaveLength(2)
    expect(paths.map(path => path.getAttribute('stroke'))).toEqual([null, null])
    expect(paths.map(path => path.getAttribute('fill'))).toEqual(['currentColor', 'currentColor'])
  })
  it('renders the same inert preview without a removal action', async () => {
    render(h(QuotePreview, { 'text': 'selected text' }, undefined))
    await act(() => {})
    const quote = screen.getByText('selected text').closest<HTMLElement>('[data-quote-preview]')!
    expect(quote.getAttribute('data-quote-preview')).toBe('')
    expect(quote.getAttribute('role')).toBeNull()
    expect(quote.getAttribute('tabindex')).toBeNull()
    expect(quote.getAttribute('title')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
    await act(() => { fireEvent.pointerEnter(quote.parentElement!) })
    await act(() => { fireEvent.focus(quote) })
    expect(document.querySelector('[data-quote-popover]')).toBeNull()
  })
  it('uses the shared hover card only while the excerpt is clipped', async () => {
    const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(200)
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100)
    try {
      render(h(QuotePreview, { 'text': 'a complete clipped excerpt' }, undefined))
      await act(() => {})
      const quote = screen.getByText('a complete clipped excerpt').closest<HTMLElement>('[data-quote-preview]')!
      await act(() => { fireEvent.pointerEnter(quote.parentElement!) })
      await waitFor(async () => { expect(document.querySelector('[data-quote-popover]')?.textContent).toBe('a complete clipped excerpt') })
    }
    finally {
      scrollWidth.mockRestore()
      clientWidth.mockRestore()
    }
  })
  it('remeasures clipping and disconnects its resize observers', async () => {
    let clipped = true
    const observers: {
      callback: ResizeObserverCallback
      observe: ReturnType<typeof vi.fn>
      disconnect: ReturnType<typeof vi.fn>
    }[] = []
    vi.stubGlobal('ResizeObserver', class {
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(callback: ResizeObserverCallback) { observers.push({ callback, observe: this.observe, disconnect: this.disconnect }) }
    })
    const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get')
      .mockImplementation(() => clipped ? 200 : 100)
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100)
    try {
      const { unmount } = render(h(QuotePreview, { 'text': 'resized excerpt' }, undefined))
      await act(() => {})
      await act(() => {})
      const quote = screen.getByText('resized excerpt').closest<HTMLElement>('[data-quote-preview]')!
      await act(() => { fireEvent.pointerEnter(quote.parentElement!) })
      await waitFor(async () => { expect(document.querySelector('[data-quote-popover]')).not.toBeNull() })
      const source = quote.querySelector('[data-quote-preview-text]')!
      const measure = observers.find(observer => observer.observe.mock.calls.some(([target]) => target === source))!
      clipped = false
      await act(async () => { measure.callback([], {} as ResizeObserver) })
      expect(document.querySelector('[data-quote-popover]')).toBeNull()
      unmount()
      expect(observers.every(observer => observer.disconnect.mock.calls.length > 0)).toBe(true)
    }
    finally {
      scrollWidth.mockRestore()
      clientWidth.mockRestore()
      vi.unstubAllGlobals()
    }
  })
  it('keeps the clipped popover open while the pointer moves onto it', async () => {
    vi.useFakeTimers()
    const scrollWidth = vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockReturnValue(200)
    const clientWidth = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(100)
    try {
      render(h(QuotePreview, { 'text': 'a hoverable clipped excerpt' }, undefined))
      await act(() => {})
      const quote = screen.getByText('a hoverable clipped excerpt').closest<HTMLElement>('[data-quote-preview]')!
      await act(() => { fireEvent.pointerEnter(quote.parentElement!) })
      await act(async () => { vi.advanceTimersByTime(0) })
      const popover = document.querySelector<HTMLElement>('[data-quote-popover]')!.parentElement!.parentElement!
      const hoverRegion = quote.parentElement!
      await act(() => { fireEvent.pointerLeave(hoverRegion) })
      await act(async () => { vi.advanceTimersByTime(POINTER_GRACE_MS - 1) })
      await act(() => { fireEvent.pointerEnter(popover) })
      await act(async () => { vi.advanceTimersByTime(POINTER_GRACE_MS * 2) })
      expect(document.querySelector('[data-quote-popover]')).not.toBeNull()
      await act(() => { fireEvent.pointerLeave(popover) })
      await act(async () => { vi.advanceTimersByTime(POINTER_GRACE_MS) })
      expect(document.querySelector('[data-quote-popover]')).toBeNull()
    }
    finally {
      scrollWidth.mockRestore()
      clientWidth.mockRestore()
      vi.useRealTimers()
    }
  })
  it('shows an owner summary inline and in a popover that opens without clipping', async () => {
    const text = '## User Comment 1\nFile: src/index.ts\nComment:\nrename this'
    const view = render(h(QuotePreview, { 'text': text, 'summary': { label: 'index.ts L78', title: 'src/index.ts', detail: 'L78', body: 'rename this' } }, undefined))
    await act(() => {})
    await act(() => {})
    const quote = view.container.querySelector<HTMLElement>('[data-quote-preview]')!
    const inline = quote.querySelector('[data-quote-preview-text]')!
    expect([...inline.children].map(part => [part.textContent, part.getAttribute('aria-hidden')]))
      .toEqual([['index.ts L78', 'true'], ['src/index.ts L78', null], ['rename this', null]])
    expect(screen.queryByText(text)).toBeNull()
    await act(() => { fireEvent.pointerEnter(quote.parentElement!) })
    await waitFor(async () => {
      expect([...document.querySelector('[data-quote-popover]')!.children].map(line => line.textContent))
        .toEqual(['src/index.ts', 'L78', 'rename this'])
    })
    view.unmount()
    render(h(QuotePreview, { 'text': text, 'summary': { label: 'index.ts', title: 'src/index.ts', body: 'rename this' } }, undefined))
    await act(() => {})
    expect(document.querySelector('[data-quote-preview-text]')?.children[1]?.textContent).toBe('src/index.ts')
    await act(() => { fireEvent.pointerEnter(document.querySelector<HTMLElement>('[data-quote-preview]')!.parentElement!) })
    await waitFor(async () => {
      expect([...document.querySelector('[data-quote-popover]')!.children].map(line => line.textContent)).toEqual(['src/index.ts', 'rename this'])
    })
  })
  it('contains keyboard and pointer removal events inside the editable preview', async () => {
    const onRemove = vi.fn()
    const onPointerDown = vi.fn()
    const onKeyDown = vi.fn()
    render(h('div', { 'onPointerdown': onPointerDown, 'onKeydown': onKeyDown }, [h(QuotePreview, { 'text': 'selected text', 'removal': { label: 'Remove quote', onRemove } }, undefined)]))
    const button = screen.getByRole('button', { name: 'Remove quote' })
    await act(() => { fireEvent.pointerDown(button) })
    await act(() => { fireEvent.keyDown(button, { key: 'Enter' }) })
    await act(() => { fireEvent.click(button) })
    expect(onPointerDown).not.toHaveBeenCalled()
    expect(onKeyDown).not.toHaveBeenCalled()
    expect(onRemove).toHaveBeenCalledTimes(1)
  })
})
