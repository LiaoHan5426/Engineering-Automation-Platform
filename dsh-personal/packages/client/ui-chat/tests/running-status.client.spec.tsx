import { h } from 'vue'
// @vitest-environment jsdom
import { act, cleanup, render } from '../../../test-support/client-runtime/src/vue-test.ts'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { RunningStatus } from '../src/client/chat/RunningStatus.tsx'
import { zh } from '../src/client/locale.ts'
const t = makeTranslate(zh, commonZh)
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(5000) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
function statusHarness(startTime?: number) {
  const view = render(h(RunningStatus, { 'startTime': startTime, 'paused': false, 't': t }))
  return {
    ...view,
    content: () => view.container.querySelector('[data-chat-running] > :last-child'),
    set: async (nextStartTime?: number, paused = false) => {
      await view.rerender(h(RunningStatus, { 'startTime': nextStartTime, 'paused': paused, 't': t }))
    },
  }
}
describe('RunningStatus', () => {
  it('waits for an open Turn start before allocating its clock', async () => {
    const view = statusHarness()
    expect(view.content()?.textContent).toBe('深度求索中')
    expect(vi.getTimerCount()).toBe(0)
    await view.set(1000)
    expect(view.content()?.textContent).toMatch(/^深度求索中，用时 \d+秒 ···$/)
    expect(view.content()?.querySelectorAll('[data-shimmer="true"]')).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)
    await view.set()
    expect(view.content()?.textContent).toBe('深度求索中')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('keeps the indicator mounted while a continuous run moves to the next Turn', async () => {
    const view = statusHarness(1000)
    const content = view.content()
    const status = view.getByRole('status')
    const initialText = content?.textContent
    await act(() => { vi.advanceTimersByTime(2000) })
    expect(content?.textContent).toMatch(/^深度求索中，用时 \d+秒 ···$/)
    expect(content?.textContent).not.toBe(initialText)
    await view.set(7000)
    expect(view.content()).toBe(content)
    expect(content?.textContent).toMatch(/^深度求索中，用时 \d+秒 ···$/)
    expect(vi.getTimerCount()).toBe(1)
    const nextTurnText = content?.textContent
    await act(() => { vi.advanceTimersByTime(2000) })
    expect(content?.textContent).toMatch(/^深度求索中，用时 \d+秒 ···$/)
    expect(content?.textContent).not.toBe(nextTurnText)
    expect(view.getByRole('status')).toBe(status)
    expect(status.textContent).toBe('深度求索中')
    view.unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('keeps the duration nonnegative when the start is ahead of the local clock', async () => {
    const view = statusHarness(6000)
    expect(view.content()?.textContent).toMatch(/^深度求索中，用时 \d+秒 ···$/)
    expect(view.content()?.textContent).not.toContain('-')
    await act(() => { vi.advanceTimersByTime(3000) })
    expect(view.content()?.textContent).toMatch(/^深度求索中，用时 \d+秒 ···$/)
    expect(view.content()?.textContent).not.toContain('-')
  })
  it('freezes the duration while paused and resumes from the Turn start', async () => {
    const view = statusHarness(1000)
    expect(view.content()?.textContent).toBe('深度求索中，用时 4秒 ···')
    await view.set(1000, true)
    expect(vi.getTimerCount()).toBe(0)
    await act(() => { vi.advanceTimersByTime(5000) })
    expect(view.content()?.textContent).toBe('深度求索中，用时 4秒 ···')
    await view.set(1000)
    expect(view.content()?.textContent).toBe('深度求索中，用时 9秒 ···')
    expect(vi.getTimerCount()).toBe(1)
  })
})
