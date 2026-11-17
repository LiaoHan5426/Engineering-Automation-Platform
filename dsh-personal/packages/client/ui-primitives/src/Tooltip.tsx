/** Anchor-preserving tooltips with optional body teleport and viewport fitting. */
import { cloneVNode, defineComponent, Fragment, h, inject, onScopeDispose, provide, shallowRef, Teleport, useId, watch, watchEffect, type InjectionKey, type PropType, type VNode } from 'vue'
import { ShortcutKeys } from './ShortcutKeys.tsx'
import { placeTooltip, type TooltipSide } from './tooltip-placement.ts'
import { useDismissOnOutsidePointer } from './useDismissOnOutsidePointer.ts'
import { pointerModality } from './input-modality.ts'
import css from './Tooltip.module.css'

export type { TooltipSide } from './tooltip-placement.ts'

/** Nested tooltips suppress enclosing bubbles while visible. */
export const TooltipSuppression: InjectionKey<(suppressed: boolean) => void> = Symbol('TooltipSuppression')

type TooltipLabel = string | (() => string)
function clipped(anchor: HTMLElement): boolean {
  return [anchor, ...anchor.querySelectorAll<HTMLElement>('*')]
    .some(el => el.scrollWidth > el.clientWidth)
}

/** A single default-slot anchor keeps its identity, native listeners, and ref while its tooltip changes. */
export const Tooltip = defineComponent({
  name: 'Tooltip',
  inheritAttrs: false,
  props: {
    label: { type: [String, Function] as PropType<TooltipLabel>, required: true },
    shortcutKeys: Array as PropType<readonly string[]>,
    side: { type: String as PropType<TooltipSide>, default: 'right' },
    align: { type: String as PropType<'center' | 'end'>, default: 'center' },
    delayMs: { type: Number, default: 0 },
    focusDelayMs: { type: Number, default: 0 },
    gap: { type: Number, default: 8 },
    disabled: Boolean,
    portal: Boolean,
    maxWidth: Number,
    openOnClick: Boolean,
    onlyWhenClipped: Boolean,
  },
  setup(props, { slots }) {
    const id = useId()
    const anchor = shallowRef<HTMLElement | null>(null)
    const bubble = shallowRef<HTMLSpanElement | null>(null)
    const pos = shallowRef<DOMRect | null>(null)
    const pinned = shallowRef(false)
    const suppressed = shallowRef(false)
    const announce = inject(TooltipSuppression, undefined)
    provide(TooltipSuppression, (active) => { suppressed.value = active })
    const triggers = { hover: false, focus: false }
    let showTimer: ReturnType<typeof setTimeout> | null = null
    const visible = () => pos.value !== null && !props.disabled
    const cancelShow = () => {
      if (showTimer === null) return
      clearTimeout(showTimer)
      showTimer = null
    }
    const withdraw = () => {
      pinned.value = false
      pos.value = null
      announce?.(false)
    }
    const dismiss = () => {
      cancelShow()
      triggers.hover = false
      triggers.focus = false
      withdraw()
    }
    const show = () => {
      if (props.disabled || anchor.value === null) return
      if (props.onlyWhenClipped && !clipped(anchor.value)) return
      pos.value = anchor.value.getBoundingClientRect()
      announce?.(true)
    }
    const showAfterDelay = (delay: number) => {
      cancelShow()
      if (delay <= 0) { show(); return }
      showTimer = setTimeout(() => { showTimer = null; show() }, delay)
    }
    const hide = () => {
      cancelShow()
      if (!triggers.hover && !triggers.focus && !pinned.value) withdraw()
    }
    watch(() => [props.disabled, props.openOnClick] as const, () => {
      if (pinned.value && (props.disabled || !props.openOnClick)) pinned.value = false
      if (props.disabled) dismiss()
    }, { flush: 'sync' })
    watchEffect((onCleanup) => {
      announce?.(visible())
      onCleanup(() => { announce?.(false) })
    })
    onScopeDispose(() => { cancelShow(); announce?.(false) })
    useDismissOnOutsidePointer(anchor, () => props.openOnClick && visible(), dismiss, bubble)
    watchEffect((onCleanup) => {
      if (!props.openOnClick || !visible()) return
      const onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape' && event.key !== 'Tab') return
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation() }
        dismiss()
      }
      document.addEventListener('keydown', onKeyDown, true)
      onCleanup(() => { document.removeEventListener('keydown', onKeyDown, true) })
    })
    watchEffect((onCleanup) => {
      const el = bubble.value
      if (!visible() || suppressed.value || el === null || pos.value === null) return
      const { side, align, gap } = props
      let anchorRect = pos.value
      let size: ResizeObserverSize | undefined
      const fit = () => {
        if (size === undefined) return
        const placement = placeTooltip({ anchor: anchorRect, width: size.inlineSize, height: size.blockSize,
          viewportWidth: window.innerWidth, viewportHeight: window.innerHeight, side, align, gap })
        const horizontal = placement.side === 'right' || placement.side === 'left'
        const offsetX = horizontal ? 0 : align === 'end' ? placement.width : placement.width / 2
        const offsetY = horizontal ? placement.height / 2 : placement.side === 'top' ? placement.height : 0
        el.style.left = `${placement.left + offsetX}px`
        el.style.top = `${placement.top + offsetY}px`
        el.dataset.side = placement.side
        el.style.visibility = 'visible'
      }
      const onResize = () => {
        if (anchor.value !== null) anchorRect = anchor.value.getBoundingClientRect()
        fit()
      }
      const observer = new ResizeObserver((entries) => { size = entries[0]?.borderBoxSize[0]; fit() })
      observer.observe(el, { box: 'border-box' })
      window.addEventListener('resize', onResize)
      onCleanup(() => { observer.disconnect(); window.removeEventListener('resize', onResize) })
    }, { flush: 'post' })
    return () => {
      const child = slots.default?.()[0]
      if (child === undefined) return null
      const describedBy: unknown = child.props?.['aria-describedby']
      const anchorNode = cloneVNode(child, {
        onVnodeMounted: (node) => { anchor.value = node.el instanceof HTMLElement ? node.el : null },
        onVnodeUpdated: (node) => { anchor.value = node.el instanceof HTMLElement ? node.el : null },
        onVnodeUnmounted: () => { anchor.value = null },
        'aria-describedby': props.openOnClick && visible()
          ? [describedBy, id].filter(Boolean).join(' ') : describedBy,
        onPointerenter: (event: PointerEvent) => {
          if (event.pointerType === 'touch') return
          if (event.pointerType === 'mouse' && !window.matchMedia('(any-hover: hover)').matches) return
          triggers.hover = true
          showAfterDelay(props.delayMs)
        },
        onPointerleave: () => { triggers.hover = false; cancelShow(); if (!pinned.value) withdraw() },
        onPointerdown: (event: PointerEvent) => { if (event.pointerType === 'touch' && !pinned.value) dismiss() },
        onClick: () => {
          triggers.focus = false
          cancelShow()
          if (props.openOnClick && !props.disabled && !pinned.value) { pinned.value = true; show() }
          else withdraw()
        },
        onFocus: () => {
          if (pointerModality()) return
          triggers.focus = true
          showAfterDelay(props.focusDelayMs)
        },
        onBlur: () => { triggers.focus = false; hide() },
      }, true)
      const label = visible() ? typeof props.label === 'function' ? props.label() : props.label : null
      const content = visible() && !suppressed.value && pos.value !== null ? h('span', {
        ref: bubble, id: props.openOnClick ? id : undefined, class: css.bubble,
        'data-side': props.side, 'data-portal': props.portal || undefined, 'data-pinned': pinned.value || undefined,
        'data-align': props.align, 'data-has-shortcut': props.shortcutKeys?.length ? true : undefined,
        onVnodeBeforeMount: (node: VNode) => {
          if (!(node.el instanceof HTMLElement) || pos.value === null) return
          node.el.style.left = `${pos.value.left}px`
          node.el.style.top = `${pos.value.top}px`
          node.el.style.visibility = 'hidden'
        },
        style: props.maxWidth === undefined ? {} : { maxWidth: `min(${props.maxWidth}px, calc(100vw - 24px))` },
        role: 'tooltip', 'aria-label': props.shortcutKeys?.length ? [label, props.shortcutKeys.join(' ')].filter(Boolean).join(' ') : undefined,
      }, [label ? h('span', { class: css.label }, label) : null,
        props.shortcutKeys?.length ? h(ShortcutKeys, { keys: props.shortcutKeys, variant: 'tooltip' }) : null]) : null
      return h(Fragment, null, [anchorNode, props.portal ? h(Teleport, { to: 'body' }, content === null ? [] : [content]) : content])
    }
  },
})
