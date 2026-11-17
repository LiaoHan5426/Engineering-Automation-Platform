/** Floating controls shared by every zoomable document renderer. */
import clsx from 'clsx'
import { defineComponent, h, ref, watch, watchEffect } from 'vue'
import { Button } from './Button.tsx'
import { IconChevronDownOutlineRegular, IconPlusOutlineRegular } from './icons/index.tsx'
import { Menu, type MenuEntry } from './Menu.tsx'
import { Tooltip } from './Tooltip.tsx'
import { DOCUMENT_ZOOM, type DocumentZoomLabels } from './document-zoom.ts'
import css from './ZoomControls.module.css'

function steppedZoom(zoom: number, direction: -1 | 1): number {
  const step = direction === -1 ? Math.ceil(zoom / DOCUMENT_ZOOM.step) - 1 : Math.floor(zoom / DOCUMENT_ZOOM.step) + 1
  return Math.min(DOCUMENT_ZOOM.maximum, Math.max(DOCUMENT_ZOOM.minimum, step * DOCUMENT_ZOOM.step))
}

/** Live percentage display updated independently from the document tree. */
export interface ZoomControlsHandle {
  /** @param zoom - current gesture scale multiplier. */
  showZoom: (zoom: number) => void
}

/** Committed zoom, localized controls and optional fit operation. */
interface ZoomControlsProps {
  readonly zoom: number
  readonly fit?: { readonly label: string; readonly selected: boolean; readonly onSelect: () => void } | undefined
  readonly className?: string | undefined
  readonly labels: DocumentZoomLabels
  readonly visible: boolean
  readonly onZoom: (zoom: number) => void
  readonly onActiveChange: (active: boolean) => void
}

/** Exposes showZoom through the Vue component ref for transient gesture feedback. */
export const ZoomControls = defineComponent((props: ZoomControlsProps, { expose }) => {
  const transient = ref<number>()
  const open = ref(false), hovered = ref(false), focused = ref(false)
  watch(() => props.zoom, () => { transient.value = undefined }, { flush: 'sync' })
  expose({ showZoom: (zoom: number) => { transient.value = zoom } } satisfies ZoomControlsHandle)
  watchEffect(() => { props.onActiveChange(open.value || hovered.value || focused.value) })
  return () => {
    const displayZoom = transient.value ?? props.zoom
    const items: readonly MenuEntry[] = [
      ...(props.fit === undefined ? [] : [{ id: 'fit', label: props.fit.label }, { type: 'separator' as const, id: 'fit-scale' }]),
      ...DOCUMENT_ZOOM.presets.map(value => ({ id: String(value), label: props.labels.value(value * 100) })),
    ]
    const selectedId = props.fit?.selected === true ? 'fit'
      : DOCUMENT_ZOOM.presets.some(value => value === displayZoom) ? String(displayZoom) : undefined
    const preventMouseDown = (event: MouseEvent) => { event.preventDefault() }
    return h('div', {
      class: clsx(css.panel, props.visible && css.visible, props.className), role: 'toolbar', 'aria-label': props.labels.controls,
      'data-document-zoom-controls': true, 'data-document-zoom-visible': props.visible || undefined,
      onPointerenter: (event: PointerEvent) => { if (event.pointerType !== 'touch') hovered.value = true },
      onPointerleave: () => { hovered.value = false }, onFocusCapture: () => { focused.value = true },
      onBlurCapture: (event: FocusEvent) => {
        if (!(event.currentTarget instanceof HTMLElement) || !(event.relatedTarget instanceof Node)
          || !event.currentTarget.contains(event.relatedTarget)) focused.value = false
      },
    }, [
      h(Tooltip, { label: props.labels.out, side: 'top' }, { default: () => h('span', { class: css.controlAnchor }, [
        h(Button, { size: 'sm', className: clsx(css.zoomButton), 'aria-label': props.labels.out,
          disabled: displayZoom <= DOCUMENT_ZOOM.minimum, onMousedown: preventMouseDown,
          onClick: () => { props.onZoom(steppedZoom(displayZoom, -1)) } }, { default: () => h('svg', {
          width: '14', height: '14', viewBox: '0 0 16 16', 'aria-hidden': true,
        }, [h('path', { d: 'M2 8h12', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.5' })]) }),
      ]) }),
      h(Menu, { open: open.value, side: 'top', align: 'start', portal: true, compact: true, listClassName: clsx(css.zoomMenu),
        items, ...(selectedId === undefined ? {} : { selectedId }), onClose: () => { open.value = false }, onSelect: (selected: string) => {
          open.value = false
          if (selected === 'fit') props.fit?.onSelect()
          else props.onZoom(Number(selected))
        } }, { anchor: () => h(Button, { size: 'sm', className: clsx(css.percent), 'aria-label': props.labels.menu,
        'aria-expanded': open.value, onMousedown: preventMouseDown, onClick: () => { open.value = !open.value } }, {
        default: () => [h('span', props.labels.value(Math.round(displayZoom * 100))), h(IconChevronDownOutlineRegular, { size: 12 })],
      }) }),
      h(Tooltip, { label: props.labels.into, side: 'top' }, { default: () => h('span', { class: css.controlAnchor }, [
        h(Button, { size: 'sm', className: clsx(css.zoomButton), 'aria-label': props.labels.into,
          disabled: displayZoom >= DOCUMENT_ZOOM.maximum, onMousedown: preventMouseDown,
          onClick: () => { props.onZoom(steppedZoom(displayZoom, 1)) } }, { default: () => h(IconPlusOutlineRegular, { size: 14 }) }),
      ]) }),
    ])
  }
}, { name: 'ZoomControls', inheritAttrs: false, props: ['zoom', 'fit', 'className', 'labels', 'visible', 'onZoom', 'onActiveChange'] })
