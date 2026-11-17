import { h, computed, unref, nextTick } from 'vue'
import { fireEvent as fireEventNative, within } from '@testing-library/dom'
// @vitest-environment jsdom
/** Bottom following and virtual sticky ancestors use the table's committed geometry. */
import {
  act as actNative,
  cleanup,
  render as renderNative,
} from '../../../test-support/client-runtime/src/vue-test.ts'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import {
  bindSnapshotSelector,
  makeTranslate,
  sessionSnapshot,
} from '@deepseek-ai/dsh-client-test-runtime'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { InspectorTable, type InspectorTableProps } from '../src/client/views/InspectorTable.tsx'
import type { InspectorRecord, InspectorRow } from '../src/client/views/table-model.ts'
import { en } from '../src/client/locales.ts'
import { installInspectorTableGeometry } from './table-geometry.client.ts'
beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  // The virtual scroll observer's debounce must settle before jsdom releases its window.
  vi.runOnlyPendingTimers()
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
})
async function renderTable(initial: readonly InspectorRow[]) {
  installInspectorTableGeometry()
  const rows = createSnapshotStore(initial)
  const records = new Map(
    initial.map(row => [
      row.key,
      {
        type: row.key,
        identity: row.key,
        location: '',
        value: { value: `detail:${row.key}` },
      } satisfies InspectorRecord,
    ]),
  )
  const props: InspectorTableProps = {
    title: 'Session Log',
    flash: false,
    showTime: true,
    useRows: bindSnapshotSelector(rows),
    useRecord: (key: Parameters<InspectorTableProps['useRecord']>[0]) =>
      computed(() => {
        const current = unref(key)
        return current === undefined ? undefined : records.get(current)
      }),
    typeOf: key => records.get(key)?.type,
    useSession: bindSnapshotSelector(
      createSnapshotStore(sessionSnapshot('scroll-session' as SessionId)),
    ),
    loadOlder: async () => {},
    t: makeTranslate(en),
  }
  const ui = await render(h(InspectorTable, { ...props }))
  const scroller = ui.getByRole('table').parentElement!
  return { ui, scroller, rows }
}
const initial: readonly InspectorRow[] = [
  { key: 'turn-start', depth: 0, disclosure: 'open' },
  { key: 'step-start', parent: 'turn-start', depth: 1, disclosure: 'open' },
  { key: 'assistant', parent: 'step-start', depth: 2 },
  { key: 'block-start', parent: 'assistant', depth: 3, disclosure: 'open' },
  ...Array.from({ length: 200 }, (_, index) => ({
    key: `delta-${index}`,
    parent: 'block-start',
    depth: 4,
  })),
  { key: 'next-event', parent: 'step-start', depth: 2 },
]
it('starts at the tail, retains nested sticky headers, and follows automatic block closure', async () => {
  const { ui, scroller, rows } = await renderTable(initial)
  expect(scroller.scrollTop).toBe(scroller.scrollHeight - scroller.clientHeight)
  await fireEvent.scroll(scroller)
  expect(ui.getByRole('button', { name: 'turn-start' }).closest('tr')?.style.top).toBe('30px')
  expect(ui.getByRole('button', { name: 'step-start' }).closest('tr')?.style.top).toBe('60px')
  expect(ui.getByRole('button', { name: 'assistant' }).closest('tr')?.style.top).toBe('90px')
  expect(ui.getByRole('button', { name: 'block-start' }).closest('tr')?.style.top).toBe('120px')
  expect(ui.getAllByRole('row').length).toBeLessThan(50)
  scroller.scrollTop = 0
  await fireEvent.scroll(scroller)
  await act(() => {
    rows.set([...initial, { key: 'last-event', depth: 0 }])
  })
  expect(scroller.scrollTop).toBe(0)
  await fireEvent.click(ui.getByRole('button', { name: en['table.latest'] }))
  expect(scroller.scrollTop).toBe(scroller.scrollHeight - scroller.clientHeight)
  await act(() => {
    rows.set(
      rows
        .getSnapshot()
        .map(row => (row.key === 'block-start' ? { ...row, disclosure: 'closed' } : row)),
    )
  })
  expect(ui.queryByRole('button', { name: 'delta-199' })).toBeNull()
  expect(scroller.scrollTop).toBe(0)
  expect(scroller.scrollHeight).toBe(300)
  const blank = ui.container.querySelector('[data-inspector-fold-space]')!
  expect(blank.nextElementSibling).toBeNull()
  expect(blank.querySelector('td')?.style.height).toBe('90px')
  await act(() => {
    rows.set([...rows.getSnapshot(), { key: 'after-close', depth: 0 }])
  })
  expect(scroller.scrollHeight).toBe(300)
  expect(scroller.scrollTop).toBe(0)
  expect(
    ui.container.querySelector('[data-inspector-fold-space] td')?.getAttribute('style'),
  ).toContain('height: 60px')
})
it.each(['turn-start', 'step-start'])(
  'keeps the clicked %s below the correct sticky ancestors after folding',
  async (key) => {
    const { ui, scroller, rows } = await renderTable([
      { key: 'previous-turn', depth: 0 },
      ...Array.from({ length: 20 }, (_, index) => ({
        key: `previous-${index}`,
        parent: 'previous-turn',
        depth: 1,
      })),
      ...initial,
      { key: 'later-turn', depth: 0 },
      ...Array.from({ length: 50 }, (_, index) => ({
        key: `later-${index}`,
        parent: 'later-turn',
        depth: 1,
      })),
    ])
    scroller.scrollTop = 3000
    await fireEvent.scroll(scroller)
    const row = ui.getByRole('button', { name: key }).closest('tr')!
    const top = row.getBoundingClientRect().top
    await fireEvent.click(within(row).getByRole('button', { name: en['table.collapse'] }))
    expect(ui.getByRole('button', { name: key }).closest('tr')).toBe(row)
    expect(row.getBoundingClientRect().top).toBe(top)
    expect(scroller.scrollTop).toBe(630)
    await fireEvent.scroll(scroller)
    expect(row.getBoundingClientRect().top).toBe(top)
    expect(
      ui.queryByRole('button', { name: 'previous-turn' })?.closest('tr')?.style.top ?? '',
    ).toBe('')
    await act(() => {
      rows.set([...rows.getSnapshot(), { key: 'new-event', depth: 0 }])
    })
    expect(scroller.scrollTop).toBe(630)
    expect(row.getBoundingClientRect().top).toBe(top)
    await fireEvent.click(ui.getByRole('button', { name: en['table.latest'] }))
    expect(scroller.scrollTop).toBe(scroller.scrollHeight - scroller.clientHeight)
  },
)
it('retains trailing space when folding the final Turn so its header cannot be clamped offscreen', async () => {
  const { ui, scroller } = await renderTable([
    ...Array.from({ length: 20 }, (_, index) => ({ key: `before-${index}`, depth: 0 })),
    ...initial,
  ])
  await fireEvent.scroll(scroller)
  const row = ui.getByRole('button', { name: 'turn-start' }).closest('tr')!
  const top = row.getBoundingClientRect().top
  await fireEvent.click(within(row).getByRole('button', { name: en['table.collapse'] }))
  await fireEvent.scroll(scroller)
  expect(scroller.scrollTop).toBe(600)
  expect(row.getBoundingClientRect().top).toBe(top)
  expect(
    ui.container.querySelector('[data-inspector-fold-space] td')?.getAttribute('style'),
  ).toContain('height: 240px')
  expect(within(row).getByRole('button', { name: en['table.expand'] })).toBeTruthy()
})
const fireEvent = {
  async scroll(...args: Parameters<typeof fireEventNative.scroll>) {
    await nextTick()
    const result = fireEventNative.scroll(...args)
    await nextTick()
    return result
  },
  async click(...args: Parameters<typeof fireEventNative.click>) {
    await nextTick()
    const result = fireEventNative.click(...args)
    await nextTick()
    return result
  },
}
const render = async (...args: Parameters<typeof renderNative>) => {
  const view = renderNative(...args)
  await nextTick()
  return view
}
const act = actNative
