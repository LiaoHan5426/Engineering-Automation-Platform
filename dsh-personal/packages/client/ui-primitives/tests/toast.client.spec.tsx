// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import { fireEvent, screen } from '@testing-library/dom'
import { cleanupVue as cleanup, renderVue as render } from './vue-render.ts'
import { Toast } from '../src/Toast.tsx'

afterEach(cleanup)

describe('Toast', () => {
  it('announces its text and reports done after the hold-and-fade lifetime', () => {
    vi.useFakeTimers()
    try {
      const onDone = vi.fn()
      render(h(Toast, { text: '最多添加 50 张图片', icon: h('svg', { 'data-testid': 'icon' }), onDone }))
      const banner = screen.getByRole('alert')
      expect(banner.textContent).toContain('最多添加 50 张图片')
      expect(screen.getByTestId('icon')).toBeTruthy()
      vi.advanceTimersByTime(3999)
      expect(onDone).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(onDone).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('holds for the owner\'s window and hands the stylesheet the same value', () => {
    vi.useFakeTimers()
    try {
      const onDone = vi.fn()
      render(h(Toast, { text: '切换失败', holdMs: 6000, onDone }))
      // One value drives both, so a banner can never unmount mid-fade: the
      // timer waits the hold plus the fade, and the stylesheet delays the
      // fade by the same hold.
      expect(screen.getByRole('alert').style.getPropertyValue('--dsh-toast-hold')).toBe('6000ms')
      vi.advanceTimersByTime(6999)
      expect(onDone).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(onDone).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps its original expiry across rerenders and calls the latest completion handler', () => {
    vi.useFakeTimers()
    try {
      const first = vi.fn()
      const latest = vi.fn()
      const view = render(h(Toast, { text: 'archived', onDone: first }))
      vi.advanceTimersByTime(1000)
      view.rerender(h(Toast, { text: 'archived', onDone: latest }))
      vi.advanceTimersByTime(2999)
      expect(first).not.toHaveBeenCalled()
      expect(latest).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1)
      expect(first).not.toHaveBeenCalled()
      expect(latest).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('centers over its anchor and re-measures on window resize', async () => {
    vi.useFakeTimers()
    try {
      const anchor = document.createElement('div')
      document.body.appendChild(anchor)
      anchor.getBoundingClientRect = () => ({ left: 100, width: 400 }) as DOMRect
      render(h(Toast, { text: 'anchored', anchor, onDone: vi.fn() }))
      expect(screen.getByRole('alert').style.left).toBe('300px')
      anchor.getBoundingClientRect = () => ({ left: 200, width: 400 }) as DOMRect
      fireEvent(window, new Event('resize')); await nextTick()
      expect(screen.getByRole('alert').style.left).toBe('400px')
      anchor.remove()
    } finally {
      vi.useRealTimers()
    }
  })

  it('flows prefixed actions inline as one sentence and hands each press to the owner', () => {
    vi.useFakeTimers()
    try {
      const undo = vi.fn()
      const filter = vi.fn()
      render(
        h(Toast, { text: '会话已归档，可', tone: 'success', actions: [
          { label: '撤销', onClick: undo }, { prefix: '或', label: '筛选已归档会话', onClick: filter },
        ], onDone: vi.fn() }),
      )
      // The success tone brings the circled green check itself; no icon prop.
      const glyph = screen.getByRole('alert').querySelector('[aria-hidden]')
      expect(glyph?.className).toContain('success')
      expect(glyph?.querySelector('svg')).toBeTruthy()
      expect(screen.getByRole('alert').textContent).toBe('会话已归档，可撤销或筛选已归档会话')
      fireEvent.click(screen.getByRole('button', { name: '撤销' }))
      expect(undo).toHaveBeenCalledTimes(1)
      fireEvent.click(screen.getByRole('button', { name: '筛选已归档会话' }))
      expect(filter).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('restarts the lifetime only when the owner changes the hold window', async () => {
    vi.useFakeTimers()
    try {
      const onDone = vi.fn()
      const view = render(h(Toast, { text: 'Saved', holdMs: 3000, onDone }))
      vi.advanceTimersByTime(2000)
      view.rerender(h(Toast, { text: 'Saved', holdMs: 6000, onDone })); await nextTick()
      vi.advanceTimersByTime(6999); expect(onDone).not.toHaveBeenCalled()
      vi.advanceTimersByTime(1); expect(onDone).toHaveBeenCalledOnce()
    } finally { vi.useRealTimers() }
  })

  it('releases anchor measurement on replacement, omission and disposal', async () => {
    const first = document.createElement('div'), next = document.createElement('div')
    const firstRect = vi.spyOn(first, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 0, 400, 30))
    const nextRect = vi.spyOn(next, 'getBoundingClientRect').mockReturnValue(new DOMRect(200, 0, 400, 30))
    const view = render(h(Toast, { text: 'Saved', anchor: first, onDone: vi.fn() }))
    expect(screen.getByRole('alert').style.left).toBe('300px')
    view.rerender(h(Toast, { text: 'Saved', anchor: next, onDone: vi.fn() })); await nextTick()
    expect(screen.getByRole('alert').style.left).toBe('400px')
    firstRect.mockClear(); nextRect.mockClear(); fireEvent(window, new Event('resize')); await nextTick()
    expect(firstRect).not.toHaveBeenCalled(); expect(nextRect).toHaveBeenCalledOnce()
    view.rerender(h(Toast, { text: 'Saved', onDone: vi.fn() })); await nextTick()
    expect(screen.getByRole('alert').style.left).toBe('')
    view.unmount(); nextRect.mockClear(); fireEvent(window, new Event('resize'))
    expect(nextRect).not.toHaveBeenCalled()
  })

  it('renders without an icon and cancels its timer on unmount', () => {
    vi.useFakeTimers()
    try {
      const onDone = vi.fn()
      const view = render(h(Toast, { text: 'plain', onDone }))
      expect(screen.getByRole('alert').querySelector('[aria-hidden]')).toBeNull()
      view.unmount()
      vi.advanceTimersByTime(10_000)
      expect(onDone).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
