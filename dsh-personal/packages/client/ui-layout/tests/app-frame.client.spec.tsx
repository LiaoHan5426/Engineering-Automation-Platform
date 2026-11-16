// @vitest-environment jsdom
import { computed, h, shallowRef } from 'vue'
/** Frame interactions with a real store and explicitly driven browser measurements. */
import type { RenderOpts } from '@deepseek-ai/dsh-client-ui-slots'
import { bindSnapshotSelector } from './vue-fixture.ts'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from './vue-fixture.ts'
import { AppFrame } from '../src/client/AppFrame.tsx'
import type { AppFrameProps } from '../src/client/AppFrame.tsx'
import type { MainPanelId, RightbarOwnerProps, SidebarOwnerProps } from '../src/client/index.ts'
import { createLayoutStore } from '../src/client/stores.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'

let selectedSession: SessionId | undefined
let selectedSessionTitle: string | undefined
let workspacesReady = true
let observers: ResizeObserverStub[]
class ResizeObserverStub {
  disconnected = false
  constructor(private callback: ResizeObserverCallback) { observers.push(this) }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void { this.disconnected = true }
  fire(): void { this.callback([], this) }
}

let frameWidth: number
let animationFrames: Map<number, FrameRequestCallback>
let nextFrame: number
let originalTitle: string
let foldedLandscape: SnapshotStore<boolean>
const restoreProperties: (() => void)[] = []

function replaceProperty<T extends object, K extends keyof T>(target: T, key: K, value: T[K]): void {
  const descriptor = Object.getOwnPropertyDescriptor(target, key)
  restoreProperties.push(() => {
    if (descriptor === undefined) Reflect.deleteProperty(target, key)
    else Object.defineProperty(target, key, descriptor)
  })
  Object.defineProperty(target, key, { configurable: true, writable: true, value })
}

/** Flush one browser frame without depending on the worker's timer cadence. */
function flushFrames(): void {
  for (const [id, callback] of [...animationFrames]) {
    if (!animationFrames.delete(id)) continue
    callback(0)
  }
}

async function resize(width: number): Promise<void> {
  frameWidth = width
  await act(async () => {
    for (const observer of observers) if (!observer.disconnected) observer.fire()
    flushFrames()
  })
}

async function mountFrame(windowWidth = frameWidth, content?: AppFrameProps['renderSlot']) {
  vi.stubGlobal('innerWidth', windowWidth)
  const instance = createLayoutStore().create()
  const slotCalls: { key: string; props: object; options: RenderOpts | undefined }[] = []
  const renderSlot: AppFrameProps['renderSlot'] = (key, owner, options) => {
    slotCalls.push({ key, props: owner, options })
    return content?.(key, owner, options) ?? h('div', { 'data-testid': `${key}-content`, 'data-entry-key': options?.entryKey })
  }
  const revision = shallowRef(0)
  const useSessions: AppFrameProps['useSessions'] = sel => computed(() => { revision.value; return sel({
    ids: selectedSession === undefined ? [] : [selectedSession],
    byId: selectedSession === undefined ? {} : {
      [selectedSession]: {
        id: selectedSession, displayTitle: 'Test', running: false, retainedBy: { mainView: 1 }, blank: false, updatedAt: 1,
        ...(selectedSessionTitle === undefined ? {} : { title: selectedSessionTitle }),
      },
    },
    phase: 'ready',
    projectionsBySession: {},
  }) })
  const useStore = bindSnapshotSelector(instance)
  const usePanelInfo = bindSnapshotSelector({
    getSnapshot: () => instance.getSnapshot().panelInfo,
    subscribe: listener => instance.subscribe(listener),
  })
  const unusedSeat = (): never => { throw new Error('Frame unexpectedly consumed an unrelated framework seat') }
  const props: AppFrameProps = {
    useStore, actions: instance.actions, renderSlot, useSessions, usePanelInfo,
    useFoldedLandscape: bindSnapshotSelector(foldedLandscape),
    useRemoteAccess: unusedSeat, useSessionAccess: unusedSeat, useWorkspaceAccess: unusedSeat,
    useSessionRetainInfo: unusedSeat, useSessionStatus: unusedSeat,
    useResource: unusedSeat, useContextMenu: unusedSeat,
    useWorkspaces: selector => computed(() => selector({
      items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle',
      phase: workspacesReady ? 'ready' : 'pending', error: null,
    })),
    t: key => key === 'brand.localBuild' ? 'DSH Local Build' : key,
  }
  const element = () => h(AppFrame, props)
  const utils = await render(element)
  const frame = utils.container.firstElementChild as HTMLElement
  return {
    ...utils, instance, frame, slotCalls,
    rerenderFrame: async () => { revision.value++; await utils.rerender() },
    rightOwner: () => slotCalls.findLast(c => c.key === 'rightbar')!.props as RightbarOwnerProps,
    sidebarOwner: () => slotCalls.findLast(c => c.key === 'sidebar')!.props as SidebarOwnerProps,
  }
}

/* The template delegates the squeeze to the grid (jsdom does no layout, so
   specs read the specified tracks): [sidebar px, rightbar growth limit].
   The centre's protected minimum must accompany an open right track. */
function tracks(frame: HTMLElement): number[] {
  const match = /^([\d.]+)px minmax\((0|400)px, 1fr\) minmax\(0px, ([\d.]+)px\)$/.exec(frame.style.gridTemplateColumns)
  if (match === null) throw new Error(`unexpected template: ${frame.style.gridTemplateColumns}`)
  const rightbar = Number(match[3])
  if ((match[2] === '400') !== (rightbar > 0)) throw new Error(`centre minimum out of step: ${frame.style.gridTemplateColumns}`)
  return [Number(match[1]), rightbar]
}

function handleFor(frame: HTMLElement, side: 'sidebar' | 'rightbar'): HTMLElement {
  const handle = frame.querySelector<HTMLElement>(`[data-side="${side}"]`)
  if (handle === null) throw new Error(`missing ${side} resize handle`)
  return handle
}

async function pointer(handle: Element, type: string, clientX: number, pointerId = 1, button = 0): Promise<void> {
  await act(async () => { handle.dispatchEvent(new PointerEvent(type, { pointerId, clientX, button, bubbles: true })) })
}

async function drag(handle: Element, fromX: number, toX: number): Promise<void> {
  await pointer(handle, 'pointerdown', fromX)
  await pointer(handle, 'pointermove', toX)
  await act(flushFrames)
  await pointer(handle, 'pointerup', toX)
}

beforeEach(() => {
  originalTitle = document.title
  frameWidth = 1920
  selectedSession = 's-test' as SessionId
  selectedSessionTitle = undefined
  workspacesReady = true
  observers = []
  animationFrames = new Map()
  nextFrame = 1
  vi.stubEnv('DSH_CLIENT_TITLE', undefined)
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  foldedLandscape = createSnapshotStore(false)
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = nextFrame++
    animationFrames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => { animationFrames.delete(id) })
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(() => ({
    width: frameWidth, height: 1080, top: 0, left: 0, right: frameWidth, bottom: 1080,
    x: 0, y: 0, toJSON: () => ({}),
  }))
  // jsdom has no pointer capture. Each element retains the actual pointer id,
  // and teardown restores absent methods as well as existing descriptors.
  const captured = new WeakMap<Element, number>()
  replaceProperty(Element.prototype, 'setPointerCapture', function (this: Element, id: number) { captured.set(this, id) })
  replaceProperty(Element.prototype, 'releasePointerCapture', function (this: Element) { captured.delete(this) })
  replaceProperty(Element.prototype, 'hasPointerCapture', function (this: Element, id: number) { return captured.get(this) === id })
})

afterEach(() => {
  try {
    cleanup()
  } finally {
    delete document.documentElement.dataset.platform
    for (const restore of restoreProperties.splice(0).reverse()) restore()
    document.title = originalTitle
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  }
})

describe('AppFrame', () => {
  it('localizes the product title without a configured build title', async () => {
    await mountFrame()
    expect(document.title).toBe('DSH Local Build')
  })

  it('follows the selected durable Session title', async () => {
    vi.stubEnv('DSH_CLIENT_TITLE', 'Product')
    selectedSessionTitle = 'First'
    const { rerenderFrame } = await mountFrame()
    expect(document.title).toBe('First — Product')
    selectedSessionTitle = 'Revised'
    await rerenderFrame()
    expect(document.title).toBe('Revised — Product')
    selectedSession = undefined
    await rerenderFrame()
    expect(document.title).toBe('Product')
  })

  it('renders owner props for the default sidebar and prospective right panel', async () => {
    const { frame, rightOwner, sidebarOwner, slotCalls } = await mountFrame()
    expect(tracks(frame)).toEqual([280, 0])
    expect(sidebarOwner()).toEqual({ collapsed: false, width: 280, drawer: false })
    expect(rightOwner()).toEqual({ width: 864, viewportWidth: 1920, canShow: true })
    expect(slotCalls.find(c => c.key === 'main')).toEqual({ key: 'main', props: {}, options: { entryKey: 'conversation' } })
  })

  it('renders the column and bottom outlets without a current Session', async () => {
    selectedSession = undefined
    const { frame, getByTestId } = await mountFrame()
    expect(getByTestId('main-content').getAttribute('data-entry-key')).toBe('conversation')
    expect(getByTestId('sidebar-content')).toBeTruthy()
    expect(getByTestId('rightbar-content')).toBeTruthy()
    expect(getByTestId('shell.bottom-content').parentElement?.hasAttribute('data-shell-bottom')).toBe(true)
    expect(tracks(frame)).toEqual([280, 0])
  })

  it('renders both occupants before workspace baselines settle', async () => {
    workspacesReady = false
    const { getByTestId } = await mountFrame()
    expect(getByTestId('main-content').getAttribute('data-entry-key')).toBe('conversation')
    expect(getByTestId('rightbar-content')).toBeTruthy()
  })

  it.each([1920, 390])('keeps Windows caption controls mounted at %ipx with a zero-width collapsed column', async (width) => {
    document.documentElement.setAttribute('data-windows-titlebar', '')
    try {
      const { frame, instance, sidebarOwner, getByTestId, queryByTestId } = await mountFrame()
      if (width < 1024) await resize(width)
      else await act(async () => { instance.actions.toggleSidebar() })
      expect(tracks(frame)[0]).toBe(0)
      expect(sidebarOwner()).toMatchObject({ collapsed: true, width: 0, drawer: false })
      expect(getByTestId('sidebar-content')).toBeTruthy()
      expect(getByTestId('sidebar-content').closest('[inert]')).toBeNull()
      // The caption row keeps the reopen controls; the darwin-only
      // shell.leading seat must not mount a duplicate set.
      expect(queryByTestId('shell.leading-content')).toBeNull()
    } finally {
      document.documentElement.removeAttribute('data-windows-titlebar')
    }
  })

  it('keeps the closed sidebar mounted at its 56px rail without a handle', async () => {
    const { frame, instance, sidebarOwner, getByTestId, queryByTestId } = await mountFrame()
    await act(async () => { instance.actions.toggleSidebar() })
    expect(tracks(frame)).toEqual([56, 0])
    expect(sidebarOwner()).toEqual({ collapsed: true, width: 56, drawer: false })
    expect(getByTestId('sidebar-content')).toBeTruthy()
    expect(frame.querySelector('[data-side="sidebar"]')).toBeNull()
    // The rail keeps the window chrome housed: no shell.leading seat.
    expect(queryByTestId('shell.leading-content')).toBeNull()
    expect(frame.querySelector('[data-shell-leading-band]')).toBeNull()
  })

  it('mounts the shell.leading seat only while the darwin collapse hides the column', async () => {
    document.documentElement.dataset.platform = 'darwin'
    const { frame, instance, sidebarOwner, queryByTestId } = await mountFrame()
    // The frame declares no window drag of its own: every chrome row owns its
    // run (ui-sidebar, ui-dockkit, ui-conversation, ui-plugin-manager).
    expect(frame.querySelector('[data-shell-leading-band]')).toBeNull()
    expect(queryByTestId('shell.leading-content')).toBeNull()
    await act(async () => { instance.actions.toggleSidebar() })
    expect(tracks(frame)).toEqual([0, 0])
    expect(sidebarOwner()).toEqual({ collapsed: true, width: 0, drawer: false })
    expect(frame.querySelector('[data-shell-leading]')).not.toBeNull()
    expect(queryByTestId('shell.leading-content')).toBeTruthy()
    await act(async () => { instance.actions.toggleSidebar() })
    expect(queryByTestId('shell.leading-content')).toBeNull()
  })

  it('switches only the keyed main outlet when the active panel changes', async () => {
    selectedSessionTitle = 'Session title'
    const { instance, frame, slotCalls, getByTestId } = await mountFrame()
    const sessionId = selectedSession
    const layoutInfo = instance.getSnapshot().layoutInfo
    for (const panelId of ['panel-a' as MainPanelId, 'panel-b' as MainPanelId, null]) {
      slotCalls.length = 0
      await act(async () => { instance.actions.selectPanel(panelId) })
      expect(slotCalls).toEqual([{ key: 'main', props: {}, options: { entryKey: panelId ?? 'conversation' } }])
      expect(getByTestId('main-content').getAttribute('data-entry-key')).toBe(panelId ?? 'conversation')
      expect(instance.getSnapshot().panelInfo).toEqual({ activePanelId: panelId })
      expect(instance.getSnapshot().layoutInfo).toBe(layoutInfo)
      expect(tracks(frame)).toEqual([280, 0])
      expect(selectedSession).toBe(sessionId)
      expect(document.title).toBe(panelId === null ? 'Session title — DSH Local Build' : 'DSH Local Build')
    }
  })
})

describe('AppFrame normal width concessions', () => {
  it('centers the sidebar while folded in landscape and restores its width without remounting', async () => {
    frameWidth = 951
    const { frame, instance, sidebarOwner, getByTestId, unmount } = await mountFrame()
    await act(async () => { instance.actions.setSidebar(360); instance.actions.toggleSidebar() })
    const sidebar = getByTestId('sidebar-content')
    expect(tracks(frame)[0]).toBe(360)
    await fireEvent.transitionEnd(frame, { propertyName: 'grid-template-columns' })
    await act(async () => { foldedLandscape.set(true) })
    expect(tracks(frame)).toEqual([475.5, 0])
    expect(frame.dataset.animating).toBe('true')
    expect(sidebarOwner()).toEqual({ collapsed: false, width: 475.5, drawer: false })
    expect(frame.querySelector('[data-side="sidebar"]')).toBeNull()
    expect(getByTestId('sidebar-content')).toBe(sidebar)
    await act(async () => { instance.actions.toggleSidebar() })
    expect(tracks(frame)[0]).toBe(56)
    await resize(767)
    expect(frame.dataset.animating).toBeUndefined()
    await act(async () => { instance.actions.toggleSidebar() })
    expect(sidebarOwner()).toEqual({ collapsed: false, width: 360, drawer: true })
    await resize(951)
    await act(async () => { instance.actions.toggleSidebar() })
    expect(tracks(frame)[0]).toBe(475.5)
    await fireEvent.transitionEnd(frame, { propertyName: 'grid-template-columns' })
    await act(async () => { foldedLandscape.set(false) })
    expect(tracks(frame)[0]).toBe(360)
    expect(frame.dataset.animating).toBe('true')
    expect(frame.querySelector('[data-side="sidebar"]')).not.toBeNull()
    expect(instance.getSnapshot().layoutInfo.sidebar).toBe(360)
    unmount()
  })

  it('measures the frame, not the window, before choosing the first-open preference', async () => {
    frameWidth = 1000
    const { instance, rightOwner } = await mountFrame(1920)
    expect(instance.getSnapshot().layoutInfo.viewportWidth).toBe(1000)
    expect(rightOwner()).toEqual({ width: 450, viewportWidth: 1000, canShow: true })
    await act(async () => { instance.actions.openRightbar(true, false) })
    expect(instance.getSnapshot().layoutInfo.rightbar).toBe(450)
    await resize(1920)
    expect(rightOwner().width).toBe(450)
  })

  it('shrinks the right panel to 300px, drops its track, and only then squeezes center', async () => {
    const { frame, instance, rightOwner } = await mountFrame()
    await act(async () => { instance.actions.setSidebar(420); instance.actions.openRightbar(true, false) })
    await resize(1200)
    // The template carries the ratio-clamped preference; the panel (rightOwner
    // width) reports the resolved squeeze.
    expect(tracks(frame)).toEqual([420, 840])
    expect(rightOwner()).toEqual({ width: 380, viewportWidth: 1200, canShow: true })
    await resize(1120)
    expect(tracks(frame)).toEqual([420, 784])
    await resize(1119)
    expect(tracks(frame)).toEqual([420, 0])
    expect(rightOwner()).toEqual({ width: 0, viewportWidth: 1119, canShow: false })
    expect(frame.querySelector('[data-side="rightbar"]')).toBeNull()
    expect(instance.getSnapshot().layoutInfo).toMatchObject({ rightbarShown: true, rightbar: 864 })
    await act(async () => { instance.actions.closeRightbar() })
    await resize(455)
    expect(tracks(frame)).toEqual([0, 0])
    await resize(1920)
    expect(tracks(frame)).toEqual([420, 0])
  })

  it('uses the post-collapse left rail to permit a narrow first opening', async () => {
    frameWidth = 800
    const { frame, instance, rightOwner } = await mountFrame()
    await act(async () => { instance.actions.toggleSidebar() })
    expect(tracks(frame)).toEqual([280, 0])
    expect(rightOwner()).toEqual({ width: 344, viewportWidth: 800, canShow: true })
    await act(async () => { instance.actions.openRightbar(true, false) })
    expect(tracks(frame)).toEqual([56, 360])
    expect(instance.getSnapshot().layoutInfo).toMatchObject({ narrowExpanded: false, rightbar: 360 })
    expect(rightOwner().canShow).toBe(true)
  })

  it.each([[768, 312, true], [767, 345, true], [700, 300, true], [699, 0, false]] as const)('reports eligibility at %ipx', async (width, rightbar, canShow) => {
    frameWidth = width
    const { instance, rightOwner } = await mountFrame()
    await act(async () => { instance.actions.toggleSidebar() })
    expect(rightOwner()).toEqual({ width: rightbar, viewportWidth: width, canShow })
  })

  it('does not anticipate another left collapse after the right panel is already shown', async () => {
    frameWidth = 800
    const { instance, rightOwner } = await mountFrame()
    await act(async () => { instance.actions.openRightbar(true, false); instance.actions.toggleSidebar() })
    expect(rightOwner().canShow).toBe(false)
  })

  it('auto-collapses only below 1024px and preserves the wide sidebar preference', async () => {
    const { frame, instance } = await mountFrame()
    await act(async () => { instance.actions.setSidebar(400) })
    await resize(1024)
    expect(tracks(frame)[0]).toBe(400)
    await resize(1023)
    expect(tracks(frame)[0]).toBe(56)
    await act(async () => { instance.actions.toggleSidebar() })
    expect(tracks(frame)[0]).toBe(400)
    await resize(980)
    expect(tracks(frame)[0]).toBe(400)
    await act(async () => { instance.actions.toggleSidebar() })
    expect(tracks(frame)[0]).toBe(56)
    await resize(1920)
    expect(tracks(frame)[0]).toBe(400)
  })

  it('re-expands a wide-closed sidebar at the default width while narrow', async () => {
    const { frame, instance } = await mountFrame()
    await act(async () => { instance.actions.toggleSidebar() })
    await resize(980)
    await act(async () => { instance.actions.toggleSidebar() })
    expect(tracks(frame)[0]).toBe(280)
    expect(instance.getSnapshot().layoutInfo.sidebar).toBe(0)
  })
})

describe('AppFrame right panel presentation', () => {
  it('releases the fullscreen track with the instant marker while clearing fullscreen', async () => {
    const { frame, instance } = await mountFrame()
    await act(async () => { instance.actions.openRightbar(true, true) })
    expect(tracks(frame)).toEqual([280, 864])
    await act(async () => { instance.actions.closeRightbar() })
    expect(tracks(frame)).toEqual([280, 0])
    expect(frame.dataset.rightbarFullscreen).toBeUndefined()
    expect(frame.dataset.rightbarInstant).toBe('true')
    expect(frame.querySelector('[data-side="rightbar"]')).toBeNull()
    await act(async () => { instance.actions.closeRightbar() })
    expect(frame.dataset.rightbarInstant).toBe('true')
  })

  it('marks restoration instant without suppressing the following normal close', async () => {
    const { frame, instance } = await mountFrame()
    await act(async () => { instance.actions.openRightbar(true, true) })
    await act(async () => { instance.actions.openRightbar(true, false) })
    expect(tracks(frame)).toEqual([280, 864])
    expect(frame.dataset.rightbarFullscreen).toBeUndefined()
    expect(frame.dataset.rightbarInstant).toBe('true')
    await act(async () => { instance.actions.closeRightbar() })
    expect(tracks(frame)).toEqual([280, 0])
    expect(frame.dataset.rightbarFullscreen).toBeUndefined()
    expect(frame.dataset.rightbarInstant).toBeUndefined()
  })

  it.each(['setSidebar', 'toggleSidebar', 'setRightbar', 'viewport', 'open'] as const)('reenables normal transitions after %s', async (action) => {
    const { frame, instance } = await mountFrame()
    await act(async () => { instance.actions.openRightbar(true, true); instance.actions.closeRightbar() })
    expect(frame.dataset.rightbarInstant).toBe('true')
    await act(async () => {
      if (action === 'viewport') await resize(1800)
      else if (action === 'open') instance.actions.openRightbar(true, false)
      else if (action === 'toggleSidebar') instance.actions.toggleSidebar()
      else instance.actions[action](350)
    })
    expect(frame.dataset.rightbarInstant).toBeUndefined()
    expect(frame.dataset.rightbarFullscreen).toBeUndefined()
  })

  it('eases tracks only across a discrete toggle, never for viewport updates', async () => {
    const { frame, instance } = await mountFrame()
    expect(frame.dataset.animating).toBeUndefined()
    // Window-driven track updates follow the frame edge instantly.
    await resize(1600)
    expect(frame.dataset.animating).toBeUndefined()
    await act(async () => { instance.actions.toggleSidebar() })
    expect(frame.dataset.animating).toBe('true')
    // Foreign transition ends (e.g. the handle's left) do not settle it...
    await act(async () => {
      frame.dispatchEvent(Object.assign(new Event('transitionend'), { propertyName: 'left' }))
    })
    expect(frame.dataset.animating).toBe('true')
    // ...the track transition's own end does.
    await act(async () => {
      frame.dispatchEvent(Object.assign(new Event('transitionend'), { propertyName: 'grid-template-columns' }))
    })
    expect(frame.dataset.animating).toBeUndefined()
  })

  it('lands the responsive auto-collapse instantly, keeping user toggles eased', async () => {
    const { frame, instance } = await mountFrame()
    // Shrinking across the breakpoint flips the collapse in the same update as
    // the viewport change: no easing, the tracks land with the window edge.
    await resize(900)
    expect(frame.dataset.sidebarCollapsed).toBe('true')
    expect(frame.dataset.animating).toBeUndefined()
    // A user toggle at the now-stable viewport still eases.
    await act(async () => { instance.actions.toggleSidebar() })
    expect(frame.dataset.animating).toBe('true')
  })

  it('skips drawer entry motion from a collapsed rail while retaining explicit toggle motion', async () => {
    const { frame, instance } = await mountFrame()
    await resize(768)
    expect(frame.dataset.sidebarInstant).toBeUndefined()
    await resize(767)
    expect(frame.dataset.sidebarInstant).toBe('true')
    await resize(766)
    expect(frame.dataset.sidebarInstant).toBe('true')
    await act(async () => { instance.actions.toggleSidebar() })
    expect(frame.dataset.sidebarInstant).toBeUndefined()
    await act(async () => { instance.actions.toggleSidebar() })
    expect(frame.dataset.sidebarInstant).toBeUndefined()
    await resize(768)
    await resize(767)
    expect(frame.dataset.sidebarInstant).toBe('true')
  })

  it('retains drawer entry motion when resizing an expanded sidebar', async () => {
    const { frame } = await mountFrame()
    await resize(767)
    expect(frame.dataset.sidebarCollapsed).toBe('true')
    expect(frame.dataset.sidebarInstant).toBeUndefined()
  })

  it('animates the rightbar track flip and settles by timeout without a transition end', async () => {
    vi.useFakeTimers()
    try {
      const { frame, instance } = await mountFrame()
      await act(async () => { instance.actions.openRightbar(true, false) })
      expect(frame.dataset.animating).toBe('true')
      // Covered or reduced-motion frames fire no transitionend; the timeout settles.
      await act(async () => { vi.advanceTimersByTime(600) })
      expect(frame.dataset.animating).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps fullscreen suppression independent from resetting the instant marker', async () => {
    const { frame, instance } = await mountFrame()
    await act(async () => { instance.actions.openRightbar(true, true) })
    await act(async () => { instance.actions.setSidebar(350) })
    expect(frame.dataset.rightbarInstant).toBeUndefined()
    expect(frame.dataset.rightbarFullscreen).toBe('true')
  })

  it('preserves normal tracks through fullscreen and hides the outer resize handle', async () => {
    const { frame, instance, rightOwner } = await mountFrame()
    await act(async () => { instance.actions.openRightbar(true, false) })
    expect(tracks(frame)).toEqual([280, 864])
    expect(handleFor(frame, 'rightbar').style.left).toBe('1056px')
    await act(async () => { instance.actions.openRightbar(true, true) })
    expect(tracks(frame)).toEqual([280, 864])
    expect(rightOwner().width).toBe(864)
    expect(frame.dataset.rightbarFullscreen).toBe('true')
    expect(frame.querySelector('[data-side="rightbar"]')).toBeNull()
    await act(async () => { instance.actions.openRightbar(true, false) })
    expect(tracks(frame)).toEqual([280, 864])
    expect(handleFor(frame, 'rightbar').style.left).toBe('1056px')
    expect(frame.dataset.rightbarFullscreen).toBeUndefined()
    await act(async () => { instance.actions.closeRightbar() })
    expect(tracks(frame)).toEqual([280, 0])
    expect(frame.querySelector('[data-side="rightbar"]')).toBeNull()
    expect(frame.dataset.rightbarFullscreen).toBeUndefined()
  })

  it('inserts a fullscreen track and its transition-suppression marker in the same render', async () => {
    const { frame, instance } = await mountFrame()
    expect(tracks(frame)).toEqual([280, 0])
    expect(frame.dataset.rightbarFullscreen).toBeUndefined()
    await act(async () => { instance.actions.openRightbar(true, true) })
    expect(tracks(frame)).toEqual([280, 864])
    expect(frame.dataset.rightbarFullscreen).toBe('true')
    expect(frame.querySelector('[data-side="rightbar"]')).toBeNull()
    await act(async () => { instance.actions.openRightbar(true, false) })
    expect(tracks(frame)).toEqual([280, 864])
    expect(frame.dataset.rightbarFullscreen).toBeUndefined()
  })

  it('retains fullscreen without a track when normal columns cannot fit', async () => {
    frameWidth = 699
    const { frame, instance, rightOwner } = await mountFrame()
    await act(async () => { instance.actions.openRightbar(false, true) })
    expect(tracks(frame)).toEqual([0, 0])
    expect(rightOwner()).toEqual({ width: 0, viewportWidth: 699, canShow: false })
    expect(instance.getSnapshot().layoutInfo.rightbarShown).toBe(true)
    expect(frame.querySelector('[data-side="rightbar"]')).toBeNull()
  })

  it('keeps resolved panel width independent of the requested track', async () => {
    const { frame, instance, rightOwner } = await mountFrame()
    await act(async () => { instance.actions.openRightbar(false, false) })
    await resize(1100)
    expect(tracks(frame)).toEqual([280, 0])
    expect(rightOwner().width).toBe(420)
    await drag(handleFor(frame, 'rightbar'), 680, 690)
    expect(instance.getSnapshot().layoutInfo.rightbar).toBe(410)
    expect(rightOwner().width).toBe(410)
    expect(tracks(frame)[1]).toBe(0)
  })
})

describe('AppFrame pointer resizing', () => {
  it('updates columns during the gesture and freezes the drag-start width', async () => {
    const { frame, instance } = await mountFrame()
    const handle = handleFor(frame, 'sidebar')
    await pointer(handle, 'pointerdown', 280)
    expect(frame.dataset.dragging).toBe('true')
    await pointer(handle, 'pointermove', 320)
    await pointer(handle, 'pointermove', 340)
    expect(animationFrames.size).toBe(1)
    await act(flushFrames)
    expect(tracks(frame)[0]).toBe(340)
    await pointer(handle, 'pointermove', 360)
    await act(flushFrames)
    expect(tracks(frame)[0]).toBe(360)
    await pointer(handle, 'pointerup', 360)
    expect(instance.getSnapshot().layoutInfo.sidebar).toBe(360)
    expect(frame.dataset.dragging).toBeUndefined()
    expect(handle.hasPointerCapture(1)).toBe(false)
  })

  it('starts a conceded right drag at its actual width, shared by panel and track', async () => {
    const { frame, instance, rightOwner } = await mountFrame()
    await act(async () => { instance.actions.openRightbar(true, false) })
    await resize(1100)
    const handle = handleFor(frame, 'rightbar')
    expect(rightOwner().width).toBe(420)
    expect(tracks(frame)[1]).toBe(770)
    expect(handle.style.left).toBe('680px')
    await drag(handle, 680, 690)
    expect(instance.getSnapshot().layoutInfo.rightbar).toBe(410)
    expect(rightOwner().width).toBe(410)
    expect(tracks(frame)[1]).toBe(410)
    expect(handle.style.left).toBe('690px')
  })

  it('widens to the 70% limit and shrinks to 300px through pointer input', async () => {
    frameWidth = 3000
    const { frame, instance, rightOwner } = await mountFrame()
    await act(async () => { instance.actions.toggleSidebar(); instance.actions.openRightbar(true, false) })
    await drag(handleFor(frame, 'rightbar'), 1650, 0)
    expect(rightOwner().width).toBe(2100)
    expect(tracks(frame)[1]).toBe(2100)
    await drag(handleFor(frame, 'rightbar'), 900, 3000)
    expect(rightOwner().width).toBe(300)
    expect(tracks(frame)[1]).toBe(300)
  })

  it('commits the pointerup coordinate and cancels its pending animation frame', async () => {
    const { frame, instance } = await mountFrame()
    const handle = handleFor(frame, 'sidebar')
    await pointer(handle, 'pointerdown', 280)
    await pointer(handle, 'pointermove', 320)
    await pointer(handle, 'pointerup', 360)
    expect(instance.getSnapshot().layoutInfo.sidebar).toBe(360)
    expect(animationFrames.size).toBe(0)
    await act(flushFrames)
    expect(instance.getSnapshot().layoutInfo.sidebar).toBe(360)
  })

  it('ignores uncaptured motion, secondary buttons, and a second pointer', async () => {
    const { frame, instance } = await mountFrame()
    const handle = handleFor(frame, 'sidebar')
    await pointer(handle, 'pointermove', 500, 9)
    await pointer(handle, 'pointerup', 500, 9)
    await pointer(handle, 'pointercancel', 500, 9)
    await pointer(handle, 'pointerdown', 500, 9, 2)
    expect(frame.dataset.dragging).toBeUndefined()
    await pointer(handle, 'pointerdown', 280)
    await pointer(handle, 'pointerdown', 500, 9)
    await pointer(handle, 'pointermove', 500, 9)
    await pointer(handle, 'pointerup', 500, 9)
    expect(animationFrames.size).toBe(0)
    expect(instance.getSnapshot().layoutInfo.sidebar).toBe(280)
    await pointer(handle, 'pointerup', 300)
    expect(instance.getSnapshot().layoutInfo.sidebar).toBe(300)
  })

  it.each(['pointercancel', 'lostpointercapture'])('ends %s without committing queued motion', async (event) => {
    const { frame, instance } = await mountFrame()
    const handle = handleFor(frame, 'sidebar')
    await pointer(handle, 'pointerdown', 280)
    await pointer(handle, 'pointermove', 340)
    if (event === 'lostpointercapture') handle.releasePointerCapture(1)
    await pointer(handle, event, 340)
    await act(flushFrames)
    expect(instance.getSnapshot().layoutInfo.sidebar).toBe(280)
    expect(animationFrames.size).toBe(0)
    expect(frame.dataset.dragging).toBeUndefined()
    expect(handle.hasPointerCapture(1)).toBe(false)
  })

  it.each(['fullscreen', 'close', 'unmount'])('cancels a pending drag on %s', async (change) => {
    const { frame, instance, unmount } = await mountFrame()
    await act(async () => { instance.actions.openRightbar(true, false) })
    const handle = handleFor(frame, 'rightbar')
    await pointer(handle, 'pointerdown', 1056)
    await pointer(handle, 'pointermove', 1000)
    await act(async () => {
      if (change === 'fullscreen') instance.actions.openRightbar(true, true)
      else if (change === 'close') instance.actions.closeRightbar()
      else unmount()
    })
    const settled = instance.getSnapshot()
    await act(flushFrames)
    expect(instance.getSnapshot()).toBe(settled)
    expect(instance.getSnapshot().layoutInfo.rightbar).toBe(864)
    expect(animationFrames.size).toBe(0)
    expect(handle.hasPointerCapture(1)).toBe(false)
    if (change !== 'unmount') expect(frame.dataset.dragging).toBeUndefined()
  })
})

describe('AppFrame frame measurement lifecycle', () => {
  it('coalesces observer reports and publishes the latest frame measurement', async () => {
    const { instance, rightOwner } = await mountFrame()
    const observer = observers.at(-1)!
    await act(async () => {
      frameWidth = 900
      observer.fire()
      frameWidth = 1200
      observer.fire()
    })
    expect(animationFrames.size).toBe(1)
    expect(instance.getSnapshot().layoutInfo.viewportWidth).toBe(1920)
    await act(flushFrames)
    expect(instance.getSnapshot().layoutInfo.viewportWidth).toBe(1200)
    expect(rightOwner().viewportWidth).toBe(1200)
    expect(instance.getSnapshot().layoutInfo.rightbar).toBeNull()
  })

  it('retains the last positive measurement while the frame is hidden', async () => {
    const { instance, rightOwner } = await mountFrame()
    await resize(0)
    expect(instance.getSnapshot().layoutInfo.viewportWidth).toBe(1920)
    expect(rightOwner().viewportWidth).toBe(1920)
  })

  it('disconnects the observer and prevents queued or late reports after unmount', async () => {
    const { instance, unmount } = await mountFrame()
    const observer = observers.at(-1)!
    frameWidth = 800
    await act(async () => { observer.fire() })
    expect(animationFrames.size).toBe(1)
    unmount()
    expect(observer.disconnected).toBe(true)
    expect(animationFrames.size).toBe(0)
    await act(async () => { observer.fire(); flushFrames() })
    expect(instance.getSnapshot().layoutInfo.viewportWidth).toBe(1920)
    expect(animationFrames.size).toBe(0)
  })
})

describe('sidebar drawer', () => {
  it('cancels an unfinished drawer toggle animation at the rail breakpoint', async () => {
    frameWidth = 390
    const { frame, instance } = await mountFrame()
    await act(async () => { instance.actions.toggleSidebar() })
    expect(frame.hasAttribute('data-animating')).toBe(true)
    await resize(768)
    expect(frame.hasAttribute('data-animating')).toBe(false)
  })

  it('keeps the main content at full width while opening and closing the retained drawer', async () => {
    frameWidth = 390
    const { frame, instance, sidebarOwner, getByTestId } = await mountFrame()
    const sidebar = getByTestId('sidebar-content')
    const main = getByTestId('main-content')
    const leading = getByTestId('shell.leading-content')
    expect(tracks(frame)).toEqual([0, 0])
    expect(sidebarOwner()).toEqual({ collapsed: true, width: 280, drawer: true })
    expect(sidebar.parentElement?.hasAttribute('inert')).toBe(true)
    const mask = frame.querySelector('[data-sidebar-mask]')
    expect(mask).not.toBeNull()
    await fireEvent.click(mask!)
    expect(sidebarOwner().collapsed).toBe(true)
    await act(async () => { instance.actions.toggleSidebar() })
    expect(tracks(frame)).toEqual([0, 0])
    expect(sidebarOwner().collapsed).toBe(false)
    expect(sidebar.parentElement?.hasAttribute('inert')).toBe(false)
    expect(main.closest('[inert]')).not.toBeNull()
    expect(leading.closest('[inert]')).not.toBeNull()
    expect(frame.querySelector('[data-side="sidebar"]')).toBeNull()
    await fireEvent.click(frame.querySelector('[aria-hidden="true"]')!)
    expect(sidebarOwner().collapsed).toBe(true)
    expect(main.closest('[inert]')).toBeNull()
    expect(getByTestId('sidebar-content')).toBe(sidebar)
    expect(getByTestId('main-content')).toBe(main)
    expect(getByTestId('shell.leading-content')).toBe(leading)
    expect(frame.querySelector('[data-sidebar-mask]')).toBe(mask)
  })

  it('closes the drawer on navigation and restores the rail at 768px', async () => {
    frameWidth = 767
    const { frame, instance, sidebarOwner } = await mountFrame()
    await act(async () => { instance.actions.toggleSidebar() })
    await act(async () => { instance.actions.selectPanel('plugins' as MainPanelId) })
    expect(sidebarOwner().collapsed).toBe(true)
    await act(async () => { instance.actions.toggleSidebar() })
    await resize(768)
    expect(sidebarOwner()).toEqual({ collapsed: true, width: 56, drawer: false })
    expect(tracks(frame)).toEqual([56, 0])
    await resize(767)
    expect(sidebarOwner().collapsed).toBe(true)
    expect(tracks(frame)).toEqual([0, 0])
  })
})
