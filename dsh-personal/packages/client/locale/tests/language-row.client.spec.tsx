// @vitest-environment jsdom
import { computed, createApp, h, nextTick, onScopeDispose, shallowRef } from 'vue'
import type { HostObservable, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/dom'
import { LanguageRow } from '../src/client/LanguageRow.tsx'
import type { LanguageRowComponentProps } from '../src/client/LanguageRow.tsx'
import { createLanguageRowStore } from '../src/client/settings-store.ts'

const mounted = new Set<() => void>()
afterEach(() => { for (const dispose of mounted) dispose(); mounted.clear() })
const OPTIONS = [{ id: 'zh', label: '中文' }, { id: 'en', label: 'English' }]

/** Component fixture owns subscriptions; real renderer lifecycle is tested separately. */
function bindSnapshotSelector<T>(source: HostObservable<T>): SnapshotSelectorHook<T> {
  return (selector) => {
    const state = shallowRef({ snapshot: source.getSnapshot() })
    onScopeDispose(source.subscribe(() => { state.value = { snapshot: source.getSnapshot() } }))
    return computed(() => selector(state.value.snapshot))
  }
}

async function mount(active = 'en') {
  const store = createLanguageRowStore().create()
  store.actions.sync(active, OPTIONS, 0)
  const setLocale = vi.fn()
  const unusedSeat = (): never => { throw new Error('Language row consumed an unrelated framework seat') }
  const title = shallowRef('Language')
  const props: LanguageRowComponentProps = {
    useSessions: unusedSeat, useSessionStatus: unusedSeat, usePanelInfo: unusedSeat,
    useSessionRetainInfo: unusedSeat, useResource: unusedSeat, useWorkspaces: unusedSeat,
    useRemoteAccess: unusedSeat, useSessionAccess: unusedSeat, useWorkspaceAccess: unusedSeat,
    useContextMenu: unusedSeat, useStore: bindSnapshotSelector(store), actions: store.actions,
    t: key => key === 'language.title' ? title.value : key, setLocale,
  }
  const container = document.createElement('div')
  document.body.append(container)
  const app = createApp({ setup: () => () => h(LanguageRow, props) })
  app.mount(container)
  const unmount = () => { app.unmount(); container.remove(); mounted.delete(unmount) }
  mounted.add(unmount)
  await nextTick()
  return { store, setLocale, title, unmount }
}

async function click(element: Element): Promise<void> { fireEvent.click(element); await nextTick() }

describe('LanguageRow', () => {
  it('shows the title and the active locale label on the selector pill', async () => {
    await mount('en')
    expect(screen.getByText('Language')).toBeDefined()
    expect(screen.getByRole('button', { name: /English/ }).getAttribute('aria-expanded')).toBe('false')
  })

  it('opens the menu, selects a locale, and closes', async () => {
    const b = await mount('en')
    const trigger = screen.getByRole('button', { name: /English/ })
    await click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    await click(screen.getByRole('menuitem', { name: '中文' }))
    expect(b.setLocale).toHaveBeenCalledWith('zh')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menuitem', { name: '中文' })).toBeNull()
  })

  it('closes on outside pointerdown without selecting', async () => {
    const b = await mount('en')
    await click(screen.getByRole('button', { name: /English/ }))
    expect(screen.getByRole('menuitem', { name: '中文' })).toBeDefined()
    fireEvent.pointerDown(document.body)
    await nextTick()
    expect(screen.queryByRole('menuitem', { name: '中文' })).toBeNull()
    expect(b.setLocale).not.toHaveBeenCalled()
  })

  it('follows store changes; an unknown active id falls back to the id itself', async () => {
    const b = await mount('en')
    b.store.actions.sync('zh', OPTIONS, 1)
    await nextTick()
    expect(screen.getByRole('button', { name: /中文/ })).toBeDefined()
    b.store.actions.sync('fr', OPTIONS, 2)
    await nextTick()
    expect(screen.getByRole('button', { name: /fr/ })).toBeDefined()
  })

  it('refreshes translated copy and removes an open portal on unmount', async () => {
    const b = await mount()
    b.title.value = '语言'
    await nextTick()
    expect(screen.getByText('语言')).toBeDefined()
    await click(screen.getByRole('button', { name: /English/ }))
    expect(screen.getByRole('menuitem', { name: '中文' })).toBeDefined()
    b.unmount()
    await nextTick()
    expect(screen.queryByRole('menuitem', { name: '中文' })).toBeNull()
  })
})
