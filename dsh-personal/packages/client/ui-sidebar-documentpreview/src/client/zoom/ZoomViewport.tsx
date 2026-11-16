/** Shared zoom viewport, gesture handling, anchoring, and fit-width measurement. */
import { computed, defineComponent, h, onMounted, shallowRef, ref, watch, onScopeDispose, type VNodeChild } from 'vue'
import { DOCUMENT_ZOOM, ZoomControls, type ZoomControlsHandle } from '@deepseek-ai/dsh-client-ui-primitives'
import { FIT_WIDTH, type ZoomLabels, type ZoomPreference } from './types.ts'
import css from './ZoomViewport.module.css'

const PINCH_SETTLE_DELAY_MS = 120
const CONTROLS_HIDE_DELAY_MS = 420
const CONTROLS_REVEAL_HEIGHT_PX = 72

interface PointerAnchor {
  readonly surface: HTMLElement
  readonly x: number
  readonly y: number
  readonly clientX: number
  readonly clientY: number
}

function pointerAnchor(clientX: number, clientY: number): PointerAnchor | undefined {
  const lookup: unknown = Reflect.get(document, 'elementFromPoint')
  if (typeof lookup !== 'function') return undefined
  const hit: unknown = Reflect.apply(lookup, document, [clientX, clientY])
  const surface = hit instanceof Element ? hit.closest<HTMLElement>('[data-document-zoom-surface]') : null
  if (surface === null) return undefined
  const bounds = surface.getBoundingClientRect()
  return { surface, x: clientX - bounds.left, y: clientY - bounds.top, clientX, clientY }
}

/** @returns an actual-size scale that only shrinks content wider than the viewport. */
export function fitWidthZoom(viewportWidth: number, intrinsicWidth: number | undefined, horizontalInset = 0): number {
  if (intrinsicWidth === undefined || intrinsicWidth <= 0) return 1
  return Math.min(1, Math.max(1, viewportWidth - horizontalInset) / intrinsicWidth)
}

/** Shared viewport inputs for renderer-owned content and tab state. */
export interface ZoomViewportProps {
  readonly preference: ZoomPreference
  readonly intrinsicWidth: number | undefined
  readonly horizontalInset?: number
  readonly labels: ZoomLabels
  readonly signal: AbortSignal
  readonly scrollportRef: (element: HTMLElement | null) => void
  readonly onPreference: (preference: ZoomPreference) => void
  /** Resolved scale after a gesture settles or fit-width measurement changes. */
  readonly onRenderZoom?: (zoom: number) => void
  readonly children: VNodeChild
}

/**
 * Keep zoom controls and trackpad gestures independent from document rendering.
 * @param props - renderer content, intrinsic width, tab preference, and localized labels.
 * @returns the owned scrollport and floating zoom controls.
 */
export const ZoomViewport = defineComponent((props: ZoomViewportProps) => {
  const viewportWidth = ref(0)
  const controlsVisible = ref(false)
  const fitZoom = computed(() => fitWidthZoom(viewportWidth.value, props.intrinsicWidth, props.horizontalInset))
  const zoom = computed(() => props.preference.kind === 'fit-width' ? fitZoom.value : props.preference.scale)
  const zoomRef = { value: zoom.value }
  const modeRef = { value: props.preference.kind }
  const frame = shallowRef<HTMLElement | null>(null)
  const scrollport = shallowRef<HTMLDivElement | null>(null)
  const controls = shallowRef<ZoomControlsHandle | null>(null)
  const pinchTimer = { value: undefined as ReturnType<typeof setTimeout> | undefined }
  const controlsHideTimer = { value: undefined as ReturnType<typeof setTimeout> | undefined }
  const pointerInRevealZone = { value: false }
  const controlsActive = { value: false }
  const clearControlsHide = ((): void => {
    clearTimeout(controlsHideTimer.value)
    controlsHideTimer.value = undefined
  })
  const showControls = ((): void => {
    clearControlsHide()
    controlsVisible.value = true
  })
  const scheduleControlsHide = ((): void => {
    clearControlsHide()
    if (pointerInRevealZone.value || controlsActive.value || pinchTimer.value !== undefined) return
    controlsHideTimer.value = setTimeout(() => {
      controlsHideTimer.value = undefined
      controlsVisible.value = false
    }, CONTROLS_HIDE_DELAY_MS)
  })
  const handleControlsActive = ((active: boolean): void => {
    controlsActive.value = active
    if (active) showControls()
    else scheduleControlsHide()
  })
  const handlePointerMove = ((event: PointerEvent): void => {
    const inRevealZone = event.pointerType === 'mouse'
      && event.currentTarget instanceof HTMLElement
      && event.clientY >= event.currentTarget.getBoundingClientRect().bottom - CONTROLS_REVEAL_HEIGHT_PX
    pointerInRevealZone.value = inRevealZone
    if (inRevealZone) showControls()
    else scheduleControlsHide()
  })
  const handlePointerLeave = ((): void => {
    pointerInRevealZone.value = false
    scheduleControlsHide()
  })
  const attachFrame = ((node: HTMLElement | null): void => {
    frame.value = node
    node?.style.setProperty('--document-zoom', String(zoomRef.value))
  })
  const attachScrollport = ((node: HTMLDivElement | null): void => {
    if (scrollport.value === node) return
    scrollport.value = node
    props.scrollportRef(node)
  })
  watch(() => props.scrollportRef, (next, previous) => {
    previous(null)
    next(scrollport.value)
  }, { flush: 'post' })
  const showZoom = ((next: number, clientX?: number, clientY?: number): number => {
    const node = scrollport.value as HTMLDivElement
    const previous = zoomRef.value
    next = Math.min(DOCUMENT_ZOOM.maximum, Math.max(DOCUMENT_ZOOM.minimum, next))
    if (next === previous) return previous
    const bounds = node.getBoundingClientRect()
    const x = clientX === undefined ? node.clientWidth / 2 : clientX - bounds.left
    const y = clientY === undefined ? node.clientHeight / 2 : clientY - bounds.top
    const anchor = pointerAnchor(bounds.left + x, bounds.top + y)
    const previousScrollLeft = node.scrollLeft
    const previousScrollTop = node.scrollTop
    const ratio = next / previous
    zoomRef.value = next
    modeRef.value = 'fixed'
    frame.value?.setAttribute('data-document-zoom-mode', 'fixed')
    frame.value?.style.setProperty('--document-zoom', String(next))
    controls.value?.showZoom(next)
    if (anchor === undefined) {
      node.scrollLeft = (previousScrollLeft + x) * ratio - x
      node.scrollTop = (previousScrollTop + y) * ratio - y
    } else {
      const nextBounds = anchor.surface.getBoundingClientRect()
      node.scrollLeft += nextBounds.left + anchor.x * ratio - anchor.clientX
      node.scrollTop += nextBounds.top + anchor.y * ratio - anchor.clientY
    }
    return next
  })
  const setZoom = ((next: number): void => {
    clearTimeout(pinchTimer.value)
    pinchTimer.value = undefined
    props.onPreference({ kind: 'fixed', scale: showZoom(next) })
  })
  const fitWidth = ((): void => {
    clearTimeout(pinchTimer.value)
    pinchTimer.value = undefined
    const node = frame.value
    zoomRef.value = fitZoom.value
    modeRef.value = 'fit-width'
    node?.setAttribute('data-document-zoom-mode', 'fit-width')
    node?.style.setProperty('--document-zoom', String(fitZoom.value))
    controls.value?.showZoom(fitZoom.value)
    props.onPreference(FIT_WIDTH)
  })

  onMounted(() => {
    const node = scrollport.value as HTMLDivElement
    const measure = (): void => { viewportWidth.value = node.clientWidth }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    onScopeDispose(() => { observer.disconnect() })
  })
  watch([zoom, () => props.preference.kind, () => props.onRenderZoom, frame, controls], () => {
    if (pinchTimer.value !== undefined) return
    zoomRef.value = zoom.value
    modeRef.value = props.preference.kind
    frame.value?.setAttribute('data-document-zoom-mode', props.preference.kind)
    frame.value?.style.setProperty('--document-zoom', String(zoom.value))
    controls.value?.showZoom(zoom.value)
    props.onRenderZoom?.(zoom.value)
  }, { flush: 'post', immediate: true })
  watch([scrollport, () => props.signal], (_, _previous, onCleanup) => {
    const node = scrollport.value as HTMLDivElement
    if (node === null) return
    const signal = props.signal
    const clearPendingPinch = (): void => {
      clearTimeout(pinchTimer.value)
      pinchTimer.value = undefined
      clearControlsHide()
    }
    const wheel = (event: WheelEvent): void => {
      if (!event.ctrlKey || signal.aborted) return
      event.preventDefault()
      showControls()
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? node.clientHeight : 1
      const delta = Math.max(-40, Math.min(40, event.deltaY * unit))
      showZoom(zoomRef.value * Math.exp(-delta * 0.01), event.clientX, event.clientY)
      clearTimeout(pinchTimer.value)
      pinchTimer.value = setTimeout(() => {
        pinchTimer.value = undefined
        props.onPreference({ kind: 'fixed', scale: zoomRef.value })
        scheduleControlsHide()
      }, PINCH_SETTLE_DELAY_MS)
    }
    node.addEventListener('wheel', wheel, { passive: false })
    signal.addEventListener('abort', clearPendingPinch, { once: true })
    onCleanup(() => {
      node.removeEventListener('wheel', wheel)
      signal.removeEventListener('abort', clearPendingPinch)
      clearPendingPinch()
    })
  }, { flush: 'post', immediate: true })

  return () => h('section', { ref: (node) => { attachFrame(node instanceof HTMLElement ? node : null) },
    class: css.frame, 'data-document-zoom-frame': '', 'data-document-zoom-mode': modeRef.value,
    style: { '--document-zoom': zoomRef.value, '--document-zoom-reveal-height': `${String(CONTROLS_REVEAL_HEIGHT_PX)}px` },
    onPointermove: handlePointerMove, onPointerleave: handlePointerLeave }, [
    h('div', { ref: (node) => { attachScrollport(node instanceof HTMLDivElement ? node : null) },
      class: css.scrollport, 'data-document-zoom-scrollport': '' }, [props.children]),
    h('div', { class: css.revealZone, 'data-document-zoom-reveal-zone': '', 'aria-hidden': 'true' }),
    props.intrinsicWidth !== undefined && h(ZoomControls, { ref: controls, zoom: zoomRef.value,
      fit: { label: props.labels.fitWidth, selected: modeRef.value === 'fit-width', onSelect: fitWidth },
      labels: props.labels, visible: controlsVisible.value, onZoom: setZoom, onActiveChange: handleControlsActive }),
  ])
}, { name: 'ZoomViewport', inheritAttrs: false, props: ["preference","intrinsicWidth","horizontalInset","labels","signal","scrollportRef","onPreference","onRenderZoom","children"] })

/** Shared surface class for actual-size and fit-width layout. */
export const zoomSurfaceClass = css.surface as string
