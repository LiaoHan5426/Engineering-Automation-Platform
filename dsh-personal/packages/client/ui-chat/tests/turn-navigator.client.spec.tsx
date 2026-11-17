// @vitest-environment jsdom
import { defineComponent, shallowRef } from 'vue'
import { fireEvent, within } from '@testing-library/dom'
import { h } from 'vue'
import { cleanupVue as cleanup, flushVue as act, renderVue } from '../../ui-primitives/tests/vue-render.ts'
import { within as queriesWithin } from '@testing-library/dom'
import { nextTick } from 'vue'
function render(node: Parameters<typeof renderVue>[0]) { const view = renderVue(node); return { ...view, ...queriesWithin(document.body) } }
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { TurnNavigator, type TurnNavigatorHandle } from '../src/client/chat/TurnNavigator.tsx'
import type { TurnRailItem } from '../src/client/chat/turn-rail-items.ts'
import { zh } from '../src/client/locale.ts'
import { installTurnNavigatorObserver } from './turn-navigator-fixture.ts'
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const items: readonly TurnRailItem[] = Array.from({ length: 1000 }, (_, index) => ({
  turn: index + 1,
  prompt: `prompt ${String(index + 1)}`,
  response: '',
  anchor: { kind: 'loaded', key: `turn:${String(index + 1)}` },
}))
const t = makeTranslate(zh, commonZh)
describe('TurnNavigator', () => {
  it('places the latest committed active turn on its first viewport size without scroll commands', async () => {
    const observer = installTurnNavigatorObserver(null)
    const onNavigate = vi.fn()
    const view = render(h(TurnNavigatorHarness, {
      'items': items,
      'activeTurn': 1,
      'busyTurn': null,
      'onNavigate': onNavigate,
      't': t,
    }))
    await act(() => {})
    const nav = view.getByRole('navigation')
    const scroller = nav.firstElementChild as HTMLElement
    const scrollTo = vi.spyOn(scroller, 'scrollTo')
    const rect = vi.spyOn(scroller, 'getBoundingClientRect').mockImplementation(() => { throw new Error('synchronous rect read') })
    Object.defineProperty(scroller, 'scrollHeight', { get: () => { throw new Error('scroll extent read') } })
    Object.defineProperty(scroller, 'clientHeight', { get: () => { throw new Error('viewport height read') } })
    await act(() => { view.rerender(h(TurnNavigatorHarness, {
      'items': items,
      'activeTurn': 1000,
      'busyTurn': null,
      'onNavigate': onNavigate,
      't': t,
    })) })
    await act(() => { observer.resize(300) })
    expect(scroller.scrollTop).toBe(9702)
    expect(scrollTo).not.toHaveBeenCalled()
    expect(rect).not.toHaveBeenCalled()
    expect(within(nav).getAllByRole('button').length).toBeLessThan(40)
    expect(view.getByRole('button', { name: '跳转到第 1000 轮' }).getAttribute('aria-current')).toBe('true')
    expect(view.queryByRole('button', { name: '跳转到第 1 轮' })).toBeNull()
  })
  it('exposes separate activation and fixed-height scrolling controls without querying the scroll extent', async () => {
    installTurnNavigatorObserver()
    const ref = shallowRef<TurnNavigatorHandle | null>(null)
    const onNavigate = vi.fn()
    const view = render(h(TurnNavigatorHarness, {
      'controls': ref,
      'items': items,
      'activeTurn': 1,
      'busyTurn': null,
      'onNavigate': onNavigate,
      't': t,
    }))
    await view.findByRole('button', { name: '跳转到第 1 轮' })
    const scroller = view.getByRole('navigation').firstElementChild as HTMLElement
    Object.defineProperty(scroller, 'scrollHeight', { get: () => { throw new Error('scroll extent read') } })
    Object.defineProperty(scroller, 'clientHeight', { get: () => { throw new Error('viewport height read') } })
    await act(async () => { ref.value?.scrollToTurn(500) })
    expect(scroller.scrollTop).toBe(4846)
    expect(view.getByRole('button', { name: '跳转到第 500 轮' })).toBeTruthy()
    expect(onNavigate).not.toHaveBeenCalled()
    await act(() => { ref.value?.activateTurn(700) })
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith(items[699])
    expect(scroller.scrollTop).toBe(4846)
  })
  it('keeps keyboard focus mounted while scrolling to another virtual range', async () => {
    installTurnNavigatorObserver()
    const ref = shallowRef<TurnNavigatorHandle | null>(null)
    const view = render(h(TurnNavigatorHarness, {
      controls: ref, items, activeTurn: 1, busyTurn: null, onNavigate: vi.fn(), t,
    }))
    const first = await view.findByRole('button', { name: '跳转到第 1 轮' })
    await act(() => { first.focus() })
    await act(async () => { ref.value?.scrollToTurn(900) })
    expect(document.activeElement).toBe(first)
    expect(first.isConnected).toBe(true)
    expect(view.getByRole('button', { name: '跳转到第 900 轮' })).toBeTruthy()
    {
      fireEvent.pointerMove(view.getByRole('button', { name: '跳转到第 900 轮' }))
      await nextTick()
    }
    expect(view.getByRole('tooltip').textContent).toBe('prompt 900')
    await act(() => { first.blur() })
    expect(first.isConnected).toBe(false)
  })
  it('keeps active marks inside the safe band still and centers only after crossing either edge', async () => {
    installTurnNavigatorObserver(288)
    const props = { items, activeTurn: 50, busyTurn: null, onNavigate: vi.fn(), t }
    const view = render(h(TurnNavigatorHarness, {
      ...props,
    }))
    await view.findByRole('button', { name: '跳转到第 50 轮' })
    const scroller = view.getByRole('navigation').firstElementChild as HTMLElement
    const scrollTo = vi.spyOn(scroller, 'scrollTo')
    Object.defineProperty(scroller, 'scrollHeight', { get: () => { throw new Error('scroll extent read') } })
    Object.defineProperty(scroller, 'clientHeight', { get: () => { throw new Error('viewport height read') } })
    vi.spyOn(scroller, 'getBoundingClientRect').mockImplementation(() => { throw new Error('synchronous rect read') })
    expect(scroller.scrollTop).toBe(352)
    for (const activeTurn of [38, 62]) {
      await act(async () => { await act(() => { view.rerender(h(TurnNavigatorHarness, {
        ...props,
        'activeTurn': activeTurn,
      })) }) })
      expect(scroller.scrollTop).toBe(352)
    }
    expect(scrollTo).not.toHaveBeenCalled()
    await act(async () => { await act(() => { view.rerender(h(TurnNavigatorHarness, {
      ...props,
      'activeTurn': 63,
    })) }) })
    expect(scroller.scrollTop).toBe(482)
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 482 }))
    scrollTo.mockClear()
    await act(async () => { await act(() => { view.rerender(h(TurnNavigatorHarness, {
      ...props,
      'activeTurn': 51,
    })) }) })
    expect(scroller.scrollTop).toBe(482)
    expect(scrollTo).not.toHaveBeenCalled()
    await act(async () => { await act(() => { view.rerender(h(TurnNavigatorHarness, {
      ...props,
      'activeTurn': 50,
    })) }) })
    expect(scroller.scrollTop).toBe(352)
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ top: 352 }))
  })
  it('does not let scroll-induced pointer entry replace a hover or focused preview', async () => {
    installTurnNavigatorObserver()
    const view = render(h(TurnNavigatorHarness, {
      'items': items,
      'activeTurn': 1,
      'busyTurn': null,
      'onNavigate': vi.fn(),
      't': t,
    }))
    const twentieth = await view.findByRole('button', { name: '跳转到第 20 轮' })
    await act(() => {})
    const nav = view.getByRole('navigation')
    const scroller = nav.firstElementChild as HTMLElement
    vi.spyOn(scroller, 'getBoundingClientRect').mockImplementation(() => { throw new Error('synchronous rect read') })
    {
      fireEvent.pointerEnter(nav)
      await nextTick()
    }
    {
      fireEvent.pointerEnter(twentieth)
      await nextTick()
    }
    {
      fireEvent.pointerMove(twentieth)
      await nextTick()
    }
    expect(view.getByRole('tooltip').textContent).toBe('prompt 20')
    scroller.scrollTop = 100
    {
      fireEvent.scroll(scroller)
      await nextTick()
    }
    {
      fireEvent.pointerEnter(view.getByRole('button', { name: '跳转到第 30 轮' }))
      await nextTick()
    }
    expect(view.getByRole('tooltip').textContent).toBe('prompt 20')
    const focused = view.getByRole('button', { name: '跳转到第 21 轮' })
    await act(() => { focused.focus() })
    const previewId = view.getByRole('tooltip').id
    scroller.scrollTop = 600
    {
      fireEvent.scroll(scroller)
      await nextTick()
    }
    const underPointer = view.getByRole('button', { name: '跳转到第 70 轮' })
    {
      fireEvent.pointerEnter(underPointer)
      await nextTick()
    }
    expect(document.activeElement).toBe(focused)
    expect(view.getByRole('tooltip').textContent).toBe('prompt 21')
    expect(focused.getAttribute('aria-describedby')).toBe(previewId)
    {
      fireEvent.pointerMove(underPointer)
      await nextTick()
    }
    expect(view.getByRole('tooltip').textContent).toBe('prompt 70')
    expect(underPointer.getAttribute('aria-describedby')).toBe(previewId)
  })
})

const TurnNavigatorHarness = defineComponent((props: InstanceType<typeof TurnNavigator>['$props'] & { controls?: import('vue').ShallowRef<TurnNavigatorHandle | null> }) => () => { const { controls, ...input } = props; return h(TurnNavigator, { ...input, ...(controls === undefined ? {} : { ref: controls }) }) }, { props: ['controls','items','activeTurn','busyTurn','onNavigate','t'] })
