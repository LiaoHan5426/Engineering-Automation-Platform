// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, within } from '@testing-library/dom'
import { cleanupVue as cleanup, flushVue as act, renderVue } from '../../ui-primitives/tests/vue-render.ts'
import { h, computed, shallowRef, unref, type Ref } from 'vue'
function render(node: Parameters<typeof renderVue>[0]) { const view = renderVue(node); return { ...view, ...within(document.body) } }
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { en as commonEn, zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/index.ts'
import { ContextMeter, type ContextMeterProps } from '../src/client/skeleton/ContextMeter.tsx'
import { contextOccupancy } from '../src/client/context-occupancy.ts'
import css from '../src/client/skeleton/ContextMeter.module.css'
import { en, zh } from '../src/client/locales.ts'
afterEach(cleanup)
const t = makeTranslate(zh, commonZh) as ContextMeterProps['t']
const tEn = makeTranslate(en, commonEn) as ContextMeterProps['t']
const BREAKDOWN = { systemTokens: 120, toolsTokens: 21500, messageTokens: 477000 }
const segmentClass = css.segment
if (segmentClass === undefined)
  throw new Error('segment class missing from ContextMeter.module.css')
function projections(values: Record<string, unknown> | Ref<Record<string, unknown>>): ContextMeterProps['useProjection'] {
  return ((key: string | Ref<string | undefined>, select: (snapshot: unknown) => unknown = value => value) => computed(() => {
    const name = unref(key); const value = name === undefined ? undefined : unref(values)[name]
    return value === undefined ? undefined : select(value)
  }))
}
function meter(values: Record<string, unknown>, translate: ContextMeterProps['t'] = t) {
  return render(h(ContextMeter, {
    'useProjection': projections(values),
    't': translate,
  }))
}
describe('ContextMeter', () => {
  it('computes occupancy only when both a numerator and capacity are known', () => {
    expect(contextOccupancy({ pressureTokens: 32000, projectedTokens: 6000, contextWindow: 128000 }))
      .toEqual({ percent: 5, usedTokens: 6000, contextWindow: 128000 })
    expect(contextOccupancy({ pressureTokens: 32000, contextWindow: 128000 }))
      .toEqual({ percent: 25, usedTokens: 32000, contextWindow: 128000 })
    expect(contextOccupancy({ pressureTokens: 32000 })).toBeNull()
    expect(contextOccupancy({ contextWindow: 128000 })).toBeNull()
    expect(contextOccupancy(undefined)).toBeNull()
    expect(contextOccupancy({ pressureTokens: 300000, contextWindow: 128000 })?.percent).toBe(100)
  })
  it('renders nothing until both pressure and capacity are known', () => {
    expect(meter({}).container.textContent).toBe('')
    expect(meter({ contextPressure: { pressureTokens: 32000 } }).container.textContent).toBe('')
    expect(meter({ contextPressure: { contextWindow: 128000 } }).container.textContent).toBe('')
  })
  it('shows the occupancy ring and opens the breakdown panel on click', async () => {
    const view = meter({
      contextPressure: { pressureTokens: 32000, contextWindow: 128000 },
      contextBreakdown: BREAKDOWN,
    })
    const trigger = view.getByRole('button', { name: '上下文已用 25%' })
    expect(view.queryByRole('dialog')).toBeNull()
    await act(() => { fireEvent.click(trigger) })
    const panel = view.queryByRole('dialog')!
    expect(panel.textContent).toContain('~32K / 128K')
    expect(panel.textContent).toContain('25%')
    expect(panel.textContent).toContain('上下文已用')
    expect(panel.textContent).toContain('系统提示词~120')
    expect(panel.textContent).toContain('工具定义~21.5K')
    expect(panel.textContent).toContain('对话消息~477K')
    // The occupancy bar splits into one colored segment per composition row.
    expect(panel.getElementsByClassName(segmentClass)).toHaveLength(3)
    // Clicking the trigger again toggles the panel shut.
    await act(() => { fireEvent.click(trigger) })
    expect(view.queryByRole('dialog')).toBeNull()
  })
  it('renders its reading tooltip outside the composer subtree', async () => {
    vi.useFakeTimers()
    try {
      const view = meter({ contextPressure: { pressureTokens: 32000, contextWindow: 128000 } })
      await act(() => { fireEvent.pointerEnter(view.getByRole('button', { name: '上下文已用 25%' })) })
      await act(() => { vi.advanceTimersByTime(200) })
      const tooltip = view.getByRole('tooltip')
      expect(view.container.contains(tooltip)).toBe(false)
      expect(document.body.contains(tooltip)).toBe(true)
    }
    finally {
      vi.useRealTimers()
    }
  })
  it('lets each locale own the headline word order around the reading', async () => {
    const values = {
      contextPressure: { pressureTokens: 32000, contextWindow: 128000 },
      contextBreakdown: BREAKDOWN,
    }
    const zhView = meter(values)
    await act(() => { fireEvent.click(zhView.getByRole('button', { name: '上下文已用 25%' })) })
    // The reading follows the label in Chinese and leads it in English; both
    // headers read as one sentence rather than a concatenated fragment.
    expect(zhView.queryByRole('dialog')!.textContent)
      .toMatch(/^上下文已用25%/)
    const enView = meter(values, tEn)
    await act(() => { fireEvent.click(enView.getByRole('button', { name: '25% of context used' })) })
    expect(enView.queryByRole('dialog', { name: 'of context used' })!.textContent)
      .toMatch(/^25%of context used/)
  })
  it('draws no bar segment at zero occupancy', async () => {
    const view = meter({
      contextPressure: { pressureTokens: 0, contextWindow: 128000 },
      contextBreakdown: BREAKDOWN,
    })
    await act(() => { fireEvent.click(view.getByRole('button', { name: '上下文已用 0%' })) })
    const panel = view.queryByRole('dialog')!
    // `.segment` carries a min-width, so a zero-width part would still paint a
    // filled sliver over an empty context.
    expect(panel.getElementsByClassName(segmentClass)).toHaveLength(0)
    expect(panel.textContent).toContain('~0 / 128K')
  })
  it('reads the ring from the projected figure so a compaction shows at once', async () => {
    // Same provider sample, a surface a compaction just shrank: the ring must
    // follow the projection rather than the sample it is anchored to.
    const view = meter({
      contextPressure: { pressureTokens: 32000, projectedTokens: 3000, contextWindow: 128000 },
      contextBreakdown: BREAKDOWN,
    })
    const trigger = view.getByRole('button', { name: '上下文已用 2%' })
    await act(() => { fireEvent.click(trigger) })
    expect(view.queryByRole('dialog')!.textContent).toContain('~3K / 128K')
  })
  it('omits the composition rows while the contextBreakdown projection is absent', async () => {
    const view = meter({ contextPressure: { pressureTokens: 32000, contextWindow: 128000 } })
    await act(() => { fireEvent.click(view.getByRole('button', { name: '上下文已用 25%' })) })
    const panel = view.queryByRole('dialog')!
    expect(panel.textContent).toContain('~32K / 128K')
    expect(panel.textContent).not.toContain('系统提示词')
    expect(panel.textContent).not.toContain('对话消息')
    // Without composition shares, the bar falls back to one plain segment.
    expect(panel.getElementsByClassName(segmentClass)).toHaveLength(1)
  })
  it('closes when capacity disappears and stays closed when it returns', async () => {
    const values = shallowRef<Record<string, unknown>>({
      contextPressure: { pressureTokens: 32000, contextWindow: 128000 },
      contextBreakdown: BREAKDOWN,
    })
    const view = render(h(ContextMeter, {
      'useProjection': projections(values),
      't': t,
    }))
    await act(() => { fireEvent.click(view.getByRole('button', { name: '上下文已用 25%' })) })
    expect(view.queryByRole('dialog')).not.toBeNull()
    values.value = { contextPressure: { pressureTokens: 32000 }, contextBreakdown: BREAKDOWN }
    await act(() => { view.rerender(h(ContextMeter, {
      'useProjection': projections(values),
      't': t,
    })) })
    expect(view.container.textContent).toBe('')
    values.value = {
      contextPressure: { pressureTokens: 32000, contextWindow: 128000 },
      contextBreakdown: BREAKDOWN,
    }
    await act(() => { view.rerender(h(ContextMeter, {
      'useProjection': projections(values),
      't': t,
    })) })
    expect(view.getByRole('button', { name: '上下文已用 25%' }).getAttribute('aria-expanded')).toBe('false')
    expect(view.queryByRole('dialog')).toBeNull()
  })
  it('closes on outside pointerdown and Escape — but not inside clicks', async () => {
    const view = meter({
      contextPressure: { pressureTokens: 32000, contextWindow: 128000 },
      contextBreakdown: BREAKDOWN,
    })
    const trigger = view.getByRole('button', { name: '上下文已用 25%' })
    const openPanel = async () => {
      await act(() => { fireEvent.click(trigger) })
      return view.queryByRole('dialog')!
    }
    // A pointerdown inside the panel keeps it open; outside closes it.
    const again = await openPanel()
    await act(() => { fireEvent.pointerDown(again) })
    expect(view.queryByRole('dialog')).not.toBeNull()
    await act(() => { fireEvent.pointerDown(document.body) })
    expect(view.queryByRole('dialog')).toBeNull()
    // Escape.
    await openPanel()
    await act(() => { fireEvent.keyDown(document, { key: 'Escape' }) })
    expect(view.queryByRole('dialog')).toBeNull()
  })
})
