// @vitest-environment jsdom
import { h as vueH, Fragment } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, render } from '../../../test-support/client-runtime/src/vue-test.ts'
import { fireEvent, screen } from '@testing-library/dom'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { FontNotice, type FontNoticeProps } from '../src/client/office/FontNotice.tsx'
import { en, zh } from '../src/client/office/locales.ts'
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe(): void { }
    disconnect(): void { }
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
function props(overrides: Partial<FontNoticeProps> = {}): FontNoticeProps {
  return {
    fonts: ['Consolas', 'Missing Serif'],
    t: makeTranslate(en), ...overrides,
  }
}
it('opens details, restores focus on Escape or close, and dismisses outside without stealing focus', async () => {
  render(vueH(FontNotice, {
    ...props(),
  }))
  const more = screen.getByRole('button', { name: makeTranslate(en)('viewMissingFonts', { count: 2 }) })
  await act(() => fireEvent.click(more))
  const dialog = screen.getByRole('dialog', { name: en.missingFontsTitle })
  expect(dialog.textContent).toContain('Consolas')
  expect(dialog.textContent).toContain('Missing Serif')
  expect(document.activeElement).toBe(dialog)
  await act(() => fireEvent.keyDown(dialog, { key: 'ArrowDown' }))
  expect(screen.getByRole('dialog')).toBe(dialog)
  await act(() => fireEvent.keyDown(dialog, { key: 'Escape' }))
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(document.activeElement).toBe(more)
  await act(() => fireEvent.click(more))
  await act(() => fireEvent.click(screen.getByRole('button', { name: en.closeDetails })))
  expect(screen.getByRole('button', { name: makeTranslate(en)('viewMissingFonts', { count: 2 }) })).toBe(more)
  expect(screen.queryByRole('status')).toBeNull()
  expect(document.activeElement).toBe(more)
  await act(() => fireEvent.click(more))
  await act(() => fireEvent.pointerDown(document.body))
  expect(screen.queryByRole('dialog')).toBeNull()
  await act(() => fireEvent.click(more))
  await act(() => fireEvent.click(more))
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('keeps details open while focus moves inside them and closes when focus leaves the notice', async () => {
  render(vueH(Fragment, {}, [
    vueH(FontNotice, {
      ...props(),
    }),
    vueH('button', {}, [
      'Other action',
    ]),
  ]))
  const more = screen.getByRole('button', { name: makeTranslate(en)('viewMissingFonts', { count: 2 }) })
  await act(() => fireEvent.click(more))
  const dialog = screen.getByRole('dialog')
  await act(() => fireEvent.focusOut(dialog, { relatedTarget: screen.getByRole('button', { name: en.closeDetails }) }))
  expect(screen.getByRole('dialog')).toBe(dialog)
  await act(() => fireEvent.focusOut(dialog, { relatedTarget: more }))
  expect(screen.getByRole('dialog')).toBe(dialog)
  await act(() => fireEvent.focusOut(dialog, { relatedTarget: screen.getByRole('button', { name: 'Other action' }) }))
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('shows a warning without automatically opening details or remembering that they were viewed', async () => {
  const view = render(vueH(FontNotice, {
    ...props(),
  }))
  const warning = screen.getByRole('button')
  expect(warning.getAttribute('aria-expanded')).toBe('false')
  expect(screen.queryByRole('dialog')).toBeNull()
  await act(() => fireEvent.click(warning))
  await act(() => fireEvent.click(screen.getByRole('button', { name: en.closeDetails })))
  expect(screen.getByRole('button', { name: makeTranslate(en)('viewMissingFonts', { count: 2 }) })).toBe(warning)
  view.unmount()
  render(vueH(FontNotice, {
    ...props(),
  }))
  expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false')
  expect(screen.queryByRole('dialog')).toBeNull()
})
it('has localized copy and does not reserve a notice for fonts that are available', async () => {
  const view = render(vueH(FontNotice, {
    ...props({ t: makeTranslate(zh) }),
  }))
  await act(() => fireEvent.click(screen.getByRole('button', { name: makeTranslate(zh)('viewMissingFonts', { count: 2 }) })))
  expect(screen.getByRole('dialog', { name: zh.missingFontsTitle })).toBeDefined()
  await view.rerender(vueH(FontNotice, {
    ...props({ fonts: [] }),
  }))
  expect(view.container.childElementCount).toBe(0)
  expect(screen.queryByRole('dialog')).toBeNull()
})
