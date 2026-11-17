import { h, defineComponent, shallowRef } from 'vue'
// @vitest-environment jsdom
/** The changes view's face for other Client plugins, the merged annotations of a view, and a view's lens run. */
import { fireEvent, within } from '@testing-library/dom'
import { renderVue as render, cleanupVue as cleanup, flushVue as act } from './vue-render.client.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { brandString } from '@deepseek-ai/dsh-brand'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { AnnotationView } from '../src/client/annotations.ts'
import { changesAddress, type ChangesTarget } from '../src/client/changes-address.ts'
import {
  ForgeChangesService,
  type ForgeAnnotationSource,
  type ForgeLensDescription,
  type ForgeLineAnnotation,
} from '../src/client/changes-service.ts'
import { foldedHunks, useLensRun, type LensRunInput } from '../src/client/lens-filter.ts'
import {
  LensFilterMenu,
  lensOfRow,
  lensRowId,
  NO_LENS,
  type LensChoice,
} from '../src/client/LensFilter.tsx'
import { en } from '../src/client/locales.ts'
import type { HostStream } from '../src/client/source.ts'
import type {
  ForgeDiffHunk,
  ForgeExtensionState,
  ForgeLensFrame,
  ForgeLensId,
} from '../src/types.ts'
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
const t = makeTranslate(en)
const SESSION = brandString<SessionId>('s1')
const target: ChangesTarget = {
  sessionId: SESSION,
  source: { kind: 'change', url: 'https://github.com/octo/demo/pull/7' },
}
function service(mounted: SessionId | undefined = SESSION) {
  const openResource = vi.fn()
  const extensions = createSnapshotStore<ForgeExtensionState | null>(null)
  const forge = new ForgeChangesService({ mounted: () => mounted, openResource }, extensions, {
    changes: 'forge-changes',
    panel: 'forge-panel',
  })
  return { forge, openResource, extensions }
}
function lens(id: string, order?: number): ForgeLensDescription {
  return {
    id: id as ForgeLensId,
    title: () => id.toUpperCase(),
    ...(order === undefined ? {} : { order }),
  }
}
/** A source whose annotations of every view a test sets. */
function source(id: string, order?: number) {
  const values = createSnapshotStore<ReadonlyMap<string, readonly ForgeLineAnnotation[]>>(
    new Map(),
  )
  const observe = vi.fn(
    (_target: ChangesTarget): HostObservable<ReadonlyMap<string, readonly ForgeLineAnnotation[]>> =>
      values,
  )
  const entry: ForgeAnnotationSource = { id, observe, ...(order === undefined ? {} : { order }) }
  return { entry, values, observe }
}
function note(key: string, line: number, version: string | number = 1): ForgeLineAnnotation {
  return { key, place: { side: 'R', startLine: line, endLine: line }, version }
}
describe('ForgeChangesService', () => {
  it('mints and reads changes addresses and opens a view of the Session the sidebar shows', () => {
    const { forge, openResource } = service()
    const address = forge.address(target)
    expect(address).toBe(changesAddress(target))
    expect(forge.parse(address)).toEqual(target)
    expect(forge.parse('dsh-resource://other/x')).toBeUndefined()
    expect(forge.kinds).toEqual({ changes: 'forge-changes', panel: 'forge-panel' })
    forge.open(target, { lens: 'fixture/exports' })
    forge.open(target)
    expect(openResource.mock.calls).toEqual([
      [address, { lens: 'fixture/exports' }],
      [address, undefined],
    ])
    expect(() => {
      service(brandString<SessionId>('other')).forge.open(target)
    }).toThrow('forge-panel: Session s1 is not the Session the sidebar shows')
  })
  it('publishes lens descriptions by position, refuses a taken identity, and withdraws one when its plugin unloads', async () => {
    const { forge } = service()
    const changes = vi.fn()
    forge.lenses.subscribe(changes)
    const root = new Context()
    const fiber = root.plugin({
      apply(ctx: Context) {
        ctx.effect(() => forge.describeLens(lens('b', 1)))
      },
    })
    await fiber
    const releaseA = forge.describeLens(lens('a', 1))
    forge.describeLens(lens('c'))
    expect(forge.lenses.getSnapshot().map(item => item.id)).toEqual(['c', 'b', 'a'])
    expect(() => forge.describeLens(lens('a'))).toThrow(
      'forge-panel: a lens description "a" is already registered',
    )
    await fiber.dispose()
    expect(forge.lenses.getSnapshot().map(item => item.id)).toEqual(['c', 'a'])
    releaseA()
    releaseA()
    expect(forge.lenses.getSnapshot().map(item => item.id)).toEqual(['c'])
    expect(changes).toHaveBeenCalledTimes(5)
  })
  it('registers annotation sources by position and withdraws one when its plugin unloads', async () => {
    const { forge } = service()
    const root = new Context()
    const fiber = root.plugin({
      apply(ctx: Context) {
        ctx.effect(() => forge.registerAnnotations(source('notes', 2).entry))
      },
    })
    await fiber
    forge.registerAnnotations(source('lint').entry)
    expect(forge.annotationSources.getSnapshot().map(item => item.id)).toEqual(['lint', 'notes'])
    expect(() => forge.registerAnnotations(source('lint').entry)).toThrow(
      'forge-panel: a annotation source "lint" is already registered',
    )
    await fiber.dispose()
    expect(forge.annotationSources.getSnapshot().map(item => item.id)).toEqual(['lint'])
  })
})
describe('AnnotationView', () => {
  it('merges the sources by path in source order, observing them only while read', async () => {
    const { forge } = service()
    const notes = source('notes', 1)
    const lint = source('lint')
    forge.registerAnnotations(notes.entry)
    forge.registerAnnotations(lint.entry)
    const view = new AnnotationView(forge.annotationSources, target)
    expect(view.getSnapshot().size).toBe(0)
    expect(notes.observe).not.toHaveBeenCalled()
    const listener = vi.fn()
    const stop = view.subscribe(listener)
    expect(notes.observe).toHaveBeenCalledWith(target)
    await act(() => {
      notes.values.set(new Map([['a.ts', [note('n1', 3)]]]))
    })
    await act(() => {
      lint.values.set(
        new Map([
          ['a.ts', [note('l1', 1)]],
          ['b.ts', [note('l2', 2)]],
          ['c.ts', []],
        ]),
      )
    })
    const merged = view.getSnapshot()
    expect(
      [...merged].map(([path, list]) => [
        path,
        list.map(item => `${item.source}:${item.annotation.key}`),
      ]),
    ).toEqual([
      ['a.ts', ['lint:l1', 'notes:n1']],
      ['b.ts', ['lint:l2']],
    ])
    // A file whose annotations did not change keeps its list.
    await act(() => {
      notes.values.set(
        new Map([
          ['a.ts', [note('n1', 3)]],
          ['d.ts', [note('n2', 1)]],
        ]),
      )
    })
    expect(view.getSnapshot().get('b.ts')).toBe(merged.get('b.ts'))
    expect(view.getSnapshot().get('a.ts')).toBe(merged.get('a.ts'))
    const calls = listener.mock.calls.length
    await act(() => {
      notes.values.set(
        new Map([
          ['a.ts', [note('n1', 3)]],
          ['d.ts', [note('n2', 1)]],
        ]),
      )
    })
    expect(listener).toHaveBeenCalledTimes(calls)
    await act(() => {
      notes.values.set(
        new Map([
          ['a.ts', [note('n1', 3, 2)]],
          ['d.ts', [note('n2', 1)]],
        ]),
      )
    })
    expect(view.getSnapshot().get('a.ts')).not.toBe(merged.get('a.ts'))
    stop()
    await act(() => {
      notes.values.set(new Map())
    })
    expect(view.getSnapshot().get('d.ts')).toHaveLength(1)
  })
  it('follows sources that register and withdraw while read', async () => {
    const { forge } = service()
    const notes = source('notes')
    notes.values.set(new Map([['a.ts', [note('n1', 3)]]]))
    const view = new AnnotationView(forge.annotationSources, target)
    const stopA = view.subscribe(() => {})
    const stopB = view.subscribe(() => {})
    const release = forge.registerAnnotations(notes.entry)
    expect(view.getSnapshot().get('a.ts')).toHaveLength(1)
    const lint = source('lint', 1)
    lint.values.set(new Map([['a.ts', [note('l1', 2)]]]))
    forge.registerAnnotations(lint.entry)
    expect(
      view
        .getSnapshot()
        .get('a.ts')
        ?.map(item => item.source),
    ).toEqual(['notes', 'lint'])
    expect(notes.observe).toHaveBeenCalledTimes(1)
    release()
    expect(
      view
        .getSnapshot()
        .get('a.ts')
        ?.map(item => item.source),
    ).toEqual(['lint'])
    await act(() => {
      notes.values.set(new Map([['b.ts', [note('n2', 1)]]]))
    })
    expect(view.getSnapshot().has('b.ts')).toBe(false)
    stopA()
    stopB()
  })
})
describe('foldedHunks', () => {
  const hunk = (
    oldStart: number,
    oldLines: number,
    newStart: number,
    newLines: number,
  ): ForgeDiffHunk => ({ oldStart, oldLines, newStart, newLines, lines: [] })
  const hunks = [hunk(1, 3, 1, 3), hunk(10, 0, 10, 2), hunk(20, 2, 22, 0)]
  it('folds the hunks that meet none of the lens lines on either side', () => {
    expect([...foldedHunks(hunks, { ranges: { old: [], new: [{ start: 11, end: 11 }] } })]).toEqual(
      [0, 2],
    )
    expect([
      ...foldedHunks(hunks, {
        ranges: { old: [{ start: 21, end: 30 }], new: [{ start: 3, end: 3 }] },
      }),
    ]).toEqual([1])
    expect([
      ...foldedHunks(hunks, {
        ranges: { old: [{ start: 10, end: 10 }], new: [{ start: 22, end: 22 }] },
      }),
    ]).toEqual([0, 1, 2])
    expect(foldedHunks(hunks, {}).size).toBe(0)
  })
})
function mountLens(initial: LensRunInput) {
  const input = shallowRef(initial)
  let state: ReturnType<typeof useLensRun> | undefined
  const view = render(
    h(
      defineComponent(() => {
        state = useLensRun(() => input.value)
        return () => null
      }),
    ),
  )
  if (state === undefined) throw new Error('lens fixture did not mount')
  return {
    state,
    unmount: () => { view.unmount() },
    rerender: async (next: LensRunInput) => {
      await act(() => {
        input.value = next
      })
    },
  }
}
describe('useLensRun', () => {
  function stream(
    frames: readonly ForgeLensFrame[],
    failure?: unknown,
    gate?: Promise<unknown>,
  ): HostStream<ForgeLensFrame> {
    return {
      dispose: vi.fn(),
      async *[Symbol.asyncIterator]() {
        for (const frame of frames) {
          await gate
          yield frame
        }
        await gate
        if (failure !== undefined) throw failure
      },
    }
  }
  const EXPORTS = { id: 'fixture/exports', version: '1' }
  const OTHER = { id: 'other', version: '1' }
  const base: LensRunInput = {
    visible: true,
    lens: EXPORTS,
    source: { kind: 'local', scope: { kind: 'unstaged' } },
    version: 'v1',
    attempt: 0,
    open: () => stream([]),
  }
  it('reports progress, then keeps the result, which choosing the lens again reuses without asking', async () => {
    const gate = Promise.withResolvers<undefined>()
    const open = vi
      .fn<LensRunInput['open']>()
      .mockReturnValueOnce(
        stream(
          [
            { kind: 'progress', done: 1, total: 2 },
            { kind: 'result', files: { 'a.ts': {} } },
          ],
          undefined,
          gate.promise,
        ),
      )
      .mockReturnValueOnce(stream([{ kind: 'result', files: {} }]))
    const initialProps: LensRunInput = { ...base, open }
    const hook = mountLens(initialProps)
    expect(hook.state.value.run).toEqual({ kind: 'running', done: null, total: null })
    expect(open.mock.calls[0]?.[0]).toEqual({
      source: base.source,
      version: 'v1',
      lens: 'fixture/exports',
    })
    await act(async () => {
      gate.resolve(undefined)
      await gate.promise
    })
    await vi.waitFor(() => {
      expect(hook.state.value.run).toEqual({ kind: 'ready', files: { 'a.ts': {} } })
    })
    await hook.rerender({ ...base, open, lens: OTHER })
    await vi.waitFor(() => {
      expect(hook.state.value.run).toEqual({ kind: 'ready', files: {} })
    })
    await hook.rerender({ ...base, open, lens: { ...EXPORTS } })
    expect(hook.state.value.run).toEqual({ kind: 'ready', files: { 'a.ts': {} } })
    expect([hook.state.value.resultOf(EXPORTS), hook.state.value.resultOf(OTHER)]).toEqual([
      { 'a.ts': {} },
      {},
    ])
    expect(open).toHaveBeenCalledTimes(2)
    // A result holds for the lens version that answered it.
    expect(hook.state.value.resultOf({ ...EXPORTS, version: '2' })).toBeUndefined()
    // Other files, or equal files of another source, drop the kept results.
    await hook.rerender({ ...base, open: () => stream([]), version: 'v2' })
    expect(hook.state.value.resultOf(EXPORTS)).toBeUndefined()
    await hook.rerender({
      ...base,
      open: () => stream([]),
      source: { kind: 'local', scope: { kind: 'staged' } },
    })
    expect(hook.state.value.resultOf(EXPORTS)).toBeUndefined()
  })
  it('reports a Remote failure by its code, another failure as a lens failure, and asks nothing while hidden or without files', async () => {
    const open = vi
      .fn<LensRunInput['open']>()
      .mockReturnValueOnce(stream([], new RemoteError('forgePanel/lens-stale', 'read again', {})))
      .mockReturnValueOnce(stream([], new Error('socket closed')))
      .mockReturnValueOnce(stream([], 'stream ended'))
    const initialProps: LensRunInput = { ...base, open }
    const hook = mountLens(initialProps)
    await vi.waitFor(() => {
      expect(hook.state.value.run).toEqual({
        kind: 'failed',
        code: 'forgePanel/lens-stale',
        message: 'read again',
      })
    })
    await hook.rerender({ ...base, open, attempt: 1 })
    await vi.waitFor(() => {
      expect(hook.state.value.run).toEqual({
        kind: 'failed',
        code: 'forgePanel/lens-failed',
        message: 'socket closed',
      })
    })
    await hook.rerender({ ...base, open, attempt: 2 })
    await vi.waitFor(() => {
      expect(hook.state.value.run).toEqual({
        kind: 'failed',
        code: 'forgePanel/lens-failed',
        message: 'stream ended',
      })
    })
    await hook.rerender({ ...base, open, attempt: 3, visible: false })
    await hook.rerender({ ...base, open, attempt: 3, source: null })
    await hook.rerender({ ...base, open, lens: null })
    expect(hook.state.value.run).toEqual({ kind: 'idle' })
    expect(open).toHaveBeenCalledTimes(3)
  })
  it('stops a request whose view hides or unmounts and ignores what it delivers afterwards', async () => {
    const gate = Promise.withResolvers<undefined>()
    const opened = stream(
      [{ kind: 'result', files: { 'a.ts': {} } }],
      new Error('late'),
      gate.promise,
    )
    const failing = stream([], new Error('late'), gate.promise)
    const ending = stream([], undefined, gate.promise)
    const open = vi
      .fn<LensRunInput['open']>()
      .mockReturnValueOnce(opened)
      .mockReturnValueOnce(failing)
      .mockReturnValueOnce(ending)
    const initialProps: LensRunInput = { ...base, open }
    const hook = mountLens(initialProps)
    await hook.rerender({ ...base, open, visible: false })
    expect(opened.dispose).toHaveBeenCalled()
    await hook.rerender({ ...base, open, attempt: 1 })
    await hook.rerender({ ...base, open, attempt: 2 })
    hook.unmount()
    await act(async () => {
      gate.resolve(undefined)
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(failing.dispose).toHaveBeenCalled()
    expect(ending.dispose).toHaveBeenCalled()
    expect(hook.state.value.run).toEqual({ kind: 'running', done: null, total: null })
  })
})
describe('LensFilterMenu', () => {
  const lenses: readonly LensChoice[] = [
    { id: 'fixture/exports', title: 'Exports', count: 3 },
    { id: 'lint', title: 'Lint', count: null },
  ]
  it('names the lens rows and reads them back', () => {
    expect(lensRowId('lint')).toBe('lens:lint')
    expect(lensOfRow(lensRowId('lint'))).toBe('lint')
    expect(lensOfRow(NO_LENS)).toBeNull()
    expect(lensOfRow('split')).toBeUndefined()
  })
  it('offers no lens and each lens with its count, and chooses one', async () => {
    const choose = vi.fn()
    const view = render(
      h(
        LensFilterMenu,
        {
          lenses: lenses,
          chosen: null,
          run: { kind: 'idle' },
          choose: choose,
          visible: true,
          t: t,
        },
        { default: () => [] },
      ),
    )
    const trigger = view.getByRole('button', { name: 'Filter lens' })
    expect(trigger.textContent).toBe('Lens')
    expect(trigger.hasAttribute('data-active')).toBe(false)
    await act(() => {
      trigger.click()
    })
    const menu = within(document.body)
    expect(menu.getAllByRole('menuitem').map(row => row.textContent)).toEqual([
      'No lens',
      'Exports3',
      'Lint—',
    ])
    await act(() => {
      menu.getByRole('menuitem', { name: 'Lint—' }).click()
    })
    expect(choose).toHaveBeenCalledWith('lint')
    await act(() => {
      trigger.click()
    })
    await act(() => {
      menu.getByRole('menuitem', { name: 'No lens' }).click()
    })
    expect(choose).toHaveBeenLastCalledWith(null)
    await act(() => {
      trigger.click()
    })
    await act(async () => {
      await act(() =>
        fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' }),
      )
    })
    expect(document.body.querySelectorAll('[role="menuitem"]')).toHaveLength(0)
  })
  it('shows the chosen lens tinted with the files it keeps, its progress while it runs, and stays closed in a hidden tab', async () => {
    const view = render(
      h(
        LensFilterMenu,
        {
          lenses: lenses,
          chosen: lenses[0] ?? null,
          run: { kind: 'running', done: 2, total: 5 },
          choose: vi.fn(),
          visible: true,
          t: t,
        },
        { default: () => [] },
      ),
    )
    const trigger = view.getByRole('button', { name: 'Filter lens: Exports' })
    expect(trigger.hasAttribute('data-active')).toBe(true)
    expect(trigger.textContent).toBe('Exports2/5')
    await view.rerender(
      h(
        LensFilterMenu,
        {
          lenses: lenses,
          chosen: lenses[0] ?? null,
          run: { kind: 'running', done: null, total: null },
          choose: vi.fn(),
          visible: true,
          t: t,
        },
        { default: () => [] },
      ),
    )
    expect(trigger.textContent).toBe('Exports')
    await view.rerender(
      h(
        LensFilterMenu,
        {
          lenses: lenses,
          chosen: lenses[0] ?? null,
          run: { kind: 'ready', files: {} },
          choose: vi.fn(),
          visible: true,
          t: t,
        },
        { default: () => [] },
      ),
    )
    expect(trigger.textContent).toBe('Exports3')
    await view.rerender(
      h(
        LensFilterMenu,
        {
          lenses: lenses,
          chosen: lenses[1] ?? null,
          run: { kind: 'failed', code: 'x', message: 'y' },
          choose: vi.fn(),
          visible: false,
          t: t,
        },
        { default: () => [] },
      ),
    )
    expect(view.getByRole('button', { name: 'Filter lens: Lint' }).textContent).toBe('Lint')
    await act(() => {
      view.getByRole('button', { name: 'Filter lens: Lint' }).click()
    })
    expect(document.body.querySelectorAll('[role="menuitem"]')).toHaveLength(0)
  })
})
