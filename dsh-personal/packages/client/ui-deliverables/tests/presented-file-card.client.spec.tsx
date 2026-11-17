// @vitest-environment jsdom
/** Explicit file actions preserve their destination, availability, and independent failure state. */
import { fireEvent } from '@testing-library/dom'
import { h } from 'vue'
import { cleanup, act, render } from '../../../test-support/client-runtime/src/vue-test.ts'
import { nextTick } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { contextMenuHook, makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { PresentedFileCard } from '../src/client/PresentedFileCard.tsx'
import { en, zh } from '../src/client/locales.ts'
afterEach(cleanup)
const props = () => {
  const onMenu = vi.fn()
  return {
    cwd: undefined,
    file: { path: 'out/report.pdf', description: 'Final report', seq: 4, index: 1 },
    host: { name: 'remote-desktop', available: true, fileManager: 'finder' as const },
    phase: undefined,
    onPreview: vi.fn(),
    onMenu,
    contextMenuProps: contextMenuHook((_target, point) => {
      onMenu(point)
    })().getTriggerProps({ kind: 'image', value: { url: 'unused' } }),
    actions: h(
      'button',
      {
        type: 'button',
      },
      ['Native file action'],
    ),
    t: makeTranslate(en),
  }
}
it('localizes reveal failures and restores the description when progress clears', async () => {
  const p = props()
  const view = render(
    h(PresentedFileCard, {
      ...p,
      phase: 'revealError',
      t: makeTranslate(zh),
    }),
  )
  expect(view.getByText(zh['presented.revealError'])).toBeTruthy()
  await act(() =>
    view.rerender(
      h(PresentedFileCard, {
        ...p,
      }),
    ),
  )
  expect(view.getByText(p.file.description)).toBeTruthy()
  expect(view.queryByRole('status')).toBeNull()
})
it('shows the basename while retaining the full location for hover and actions', async () => {
  const p = props()
  const path = '/work/reports/result.pdf'
  const view = render(
    h(PresentedFileCard, {
      ...p,
      cwd: '/work',
      file: { ...p.file, path },
    }),
  )
  expect(view.getByTitle(path)).toBeTruthy()
  expect(view.getByText('result.pdf')).toBeTruthy()
  await act(() =>
    view.rerender(
      h(PresentedFileCard, {
        ...p,
        cwd: '/work',
      }),
    ),
  )
  expect(view.getByTitle('/work/out/report.pdf')).toBeTruthy()
  expect(view.getByText('report.pdf')).toBeTruthy()
})
it.each([
  ['Quarterly summary (.pdf)', 'Quarterly summary'],
  ['季度总结（PDF）', '季度总结'],
] as const)('omits a trailing parenthesized file suffix from %s', async (description, expected) => {
  const p = props()
  const view = render(
    h(PresentedFileCard, {
      ...p,
      file: { ...p.file, description },
    }),
  )
  expect(view.getByText(expected)).toBeTruthy()
  expect(view.queryByText(description)).toBeNull()
})
it.each([en, zh])(
  'distinguishes directory-only progress and errors in each locale',
  async (dictionary) => {
    const p = { ...props(), t: makeTranslate(dictionary) }
    const view = render(
      h(PresentedFileCard, {
        ...p,
        phase: 'revealing',
      }),
    )
    expect(view.getByText(dictionary['presented.revealing'])).toBeTruthy()
    await act(() =>
      view.rerender(
        h(PresentedFileCard, {
          ...p,
          phase: 'revealing',
          host: { ...p.host, fileManager: 'directory' },
        }),
      ),
    )
    expect(view.getByText(dictionary['presented.directoryOpening'])).toBeTruthy()
    await act(() =>
      view.rerender(
        h(PresentedFileCard, {
          ...p,
          phase: 'revealError',
          host: { ...p.host, fileManager: 'directory' },
        }),
      ),
    )
    expect(view.getByText(dictionary['presented.directoryError'])).toBeTruthy()
  },
)
it('renders the supplied action independently from the card preview', async () => {
  const p = props()
  const native = vi.fn()
  const view = render(
    h(PresentedFileCard, {
      ...p,
      actions: h(
        'button',
        {
          type: 'button',
          onClick: native,
        },
        ['Native file action'],
      ),
    }),
  )
  {
    fireEvent.click(view.getByRole('button', { name: 'Native file action' }))
    await nextTick()
  }
  expect(native).toHaveBeenCalledOnce()
  expect(p.onPreview).not.toHaveBeenCalled()
  {
    fireEvent.contextMenu(view.getByRole('button', { name: 'Preview out/report.pdf in sidebar' }), {
      clientX: 26,
      clientY: 37,
    })
    await nextTick()
  }
  expect(p.onMenu).toHaveBeenCalledWith({ x: 26, y: 37 })
  {
    fireEvent.click(view.getByRole('button', { name: 'Preview out/report.pdf in sidebar' }))
    await nextTick()
  }
  expect(p.onPreview).toHaveBeenCalledOnce()
})
