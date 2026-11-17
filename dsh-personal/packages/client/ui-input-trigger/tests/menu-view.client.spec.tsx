import { h, nextTick } from 'vue'
// @vitest-environment jsdom
/**
 * MenuView rendering spec, props-direct: closed store
 * renders null, groups render in roster order under localized title rows
 * (unknown sources fall back to the raw name) with pending rows as skeleton
 * placeholders, pointer picks route (source, index) back without stealing
 * focus, the highlight is exposed through aria-activedescendant +
 * aria-selected, and the list height clamps to the space above the composer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, cleanup, act } from '@deepseek-ai/dsh-client-test-runtime/src/vue-test.ts'
import { fireEvent, screen } from '@testing-library/dom'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { zh as commonZh } from '@deepseek-ai/dsh-client-locale/src/locales/zh.ts'
import { zh } from '../src/client/locales.ts'
import type { InputTriggerCrumb, MenuState, TriggerHit } from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import { MenuView } from '../src/client/MenuView.tsx'
const hit: TriggerHit = {
  trigger: '/',
  query: 'g',
  quoted: false,
  position: 'leading',
  span: { start: 0, end: 2, draftRev: 1 },
}
const CLOSED: MenuState = { open: false, hit: null, generation: 0, groups: [], highlight: null }
function openState(partial?: Partial<MenuState>): MenuState {
  return {
    open: true,
    hit,
    generation: 1,
    groups: [
      { source: 'command', status: 'ready', items: [{ name: 'goal', description: 'Set up a goal', icon: 'file' }, { name: 'plan' }] },
      { source: 'skill', status: 'pending', items: [] },
    ],
    highlight: { source: 'command', index: 0 },
    ...partial,
  }
}
// jsdom has no scrollIntoView; the view calls it on the highlighted option.
const scrollIntoView = vi.fn()
beforeEach(() => {
  Element.prototype.scrollIntoView = scrollIntoView
  scrollIntoView.mockClear()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
// The framework-injected t seat, stubbed over the zh dictionaries (the
// default locale); the stub mirrors the LocaleRuntime key fallback, so an
// unknown source comes back verbatim (its raw name).
const t = makeTranslate(zh, commonZh)
function mount(state: MenuState, crumbs: ReadonlyMap<string, readonly InputTriggerCrumb[]> = new Map()) {
  const menu = createSnapshotStore<MenuState>(state)
  const headers = createSnapshotStore<ReadonlyMap<string, readonly InputTriggerCrumb[]>>(crumbs)
  const onPick = vi.fn()
  const onCrumb = vi.fn()
  const onHover = vi.fn()
  const onDismiss = vi.fn()
  const view = render(h(MenuView, { 'menu': menu, 'headers': headers, 'onPick': onPick, 'onCrumb': onCrumb, 'onHover': onHover, 'onDismiss': onDismiss, 't': t }))
  return { menu, headers, onPick, onCrumb, onHover, onDismiss, view }
}
/** The bounded menu shell: it owns the height clamp, the listbox scrolls inside it. */
function menuShell(): HTMLElement {
  const shell = document.querySelector('[data-trigger-menu]')
  if (!(shell instanceof HTMLElement))
    throw new Error('menu shell is not rendered')
  return shell
}
/** The non-interactive group title rows (role=presentation), in document order. */
function titles(container: HTMLElement): string[] {
  return [...container.querySelectorAll('div[role="presentation"][data-source]')]
    .map(el => el.textContent ?? '')
}
describe('MenuView', () => {
  it('renders null while closed and appears when the store opens', async () => {
    const { menu, view } = mount(CLOSED)
    await nextTick()
    expect(view.container.childElementCount).toBe(0)
    await act(() => { menu.set(openState()) })
    await nextTick()
    expect(screen.queryByRole('listbox')).not.toBeNull()
    await act(() => { menu.set(CLOSED) })
    await nextTick()
    expect(view.container.childElementCount).toBe(0)
  })
  it('renders ready groups as option rows and pending groups as two skeleton rows', async () => {
    mount(openState())
    const options = screen.getAllByRole('option')
    await nextTick()
    expect(options.map(o => o.textContent)).toEqual(['goalSet up a goal', 'plan'])
    await nextTick()
    // The icon token renders as an SVG glyph, not text.
    expect(options[0]?.querySelector('svg')).not.toBeNull()
    await nextTick()
    expect(options[1]?.querySelector('svg')).toBeNull()
    const status = screen.getByRole('status', { name: '正在加载…' })
    await nextTick()
    expect(status.children).toHaveLength(2)
  })
  it('renders a localized label as the title with the name as its alias, an icon component, and the description', async () => {
    const Glyph = ({ size = 16 }: {
      size?: number | undefined
    }) => h('svg', { 'data-glyph': 'plan', 'width': size, 'height': size })
    mount(openState({
      groups: [{
        source: 'command',
        status: 'ready',
        items: [
          { name: 'plan', label: '计划', description: '进入或退出计划模式', icon: Glyph, section: '添加' },
          { name: 'file', label: 'File', section: '添加' },
        ],
      }],
    }))
    const options = screen.getAllByRole('option')
    await nextTick()
    expect(options.map(o => o.textContent)).toEqual(['计划plan进入或退出计划模式', 'File'])
    await nextTick()
    expect(options[0]?.querySelector('[data-glyph="plan"]')?.getAttribute('width')).toBe('14')
    await nextTick()
    // A label that is the name in another letter case renders no alias.
    expect(options[1]?.querySelectorAll('span')).toHaveLength(1)
    await nextTick()
    expect(screen.getAllByText('添加')).toHaveLength(1)
  })
  it('keeps an opted-out source title hidden while its candidates are pending', async () => {
    mount(openState({
      groups: [{ source: 'reference', showGroupTitle: false, status: 'pending', items: [] }],
      highlight: null,
    }))
    await nextTick()
    expect(screen.queryByText('reference')).toBeNull()
    await nextTick()
    expect(screen.getByRole('status', { name: '正在加载…' })).toBeTruthy()
  })
  it('renders retained items instead of skeletons while a refinement is pending', async () => {
    mount(openState({
      groups: [{ source: 'command', status: 'pending', items: [{ name: 'goal' }] }],
      highlight: null,
    }))
    await nextTick()
    expect(screen.getAllByRole('option').map(o => o.textContent)).toEqual(['goal'])
    await nextTick()
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('titles each group with the localized source name, raw name for unknown sources, none for empty ready groups', async () => {
    const { view } = mount(openState({
      groups: [
        { source: 'command', status: 'ready', items: [{ name: 'goal' }] },
        { source: 'hollow', status: 'ready', items: [] },
        { source: 'mystery', status: 'ready', items: [{ name: 'x' }] },
        { source: 'skill', status: 'pending', items: [] },
      ],
    }))
    await nextTick()
    expect(titles(view.container)).toEqual(['指令', 'mystery', '技能'])
  })
  it('renders contiguous candidate sections once without changing option indexes', async () => {
    const { onPick } = mount(openState({
      groups: [{
        source: 'reference',
        status: 'ready',
        items: [
          { name: 'Folder · src/', section: '文件与文件夹' },
          { name: 'File · README.md', section: '文件与文件夹' },
          { name: 'Session · Research', section: '对话' },
        ],
      }],
      highlight: { source: 'reference', index: 0 },
    }))
    await nextTick()
    expect(screen.queryByText('reference')).toBeNull()
    await nextTick()
    expect(screen.getAllByText('文件与文件夹')).toHaveLength(1)
    await nextTick()
    expect(screen.getAllByText('对话')).toHaveLength(1)
    const options = screen.getAllByRole('option')
    await nextTick()
    expect(options.map(option => option.textContent)).toEqual([
      'Folder · src/',
      'File · README.md',
      'Session · Research',
    ])
    await act(() => { fireEvent.mouseDown(options[2]!) })
    await nextTick()
    expect(onPick).toHaveBeenCalledWith('reference', 2)
  })
  it('renders the drill chevron only on drillable rows and routes its own action', async () => {
    const { onPick } = mount(openState({
      groups: [{
        source: 'reference',
        status: 'ready',
        items: [
          { name: 'Folder · src/', drill: true },
          { name: 'File · README.md' },
        ],
      }],
      highlight: { source: 'reference', index: 0 },
    }))
    const chevrons = screen.getAllByRole('button', { name: '进入目录' })
    await nextTick()
    expect(chevrons).toHaveLength(1)
    // The chevron drills; the row body still settles the pick untouched.
    await act(() => { fireEvent.mouseDown(chevrons[0]!) })
    await nextTick()
    expect(onPick).toHaveBeenCalledWith('reference', 0, 'drill')
    await act(() => { fireEvent.mouseDown(screen.getAllByRole('option')[0]!) })
    await nextTick()
    expect(onPick).toHaveBeenCalledWith('reference', 0)
  })
  it('exposes the highlight via aria-activedescendant and aria-selected', async () => {
    mount(openState({ highlight: { source: 'command', index: 1 } }))
    const listbox = screen.getByRole('listbox')
    const options = screen.getAllByRole('option')
    await nextTick()
    expect(options[1]!.id).toBeTruthy()
    await nextTick()
    expect(listbox.getAttribute('aria-activedescendant')).toBe(options[1]!.id)
    await nextTick()
    expect(options[1]!.getAttribute('aria-selected')).toBe('true')
    await nextTick()
    expect(options[0]!.getAttribute('aria-selected')).toBe('false')
  })
  it('omits aria-activedescendant without a highlight', async () => {
    mount(openState({ highlight: null }))
    await nextTick()
    expect(screen.getByRole('listbox').getAttribute('aria-activedescendant')).toBeNull()
  })
  it('scrolls the highlighted option into view when the highlight moves', async () => {
    const { menu } = mount(openState())
    scrollIntoView.mockClear()
    await act(() => { menu.set(openState({ highlight: { source: 'command', index: 1 } })) })
    const options = screen.getAllByRole('option')
    await nextTick()
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' })
    await nextTick()
    expect(scrollIntoView.mock.instances.at(-1)).toBe(options[1])
  })
  it('caps the list height at the design maximum when the composer sits low enough', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ bottom: 800 } as DOMRect)
    mount(openState())
    await nextTick()
    expect(menuShell().style.maxHeight).toBe('400px')
  })
  it('clamps the list height to the space above the composer minus the header-clearing margin', async () => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ bottom: 200 } as DOMRect)
    mount(openState())
    await nextTick()
    expect(menuShell().style.maxHeight).toBe('116px')
  })
  it('re-fits the height when the window resizes', async () => {
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect')
    rect.mockReturnValue({ bottom: 800 } as DOMRect)
    mount(openState())
    await nextTick()
    expect(menuShell().style.maxHeight).toBe('400px')
    rect.mockReturnValue({ bottom: 100 } as DOMRect)
    await act(() => { window.dispatchEvent(new Event('resize')) })
    await nextTick()
    expect(menuShell().style.maxHeight).toBe('16px')
  })
  it('shows the bottom overflow hint until the list reaches its final row', async () => {
    mount(openState())
    const listbox = screen.getByRole('listbox')
    Object.defineProperties(listbox, {
      clientHeight: { configurable: true, value: 320 },
      scrollHeight: { configurable: true, value: 392 },
      scrollTop: { configurable: true, value: 0, writable: true },
    })
    await act(() => { fireEvent.scroll(listbox) })
    await nextTick()
    expect(menuShell().hasAttribute('data-overflow-below')).toBe(true)
    listbox.scrollTop = 72
    await act(() => { fireEvent.scroll(listbox) })
    await nextTick()
    expect(menuShell().hasAttribute('data-overflow-below')).toBe(false)
  })
  it('pointerdown outside the menu (no composer card ancestor) dismisses', async () => {
    const { onDismiss } = mount(openState())
    await act(() => { fireEvent.pointerDown(document.body) })
    await nextTick()
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
  it('pointerdown inside the list does not dismiss', async () => {
    const { onDismiss } = mount(openState())
    await act(() => { fireEvent.pointerDown(screen.getAllByRole('option')[0]!) })
    await nextTick()
    expect(onDismiss).not.toHaveBeenCalled()
  })
  it('pointerdown inside the surrounding composer card does not dismiss; outside it does', async () => {
    const menu = createSnapshotStore<MenuState>(openState())
    const onDismiss = vi.fn()
    render(h('div', { 'data-composer-card': '' }, [h(MenuView, { 'menu': menu, 'headers': createSnapshotStore<ReadonlyMap<string, readonly InputTriggerCrumb[]>>(new Map()), 'onPick': vi.fn(), 'onCrumb': vi.fn(), 'onHover': vi.fn(), 'onDismiss': onDismiss, 't': t }), h('button', { 'type': 'button', 'data-testid': 'composer-button' })]))
    await act(() => { fireEvent.pointerDown(screen.getByTestId('composer-button')) })
    await nextTick()
    expect(onDismiss).not.toHaveBeenCalled()
    await act(() => { fireEvent.pointerDown(document.body) })
    await nextTick()
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
  it('ignores a pointerdown whose target is not a DOM node', async () => {
    const { onDismiss } = mount(openState())
    const ev = new Event('pointerdown', { bubbles: true })
    Object.defineProperty(ev, 'target', { value: {} })
    document.dispatchEvent(ev)
    await nextTick()
    expect(onDismiss).not.toHaveBeenCalled()
  })
  it('closing the menu removes the dismiss listener', async () => {
    const { menu, onDismiss } = mount(openState())
    await act(() => { menu.set(CLOSED) })
    await act(() => { fireEvent.pointerDown(document.body) })
    await nextTick()
    expect(onDismiss).not.toHaveBeenCalled()
  })
  it('mousedown on a row picks (source, index) and prevents the focus steal', async () => {
    const { onPick } = mount(openState())
    const options = screen.getAllByRole('option')
    const notPrevented = await act(() => fireEvent.mouseDown(options[1]!))
    await nextTick()
    // fireEvent returns false when preventDefault was called.
    expect(notPrevented).toBe(false)
    await nextTick()
    expect(onPick).toHaveBeenCalledWith('command', 1)
  })
  it('pointer motion over a row routes hover; the highlighted row stays silent', async () => {
    const { onHover } = mount(openState())
    const options = screen.getAllByRole('option')
    await act(() => { fireEvent.mouseMove(options[1]!) })
    await nextTick()
    expect(onHover).toHaveBeenCalledWith('command', 1)
    onHover.mockClear()
    // Index 0 already holds the highlight: no hover round-trip.
    await act(() => { fireEvent.mouseMove(options[0]!) })
    await nextTick()
    expect(onHover).not.toHaveBeenCalled()
  })
  it('renders a source header as a breadcrumb above the list, current step last', async () => {
    mount(openState(), new Map([['command', [
      { label: 'Workspace', value: 'root' },
      { label: 'src', value: 'src' },
      { label: 'module1', value: 'module1', current: true },
    ]]]))
    const nav = screen.getByRole('navigation', { name: '目录导航' })
    await nextTick()
    expect([...nav.querySelectorAll('button')].map(button => button.textContent))
      .toEqual(['Workspace', 'src', 'module1'])
    await nextTick()
    // The listbox holds options alone; the header is its sibling, not a row.
    expect(screen.getByRole('listbox').contains(nav)).toBe(false)
  })
  it('mousedown on a crumb routes (source, index) without stealing focus; the current step is inert', async () => {
    const { onCrumb } = mount(openState(), new Map([['command', [
      { label: 'Workspace', value: 'root' },
      { label: 'src', value: 'src', current: true },
    ]]]))
    const crumbs = screen.getByRole('navigation', { name: '目录导航' }).querySelectorAll('button')
    await nextTick()
    expect(await act(() => fireEvent.mouseDown(crumbs[0]!))).toBe(false)
    await nextTick()
    expect(onCrumb).toHaveBeenCalledWith('command', 0)
    onCrumb.mockClear()
    await nextTick()
    expect(crumbs[1]!.disabled).toBe(true)
    await act(() => { fireEvent.mouseDown(crumbs[1]!) })
    await nextTick()
    expect(onCrumb).not.toHaveBeenCalled()
  })
  it('renders no header for a source that published no crumbs', async () => {
    mount(openState())
    await nextTick()
    expect(screen.queryByRole('navigation')).toBeNull()
  })
})
