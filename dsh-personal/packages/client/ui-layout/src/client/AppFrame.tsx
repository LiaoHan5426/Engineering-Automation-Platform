/** Native Vue frame: CSS solves continuous squeeze; measured geometry selects tracks and drag origins. */
import { computed, defineComponent, h, onMounted, onUnmounted, ref, watch } from 'vue'
import type { HostObservable, InjectFace, PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import { CENTER_MIN, clampWidth, computeColumns, RIGHTBAR_DEFAULT_RATIO, RIGHTBAR_MAX_RATIO, RIGHTBAR_MIN, SIDEBAR_AUTO_COLLAPSE, SIDEBAR_COLLAPSED, SIDEBAR_DEFAULT, SIDEBAR_DRAWER_BREAKPOINT } from './columns.ts'
import { DocumentTitle } from './DocumentTitle.tsx'
import type { createLayoutStore } from './stores.ts'
import css from './AppFrame.module.css'

/** Browser posture supplied by the root registration. */
export interface AppFrameInjected {
  hooks: { foldedLandscape: HostObservable<boolean> }
}

/** Full composed props: runtime, child slots, store, locale, and injected posture. */
export type AppFrameProps =
  & PropsRuntime<'root'>
  & PropsRenderSlots<'sidebar' | 'main' | 'rightbar' | 'shell.bottom' | 'shell.overlay' | 'shell.leading'>
  & PropsStore<ReturnType<typeof createLayoutStore>>
  & PropsLocale<'common'>
  & InjectFace<AppFrameInjected>

type MainPanelProps = Pick<PropsRuntime<'root'>, 'usePanelInfo'> & PropsRenderSlots<'main'>
const MainPanel = defineComponent((props: MainPanelProps) => {
  const panelId = props.usePanelInfo(info => info.activePanelId)
  return () => h('div', { class: css.mainPanel, 'data-global-panel': panelId.value !== null || undefined }, [
    props.renderSlot('main', {}, { entryKey: panelId.value ?? 'conversation' }),
  ])
}, { props: ['usePanelInfo', 'renderSlot'] })

type DragProps = { side: 'sidebar' | 'rightbar'; left: number; onStart: () => void; onDrag: (dx: number) => void; onEnd: () => void }
const DragHandle = defineComponent((props: DragProps) => {
  const dragging = ref(false)
  let origin = 0
  let latest = 0
  let frame: number | null = null
  let capture: { element: HTMLDivElement; id: number } | null = null
  const endDrag = () => {
    const active = capture
    if (active === null) return
    capture = null
    if (frame !== null) { cancelAnimationFrame(frame); frame = null }
    if (active.element.hasPointerCapture(active.id)) active.element.releasePointerCapture(active.id)
    dragging.value = false
    props.onEnd()
  }
  onUnmounted(endDrag)
  const cancel = (event: PointerEvent) => { if (capture?.id === event.pointerId) endDrag() }
  return () => h('div', {
    class: css.handle, style: { left: `${props.left}px` },
    'data-side': props.side, 'data-dragging': dragging.value || undefined,
    onPointerdown: (event: PointerEvent) => {
      if (event.button !== 0 || capture !== null) return
      event.preventDefault()
      const element = event.currentTarget as HTMLDivElement
      element.setPointerCapture(event.pointerId)
      capture = { element, id: event.pointerId }
      origin = latest = event.clientX
      props.onStart()
      dragging.value = true
    },
    onPointermove: (event: PointerEvent) => {
      if (capture?.id !== event.pointerId) return
      latest = event.clientX
      frame ??= requestAnimationFrame(() => { frame = null; props.onDrag(latest - origin) })
    },
    onPointerup: (event: PointerEvent) => {
      if (capture?.id !== event.pointerId) return
      props.onDrag(event.clientX - origin)
      endDrag()
    },
    onPointercancel: cancel, onLostpointercapture: cancel,
  })
}, { props: ['side', 'left', 'onStart', 'onDrag', 'onEnd'] })

/** Three-column frame with retained drawer content and disposable browser measurement/drag resources. */
export const AppFrame = defineComponent((props: AppFrameProps) => {
  const layout = props.useStore(state => state.layoutInfo)
  const folded = props.useFoldedLandscape(matches => matches)
  const frameRef = ref<HTMLDivElement | null>(null)
  const dragging = ref(false)
  const animating = ref(0)
  let sidebarBase = 0
  let rightbarBase = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  let disposeMeasurement = () => {}
  const windowsTitlebar = document.documentElement.hasAttribute('data-windows-titlebar')
  const darwin = document.documentElement.dataset.platform === 'darwin'
  const geometry = computed(() => {
    const info = layout.value
    const viewport = info.viewportWidth
    const narrow = viewport < SIDEBAR_AUTO_COLLAPSE
    const drawer = viewport < SIDEBAR_DRAWER_BREAKPOINT && !windowsTitlebar
    const centeredSidebar = folded.value && viewport >= SIDEBAR_DRAWER_BREAKPOINT
    const collapsed = narrow ? !info.narrowExpanded : info.sidebar === 0
    const sidebarPreference = collapsed ? 0 : info.sidebar === 0 ? SIDEBAR_DEFAULT : info.sidebar
    const rightbarPreference = info.rightbar ?? viewport * RIGHTBAR_DEFAULT_RATIO
    const collapsedWidth = drawer || darwin || windowsTitlebar ? 0 : SIDEBAR_COLLAPSED
    const normal = computeColumns(viewport, !info.rightbarShown && narrow ? 0 : sidebarPreference, rightbarPreference, collapsedWidth, centeredSidebar)
    const cols = computeColumns(viewport, drawer ? 0 : sidebarPreference, info.rightbarTrack ? rightbarPreference : 0, collapsedWidth, centeredSidebar)
    return { viewport, drawer, centeredSidebar, collapsed, normal, cols,
      toggle: `${collapsed}:${info.rightbarTrack}:${centeredSidebar}`,
      sidebarWidth: drawer ? Math.min(info.sidebar || SIDEBAR_DEFAULT, Math.max(0, viewport - 48)) : cols.sidebar,
      rightbarMax: cols.rightbar === 0 ? 0 : clampWidth(rightbarPreference, RIGHTBAR_MIN, viewport * RIGHTBAR_MAX_RATIO),
    }
  })
  let sidebarTransition = { drawer: geometry.value.drawer, collapsed: geometry.value.collapsed, instant: true }
  watch(geometry, (next, previous) => {
    if (sidebarTransition.drawer !== next.drawer || sidebarTransition.collapsed !== next.collapsed) {
      sidebarTransition = { drawer: next.drawer, collapsed: next.collapsed,
        instant: next.drawer && next.collapsed && sidebarTransition.collapsed }
    }
    if (next.viewport !== previous.viewport) animating.value = 0
    else if (next.toggle !== previous.toggle) animating.value++
  }, { flush: 'sync' })
  watch(animating, token => {
    clearTimeout(timer)
    if (token > 0) timer = setTimeout(() => { animating.value = 0 }, 600)
  }, { flush: 'sync' })
  onMounted(() => {
    const element = frameRef.value!
    let raf: number | null = null
    let disposed = false
    const measure = () => {
      const width = element.getBoundingClientRect().width
      if (width > 0) props.actions.setViewportWidth(width)
    }
    measure()
    const observer = new ResizeObserver(() => {
      if (disposed) return
      raf ??= requestAnimationFrame(() => { raf = null; measure() })
    })
    observer.observe(element)
    disposeMeasurement = () => {
      disposed = true
      observer.disconnect()
      if (raf !== null) cancelAnimationFrame(raf)
    }
  })
  onUnmounted(() => { disposeMeasurement(); clearTimeout(timer) })
  const endDrag = () => { dragging.value = false }
  return () => {
    const info = layout.value
    const { viewport, drawer, centeredSidebar, collapsed, normal, cols, sidebarWidth, rightbarMax } = geometry.value
    const drawerOpen = drawer && !collapsed
    const inert = drawerOpen ? '' : undefined
    return h('div', {
      ref: frameRef, class: css.frame,
      style: {
        ...(windowsTitlebar ? { '--dsh-windows-sidebar-width': `${cols.sidebar}px` } : {}),
        gridTemplateColumns: `${cols.sidebar}px minmax(${cols.rightbar === 0 ? 0 : CENTER_MIN}px, 1fr) minmax(0px, ${rightbarMax}px)`,
      },
      'data-sidebar-collapsed': collapsed || undefined,
      'data-sidebar-drawer': drawer || undefined,
      'data-sidebar-instant': drawer && collapsed && sidebarTransition.instant || undefined,
      'data-rightbar-collapsed': cols.rightbar === 0 || undefined,
      'data-rightbar-fullscreen': info.rightbarFullscreen || undefined,
      'data-rightbar-instant': info.rightbarInstant || undefined,
      'data-dragging': dragging.value || undefined,
      'data-animating': animating.value > 0 || undefined,
      onTransitionend: (event: TransitionEvent) => {
        if (event.target === frameRef.value && event.propertyName === 'grid-template-columns') animating.value = 0
      },
    }, [
      h(DocumentTitle, { productTitle: process.env.DSH_CLIENT_TITLE ?? props.t('brand.localBuild'), useSessions: props.useSessions, usePanelInfo: props.usePanelInfo }),
      drawer ? h('div', { class: css.drawerMask, 'data-sidebar-mask': '', 'aria-hidden': 'true', onClick: drawerOpen ? () => { props.actions.toggleSidebar() } : undefined }) : null,
      h('div', { class: css.sidebarCol, style: drawer ? { width: `${sidebarWidth}px` } : undefined, inert: drawer && collapsed ? '' : undefined }, [
        props.renderSlot('sidebar', { collapsed, width: sidebarWidth, drawer }),
      ]),
      h('div', { class: css.centerCol, inert }, [h(MainPanel, { usePanelInfo: props.usePanelInfo, renderSlot: props.renderSlot })]),
      h('div', { class: css.rightbarCol, 'data-rightbar-col': '', inert }, [props.renderSlot('rightbar', { width: normal.rightbar, viewportWidth: viewport, canShow: normal.rightbar > 0 })]),
      h('div', { class: css.bottomRow, 'data-shell-bottom': '', inert }, [props.renderSlot('shell.bottom', {})]),
      h('div', { class: css.overlayLayer, 'data-shell-overlay': '' }, [props.renderSlot('shell.overlay', {})]),
      drawer || darwin && collapsed ? h('div', { class: css.leadingSeat, 'data-shell-leading': '', inert }, [props.renderSlot('shell.leading', {})]) : null,
      !drawer && !centeredSidebar && !collapsed ? h(DragHandle, { side: 'sidebar', left: cols.sidebar,
        onStart: () => { sidebarBase = geometry.value.cols.sidebar; dragging.value = true },
        onDrag: (dx: number) => { props.actions.setSidebar(sidebarBase + dx) }, onEnd: endDrag }) : null,
      info.rightbarShown && !info.rightbarFullscreen && normal.rightbar > 0 ? h(DragHandle, { side: 'rightbar', left: viewport - normal.rightbar,
        onStart: () => { rightbarBase = geometry.value.normal.rightbar; dragging.value = true },
        onDrag: (dx: number) => { props.actions.setRightbar(rightbarBase - dx) }, onEnd: endDrag }) : null,
    ])
  }
}, { props: ['useStore', 'useSessions', 'usePanelInfo', 'useFoldedLandscape', 'actions', 'renderSlot', 't'], inheritAttrs: false })
