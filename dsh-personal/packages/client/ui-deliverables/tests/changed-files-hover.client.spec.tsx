// @vitest-environment jsdom
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
/** Hover dwell, lazy comparison reads, and Sidebar navigation from turn-tail rows. */
import { fireEvent, screen } from '@testing-library/dom'
import { h } from 'vue'
import { cleanup, act, render } from '../../../test-support/client-runtime/src/vue-test.ts'
import { nextTick } from 'vue'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { ChangedFiles } from '../src/client/ChangedFiles.tsx'
import { ChangesDiffStore } from '../src/client/changes-diff.ts'
import { changesDiffUrl } from '../src/changes.ts'
import { en } from '../src/client/locales.ts'
import { brandString } from '@deepseek-ai/dsh-brand'
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
const sessionId = brandString<SessionId>('hover-session')
const files = ['main.ts', 'second.ts'].map(path => ({
  path,
  display: path,
  added: 1,
  deleted: 1,
}))
function mount(fileCount = 2) {
  const diffs = new ChangesDiffStore()
  const loadChangesDiff = vi.fn<ChangesDiffStore['load']>().mockResolvedValue(undefined)
  const openReview = vi.fn()
  const changes = {
    seq: 5,
    files: files.slice(0, fileCount),
    total: fileCount,
    added: fileCount,
    deleted: fileCount,
  }
  const view = render(
    h(ChangedFiles, {
      changes: changes,
      cwd: '/workspace',
      sessionId: sessionId,
      t: makeTranslate(en),
      openReview: openReview,
      loadChangesDiff: loadChangesDiff,
      useChangesDiff: bindSnapshotSelector(diffs.state),
    }),
  )
  return {
    view,
    diffs,
    loadChangesDiff,
    openReview,
    row: screen.getByRole('button', { name: 'View changes to main.ts' }),
  }
}
it.each([1, 2])(
  'reads only after 500ms and renders the selected comparison with %i files',
  async (fileCount) => {
    const { row, diffs, loadChangesDiff, openReview } = mount(fileCount)
    {
      fireEvent.pointerEnter(row.parentElement!)
      await nextTick()
    }
    await act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(loadChangesDiff).not.toHaveBeenCalled()
    expect(document.querySelector('[data-changes-hover-preview]')).toBeNull()
    await act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(loadChangesDiff).toHaveBeenCalledExactlyOnceWith(sessionId, 5, 0)
    expect(screen.getByText('Reading changes…')).toBeTruthy()
    await act(() => {
      diffs.state.set({
        [changesDiffUrl(sessionId, 5, 0)]: {
          kind: 'text',
          path: 'main.ts',
          display: 'main.ts',
          before: true,
          after: true,
          coarse: false,
          hunks: [
            {
              oldStart: 1,
              oldLines: 1,
              newStart: 1,
              newLines: 1,
              lines: ['-const value = 1', '+const value = 2'],
            },
          ],
        },
      })
    })
    const preview = document.querySelector('[data-changes-hover-preview]')!
    expect(preview.querySelector('[data-review-view="unified"]')).not.toBeNull()
    expect(preview.querySelector('[data-diff-side]')).toBeNull()
    expect(preview.querySelector('[data-diff-line="del"]')?.textContent).toContain(
      'const value = 1',
    )
    expect(preview.querySelector('[data-diff-line="add"]')?.textContent).toContain(
      'const value = 2',
    )
    expect(preview.textContent).toContain('/workspace/main.ts')
    expect(
      screen.getByRole('button', {
        name: 'View changes to main.ts',
        description: '/workspace/main.ts',
      }),
    ).toBe(row)
    expect(
      preview.querySelector('[data-changes-preview-path]')?.getAttribute('tabindex'),
    ).toBeNull()
    {
      fireEvent.pointerLeave(row.parentElement!)
      await nextTick()
    }
    {
      fireEvent.pointerEnter(preview)
      await nextTick()
    }
    await act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(document.querySelector('[data-changes-hover-preview]')).toBe(preview)
    {
      fireEvent.pointerDown(row)
      await nextTick()
    }
    {
      fireEvent.click(row)
      await nextTick()
    }
    expect(preview.parentElement?.hasAttribute('data-closing')).toBe(true)
    await act(() => {
      vi.advanceTimersByTime(99)
    })
    expect(document.querySelector('[data-changes-hover-preview]')).toBe(preview)
    await act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(document.querySelector('[data-changes-hover-preview]')).toBeNull()
    expect(openReview).toHaveBeenCalledExactlyOnceWith(0)
  },
)
it('keeps a status note for a comparison with no hunks', async () => {
  const { row, diffs } = mount()
  diffs.state.set({
    [changesDiffUrl(sessionId, 5, 0)]: {
      kind: 'text',
      path: 'main.ts',
      display: 'main.ts',
      before: true,
      after: true,
      coarse: false,
      hunks: [],
    },
  })
  {
    fireEvent.pointerEnter(row.parentElement!)
    await nextTick()
  }
  await act(() => {
    vi.advanceTimersByTime(500)
  })
  expect(
    document.querySelector('[data-changes-hover-preview] [data-diff-note="empty"]')?.textContent,
  ).toBe('Both sides hold the same lines')
})
it('cancels a short hover and the pending dwell when unmounted', async () => {
  const { row, view, loadChangesDiff } = mount()
  {
    fireEvent.pointerEnter(row.parentElement!)
    await nextTick()
  }
  await act(() => {
    vi.advanceTimersByTime(499)
  })
  {
    fireEvent.pointerLeave(row.parentElement!)
    await nextTick()
  }
  await act(() => {
    vi.advanceTimersByTime(500)
  })
  expect(loadChangesDiff).not.toHaveBeenCalled()
  {
    fireEvent.pointerEnter(row.parentElement!)
    await nextTick()
  }
  view.unmount()
  await act(() => {
    vi.advanceTimersByTime(500)
  })
  expect(loadChangesDiff).not.toHaveBeenCalled()
})
it('previews each row independently, retries failed reads, and closes on Escape', async () => {
  const { row, diffs, loadChangesDiff } = mount()
  diffs.state.set({
    [changesDiffUrl(sessionId, 5, 0)]: 'error',
    [changesDiffUrl(sessionId, 5, 1)]: 'missing',
  })
  {
    fireEvent.pointerEnter(row.parentElement!)
    await nextTick()
  }
  await act(() => {
    vi.advanceTimersByTime(500)
  })
  {
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await nextTick()
  }
  expect(loadChangesDiff).toHaveBeenCalledExactlyOnceWith(sessionId, 5, 0)
  {
    fireEvent.pointerLeave(row.parentElement!)
    await nextTick()
  }
  {
    fireEvent.pointerEnter(
      screen.getByRole('button', { name: 'View changes to second.ts' }).parentElement!,
    )
    await nextTick()
  }
  await act(() => {
    vi.advanceTimersByTime(200)
  })
  await act(() => {
    vi.advanceTimersByTime(300)
  })
  expect(document.querySelectorAll('[data-changes-hover-preview]')).toHaveLength(1)
  expect(document.querySelector('[data-changes-preview-path]')?.textContent).toBe(
    '/workspace/second.ts',
  )
  {
    fireEvent.keyDown(screen.getByRole('button', { name: 'View changes to second.ts' }), {
      key: 'Escape',
    })
    await nextTick()
  }
  await act(() => {
    vi.advanceTimersByTime(100)
  })
  expect(document.querySelector('[data-changes-hover-preview]')).toBeNull()
})
