import { h, nextTick, Teleport, type VNodeChild } from 'vue'
// @vitest-environment jsdom
/** Review controls of the changes view: the lens in both forms, the test file switch, viewed progress, and the commit picker. */
import { cleanupVue as cleanup, flushVue as act, renderVue as renderNative } from './vue-render.client.ts'
import { fireEvent as domFireEvent, within } from '@testing-library/dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { ForgeCommitList } from '@deepseek-ai/dsh-experimental-forge/types'
import { RemoteError, type RemoteResult } from '@deepseek-ai/dsh-typert-protocol'
import { CommitMenu, commitsLabel, type CommitMenuProps } from '../src/client/CommitMenu.tsx'
import { en } from '../src/client/locales.ts'
import {
  HideTestsSwitch,
  LensControl,
  LensMenu,
  ViewedProgress,
  type LensProps,
} from '../src/client/ReviewControls.tsx'
const t = makeTranslate(en)
const COUNTS = { all: 6, interface: 1, implementation: 2, test: 3 }
const sha = (n: number): string => String(n).repeat(40)
const COMMITS: ForgeCommitList = {
  headSha: sha(3),
  truncated: false,
  commits: [1, 2, 3].map(n => ({
    sha: sha(n),
    parent: n === 1 ? null : sha(n - 1),
    title: `commit ${n}`,
    author: 'octo',
    authoredAt: '2026-10-07T12:00:00Z',
  })),
}
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
/** Let the reads a control awaits settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, 0))
  })
}
function lensProps(overrides: Partial<LensProps> = {}): LensProps & {
  readonly choose: ReturnType<typeof vi.fn<LensProps['choose']>>
} {
  return {
    lens: 'all',
    counts: COUNTS,
    hideTests: false,
    t,
    ...overrides,
    choose: vi.fn<LensProps['choose']>(),
  }
}
describe('LensControl', () => {
  it('shows each lens with its count, chooses one by click, and walks enabled lenses by key', async () => {
    const props = lensProps({ lens: 'interface' })
    const view = await render(h(LensControl, { ...props }))
    const radios = view.getAllByRole('radio')
    expect(radios.map(radio => radio.textContent)).toEqual([
      'All6',
      'Interface1',
      'Implementation2',
      'Tests3',
    ])
    expect(radios.map(radio => radio.getAttribute('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
      'false',
    ])
    expect(radios.map(radio => radio.tabIndex)).toEqual([-1, 0, -1, -1])
    expect(view.getByRole('radiogroup', { name: en['lens.aria'] })).toBeDefined()
    await fireEvent.click(radios[2]!)
    expect(props.choose).toHaveBeenLastCalledWith('implementation')
    for (const [key, lens] of [
      ['ArrowRight', 'implementation'],
      ['ArrowDown', 'implementation'],
      ['ArrowLeft', 'all'],
      ['ArrowUp', 'all'],
      ['Home', 'all'],
      ['End', 'test'],
    ] as const) {
      await fireEvent.keyDown(radios[1]!, { key })
      expect(props.choose).toHaveBeenLastCalledWith(lens)
    }
    const calls = props.choose.mock.calls.length
    await fireEvent.keyDown(radios[1]!, { key: 'Enter' })
    expect(props.choose).toHaveBeenCalledTimes(calls)
  })
  it('moves focus with the selection and disables the test lens while test files hide', async () => {
    const props = lensProps({ lens: 'implementation', hideTests: true })
    const view = await render(h(LensControl, { ...props }))
    const tests = view.getByRole('radio', { name: /^Tests/ })
    expect((tests as HTMLButtonElement).disabled).toBe(true)
    expect(tests.textContent).toBe('Tests')
    const implementation = view.getByRole('radio', { name: /^Implementation/ })
    implementation.focus()
    await fireEvent.keyDown(implementation, { key: 'ArrowRight' })
    expect(props.choose).toHaveBeenLastCalledWith('all')
    expect(document.activeElement).toBe(view.getByRole('radio', { name: /^All/ }))
    await fireEvent.keyDown(implementation, { key: 'End' })
    expect(props.choose).toHaveBeenLastCalledWith('implementation')
  })
})
describe('LensMenu', () => {
  it('names the lens on its trigger and chooses another from its menu', async () => {
    const props = lensProps({ lens: 'test' })
    const view = await render(h(LensMenu, { ...props, visible: true }))
    const trigger = view.getByRole('button', { name: 'Review layer: Tests' })
    await fireEvent.click(trigger)
    const menu = within(document.body).getByRole('menu')
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map(item => item.textContent),
    ).toEqual(['All6', 'Interface1', 'Implementation2', 'Tests3'])
    await fireEvent.click(within(menu).getByRole('menuitem', { name: 'Interface1' }))
    expect(props.choose).toHaveBeenCalledWith('interface')
    expect(within(document.body).queryByRole('menu')).toBeNull()
    await fireEvent.click(trigger)
    await fireEvent.keyDown(within(document.body).getByRole('menu'), { key: 'Escape' })
    expect(within(document.body).queryByRole('menu')).toBeNull()
  })
  it('disables the test lens without its count while test files hide, as the segments do', async () => {
    const view = await render(
      h(LensMenu, {
        ...lensProps({ hideTests: true, counts: { ...COUNTS, test: 0 } }),
        visible: true,
      }),
    )
    await fireEvent.click(view.getByRole('button', { name: 'Review layer: All' }))
    const tests = within(document.body).getByRole('menuitem', { name: 'Tests' })
    expect(tests.textContent).toBe('Tests')
    expect((tests as HTMLButtonElement).disabled).toBe(true)
  })
  it('keeps its menu closed while the tab is hidden', async () => {
    const view = await render(h(LensMenu, { ...lensProps(), visible: false }))
    await fireEvent.click(view.getByRole('button', { name: 'Review layer: All' }))
    expect(within(document.body).queryByRole('menu')).toBeNull()
  })
})
describe('HideTestsSwitch and ViewedProgress', () => {
  it('toggles from the switch and from its label', async () => {
    const toggle = vi.fn()
    const view = await render(h(HideTestsSwitch, { hidden: false, toggle: toggle, t: t }))
    await fireEvent.click(view.getByRole('switch', { name: en['tests.hide'] }))
    await fireEvent.click(view.getByText(en['tests.hide']))
    expect(toggle).toHaveBeenCalledTimes(2)
  })
  it('shows viewed files out of shown files, and nothing without shown files', async () => {
    const view = await render(h(ViewedProgress, { viewed: 2, total: 4, t: t }))
    const bar = view.getByRole('progressbar', { name: en['viewed.progressAria'] })
    expect([
      bar.getAttribute('aria-valuenow'),
      bar.getAttribute('aria-valuemax'),
      bar.getAttribute('aria-valuetext'),
    ]).toEqual(['2', '4', '2 / 4 viewed'])
    // One ring filled to the viewed share, then the label, or the bare count a narrow toolbar shows instead.
    const [length, gap] = bar
      .querySelectorAll('circle')[1]!
      .getAttribute('stroke-dasharray')!
      .split(' ')
      .map(Number)
    expect(length! / gap!).toBeCloseTo(0.5)
    expect(bar.querySelectorAll('svg')).toHaveLength(1)
    expect(
      [...bar.querySelectorAll('[data-forge-progress]')].map(form => [
        form.getAttribute('data-forge-progress'),
        form.textContent,
      ]),
    ).toEqual([
      ['full', '2 / 4 viewed'],
      ['compact', '2/4'],
    ])
    await view.rerender(h(ViewedProgress, { viewed: 0, total: 0, t: t }))
    expect(view.queryByRole('progressbar')).toBeNull()
  })
})
describe('CommitMenu', () => {
  // The rows name each commit's age; pin Date so the label does not follow the wall clock.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse('2026-10-09T12:00:00Z') })
  })
  afterEach(() => {
    vi.useRealTimers()
  })
  async function mount(props: Partial<CommitMenuProps> = {}) {
    const list =
      props.list ?? vi.fn<CommitMenuProps['list']>(async () => ({ ok: true, value: COMMITS }))
    const choose = vi.fn<CommitMenuProps['choose']>()
    const all: CommitMenuProps = {
      chosen: null,
      visible: true,
      kept: 'oldest',
      version: 'v1',
      t,
      ...props,
      list,
      choose,
    }
    const view = await render(h(CommitMenu, { ...all }))
    const rerender = async (next: Partial<CommitMenuProps>) => {
      await view.rerender(h(CommitMenu, { ...all, ...next }))
    }
    const rows = (): string[] =>
      within(document.body)
        .queryAllByRole('menuitem')
        .map(row => row.textContent ?? '')
    const row = (n: number): HTMLElement =>
      within(document.body).getByRole('menuitem', { name: new RegExp(`^${sha(n).slice(0, 7)}`) })
    return { view, list, choose, rerender, rows, row }
  }
  it('names all commits, one commit, or a run of commits', () => {
    expect(commitsLabel(null, t)).toBe('All commits')
    expect(commitsLabel({ from: sha(1), to: sha(1) }, t)).toBe('1111111')
    expect(commitsLabel({ from: sha(1), to: sha(2) }, t)).toBe('1111111…2222222')
  })
  it('reads the commits once per version, keeps them across openings, and chooses one or a Shift run of them', async () => {
    const m = await mount()
    await settle()
    expect(m.list).toHaveBeenCalledTimes(1)
    await m.rerender({ visible: true })
    await settle()
    expect(m.list).toHaveBeenCalledTimes(1)
    const trigger = m.view.getByRole('button', { name: 'Commits shown: All commits' })
    await fireEvent.click(trigger)
    await settle()
    expect(m.list).toHaveBeenCalledTimes(1)
    const rows = m.rows()
    expect(rows[0]).toBe('All commits3 commits')
    expect(rows.slice(1)).toEqual(
      [1, 2, 3].map(n => `${sha(n).slice(0, 7)}commit ${n}${t('time.days', { n: 2 })}`),
    )
    expect(within(document.body).getByText(en['commits.shiftHint'])).toBeDefined()
    expect(
      within(document.body)
        .getByRole('menuitem', { name: /^All commits/ })
        .getAttribute('aria-current'),
    ).toBe('page')
    await fireEvent.click(m.row(2))
    expect(m.choose).toHaveBeenLastCalledWith({ from: sha(2), to: sha(2) })
    await m.rerender({ chosen: { from: sha(2), to: sha(2) } })
    await fireEvent.click(m.view.getByRole('button', { name: 'Commits shown: 2222222' }))
    await settle()
    expect([1, 2, 3].map(n => m.row(n).getAttribute('aria-current'))).toEqual([
      null,
      'page',
      null,
    ])
    await fireEvent.click(m.row(3), { shiftKey: true })
    expect(m.choose).toHaveBeenLastCalledWith({ from: sha(2), to: sha(3) })
    await m.rerender({ chosen: { from: sha(2), to: sha(3) } })
    await fireEvent.click(m.view.getByRole('button', { name: 'Commits shown: 2222222…3333333' }))
    await settle()
    expect([1, 2, 3].map(n => m.row(n).getAttribute('aria-current'))).toEqual([
      null,
      'page',
      'page',
    ])
    await fireEvent.click(m.row(1), { shiftKey: true })
    expect(m.choose).toHaveBeenLastCalledWith({ from: sha(1), to: sha(2) })
    const calls = m.choose.mock.calls.length
    await fireEvent.click(m.view.getByRole('button', { name: 'Commits shown: 2222222…3333333' }))
    await settle()
    await fireEvent.keyDown(m.row(3), { key: 'Enter', shiftKey: true })
    await fireEvent.click(m.row(3), { shiftKey: true })
    expect(m.choose).toHaveBeenCalledTimes(calls)
    await fireEvent.click(m.view.getByRole('button', { name: 'Commits shown: 2222222…3333333' }))
    await settle()
    await fireEvent.click(within(document.body).getByRole('menuitem', { name: /^All commits/ }))
    expect(m.choose).toHaveBeenLastCalledWith(null)
    expect(m.list).toHaveBeenCalledTimes(1)
    await m.rerender({ chosen: null, version: 'v2' })
    await settle()
    expect(m.list).toHaveBeenCalledTimes(2)
  })
  it('keeps its menu open and says why for a Shift run that leaves the first-parent line', async () => {
    // The third commit sits on another branch from the first one, after the second in the list.
    const commits = COMMITS.commits.map(commit =>
      commit.sha === sha(3) ? { ...commit, parent: sha(1) } : commit,
    )
    const m = await mount({ list: async () => ({ ok: true, value: { ...COMMITS, commits } }) })
    await fireEvent.click(m.view.getByRole('button', { name: 'Commits shown: All commits' }))
    await settle()
    await fireEvent.click(m.row(2))
    expect(m.choose).toHaveBeenLastCalledWith({ from: sha(2), to: sha(2) })
    await m.rerender({ chosen: { from: sha(2), to: sha(2) } })
    await fireEvent.click(m.view.getByRole('button', { name: 'Commits shown: 2222222' }))
    await settle()
    await fireEvent.click(m.row(3), { shiftKey: true })
    expect(m.choose).toHaveBeenCalledTimes(1)
    expect(within(document.body).getByRole('menu')).toBeDefined()
    expect(within(document.body).getByRole('status').textContent).toBe(en['commits.notLinear'])
    await fireEvent.click(m.row(1), { shiftKey: true })
    expect(m.choose).toHaveBeenLastCalledWith({ from: sha(1), to: sha(2) })
    expect(within(document.body).queryByRole('status')).toBeNull()
  })
  it('starts a Shift run at the clicked commit without an earlier choice, and ignores choosing every commit again', async () => {
    const m = await mount({
      list: async () => ({
        ok: true,
        value: {
          ...COMMITS,
          commits: COMMITS.commits.map(commit => ({ ...commit, authoredAt: 'unknown' })),
        },
      }),
    })
    await fireEvent.click(m.view.getByRole('button', { name: 'Commits shown: All commits' }))
    await settle()
    expect(m.row(3).textContent).toBe('3333333commit 3')
    await fireEvent.click(m.row(3), { shiftKey: true })
    expect(m.choose).toHaveBeenLastCalledWith({ from: sha(3), to: sha(3) })
    await fireEvent.click(m.view.getByRole('button', { name: 'Commits shown: All commits' }))
    await settle()
    await fireEvent.click(within(document.body).getByRole('menuitem', { name: /^All commits/ }))
    expect(m.choose).toHaveBeenCalledTimes(1)
  })
  it('notes a truncated list, retries a failed read, and disappears for a source without commits', async () => {
    let result: RemoteResult<ForgeCommitList | null> = {
      ok: false,
      error: new RemoteError('forgePanel/diff-failed', 'down', {}),
    }
    const pending = Promise.withResolvers<RemoteResult<ForgeCommitList | null>>()
    let first = true
    const list = vi.fn<CommitMenuProps['list']>(async () => {
      if (first) {
        first = false
        return pending.promise
      }
      return result
    })
    const m = await mount({ list })
    await fireEvent.click(m.view.getByRole('button', { name: 'Commits shown: All commits' }))
    expect(within(document.body).getByRole('status').textContent).toBe(en['commits.loading'])
    pending.resolve(result)
    await settle()
    expect(within(document.body).getByRole('status').textContent).toContain(en['commits.failed'])
    result = { ok: true, value: { ...COMMITS, commits: [], truncated: true } }
    await fireEvent.click(within(document.body).getByRole('button', { name: en.retry }))
    await settle()
    expect(m.rows()).toEqual(['All commits0 commits'])
    expect(within(document.body).queryByText(en['commits.shiftHint'])).toBeNull()
    expect(within(document.body).getByText('Only the earliest 0 commits are listed')).toBeDefined()
    await m.rerender({ kept: 'newest' })
    expect(within(document.body).getByText('Only the latest 0 commits are listed')).toBeDefined()
    await fireEvent.keyDown(within(document.body).getByRole('menu'), { key: 'Escape' })
    result = { ok: true, value: null }
    await m.rerender({ version: 'v2' })
    await settle()
    expect(m.view.container.textContent).toBe('')
  })
  it('reads nothing while hidden and drops a read that a newer version replaced', async () => {
    const pending = Promise.withResolvers<RemoteResult<ForgeCommitList | null>>()
    const list = vi.fn<CommitMenuProps['list']>(() => pending.promise)
    const m = await mount({ list, visible: false })
    await settle()
    expect(list).not.toHaveBeenCalled()
    await m.rerender({ visible: true })
    await m.rerender({ visible: true, version: 'v2' })
    pending.resolve({ ok: true, value: null })
    await settle()
    expect(m.view.container.textContent).toBe('')
    expect(list).toHaveBeenCalledTimes(2)
  })
})
async function render(
  element: VNodeChild,
  options?: {
    container: DocumentFragment
  },
) {
  const view = renderNative(
    options === undefined ? element : h(Teleport, { to: options.container }, [element]),
  )
  await nextTick()
  return view
}
const fireEvent = {
  async click(...args: Parameters<typeof domFireEvent.click>) {
    await nextTick()
    if (vi.isFakeTimers()) vi.setSystemTime(Date.now() + 1)
    const result = domFireEvent.click(...args)
    await nextTick()
    return result
  },
  async keyDown(...args: Parameters<typeof domFireEvent.keyDown>) {
    await nextTick()
    if (vi.isFakeTimers()) vi.setSystemTime(Date.now() + 1)
    const result = domFireEvent.keyDown(...args)
    await nextTick()
    return result
  },
}
