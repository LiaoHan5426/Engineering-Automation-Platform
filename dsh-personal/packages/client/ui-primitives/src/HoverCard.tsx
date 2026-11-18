import { computed, defineComponent, h, inject, shallowRef, watch, Teleport, useId } from 'vue'
import type { CSSProperties, PropType, Ref } from 'vue'
import clsx from 'clsx'
import { writeClipboard } from './clipboard.ts'
import { usePointerGrace } from './pointer-grace.ts'
import { overlayTopMargin } from './overlay-top-margin.ts'
import { HoverCardGroupContext } from './HoverCardGroup.tsx'
import css from './HoverCard.module.css'
/** Preview opacity transition and retained lifetime during dismissal. */
const PREVIEW_FADE_MS = 100
const PREVIEW_MAX_HEIGHT = 420
const PREVIEW_INSET = 24
const INLINE_PREVIEW_WIDTH = 300
const ANCHOR_GAP = 8
const VIEWPORT_MARGIN = 8
interface CardPosition {
  left?: number
  top?: number
  width?: number
  maxWidth?: number
  maxHeight?: number
  bridge?: {
    left: number
    top: number
    width: number
    height: number
  }
}
const ANCHORED: CardPosition = {}
/**
 * Render an anchor with a hover-triggered preview card independently of nested tooltips.
 * Touch entry does not open a preview or intercept the anchor's action.
 * @param props.anchor - the hover target (rendered in place inside a wrapper span).
 * @param props.content - card content; the pointer may rest on it, so it is
 * readable and selectable, but it carries no dismissal affordance of its own.
 * @param props.openDelayMs - hover dwell before the card shows (default 500).
 * @param props.variant - compact card beside the anchor, or a preview above/below it
 * with 24px side insets, a 420px height cap, the frame-top clearance (capped below an anchor inside the top strip),
 * and 100ms opacity transitions.
 * @param props.widthAnchorRef - optional element whose width and horizontal position size the preview.
 * @param props.inline - keep the anchor in prose; show a contained preview on hover or keyboard focus.
 * Its hover region connects the anchor and preview across the visual gap.
 * @param props.fitContent - size an inline card to its content within the usual width cap.
 * @param props.disabled - suppress opening; turning true dismisses an open card.
 * @param props.grouped - share first-display dwell across the surrounding list and active portal.
 * Group replacement removes the previous card immediately, including a fading preview.
 * @param props.copyText - optional primary value copied by activation and
 * included in the card's accessible name.
 * @param props.copyLabel - localized accessible activation-label prefix.
 * @param props.copiedLabel - localized visible success label.
 * @returns anchor wrapper with the conditional portaled card.
 */
export const HoverCard = defineComponent({ name: 'HoverCard', props: { openDelayMs: { type: Number, default: 500 }, disabled: Boolean, grouped: Boolean, copyText: String, copyLabel: String, copiedLabel: String, variant: { type: String as PropType<'compact' | 'preview'>, default: 'compact' }, widthAnchorRef: Object as PropType<Readonly<Ref<HTMLElement | null>>>, inline: Boolean, fitContent: Boolean }, setup(props, { slots }) {
  const compact = computed(() => props.variant !== 'preview' && !props.inline)
  const anchorName = `--dsh-hover-card-${useId().replaceAll(':', '')}`
  const rootRef = shallowRef<HTMLSpanElement | null>(null)
  const cardRef = shallowRef<HTMLDivElement | null>(null)
  const portalRef = shallowRef<HTMLSpanElement | null>(null)
  const timerRef = shallowRef<ReturnType<typeof setTimeout> | null>(null)
  const copyTimerRef = shallowRef<ReturnType<typeof setTimeout> | null>(null)
  const copyHeightRef = shallowRef<number | null>(null)
  const copyEpochRef = shallowRef(0)
  const copyingRef = shallowRef(false)
  const mountedRef = shallowRef(true)
  const phase = shallowRef<'closed' | 'open' | 'closing'>('closed')
  const open = computed(() => phase.value !== 'closed')
  const closing = computed(() => phase.value === 'closing')
  const pos = shallowRef<CardPosition | null>(null)
  const positioned = computed(() => pos.value !== null)
  const copied = shallowRef(false)
  const parentGroup = inject(HoverCardGroupContext, null)
  const group = computed(() => props.grouped ? parentGroup : null)
  const groupOwner = Symbol('hover-card')
  const clearCopied = () => {
    if (copyTimerRef.value !== null) {
      clearTimeout(copyTimerRef.value)
      copyTimerRef.value = null
    }
    copyHeightRef.value = null
    copied.value = false
  }
  const close = () => {
    copyEpochRef.value += 1
    clearCopied()
    phase.value = props.variant === 'preview' && phase.value !== 'closed' ? 'closing' : 'closed'
  }
  const { arm: armClose, cancel: cancelClose } = usePointerGrace(close)
  const clearTimer = () => {
    if (timerRef.value !== null) {
      clearTimeout(timerRef.value)
      timerRef.value = null
    }
  }
  const dismissImmediately = () => {
    clearTimer()
    cancelClose()
    copyEpochRef.value += 1
    clearCopied()
    phase.value = 'closed'
  }
  // A fading preview still owns the group's visible card until it unmounts or another card replaces it.
  const groupVisible = computed(() => open.value && positioned.value)
  watch([() => group.value, () => groupOwner, () => groupVisible.value, () => dismissImmediately, () =>
    rootRef.value], (_values, _previous, onCleanup) => {
    const dispose: (() => void) | void = (() => {
      if (!groupVisible.value || group.value == null)
        return
      const owner = group.value
      if (portalRef.value === null) return
      owner.shown(groupOwner, dismissImmediately, portalRef.value)
      return () => { owner.release(groupOwner) }
    })()
    if (typeof dispose === 'function')
      onCleanup(dispose)
  }, { immediate: true, flush: 'post' })
  watch([() => closing.value], (_values, _previous, onCleanup) => {
    const dispose: (() => void) | void = (() => {
      if (!closing.value)
        return
      const timer = setTimeout(() => { phase.value = 'closed' }, PREVIEW_FADE_MS)
      return () => { clearTimeout(timer) }
    })()
    if (typeof dispose === 'function')
      onCleanup(dispose)
  }, { immediate: true, flush: 'post' })
  // Owner disabling mid-hover (menu opened, drag started) starts dismissal.
  watch([() => props.disabled, () => cancelClose, () => close], () => {
    if (!props.disabled)
      return
    clearTimer()
    cancelClose()
    close()
  }, { immediate: true, flush: 'post' })
  watch([], (_values, _previous, onCleanup) => {
    const dispose: (() => void) | void = (() => {
      mountedRef.value = true
      return () => {
        mountedRef.value = false
        copyEpochRef.value += 1
        clearTimer()
        if (copyTimerRef.value !== null) {
          clearTimeout(copyTimerRef.value)
          copyTimerRef.value = null
        }
      }
    })()
    if (typeof dispose === 'function')
      onCleanup(dispose)
  }, { immediate: true, flush: 'post' })
  watch([() => open.value, () => props.variant, () => props.inline, () => cancelClose, () => close], (_values, _previous, onCleanup) => {
    const dispose: (() => void) | void = (() => {
      if (!open.value || (props.variant !== 'preview' && !props.inline))
        return
      const dismiss = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape')
          return
        if (props.inline)
          event.stopPropagation()
        clearTimer()
        cancelClose()
        close()
      }
      window.addEventListener('keydown', dismiss, props.inline)
      return () => { window.removeEventListener('keydown', dismiss, props.inline) }
    })()
    if (typeof dispose === 'function')
      onCleanup(dispose)
  }, { immediate: true, flush: 'post' })
  // Fixed-position from the anchor rect before paint; track the anchor while
  // open (capture-phase scroll catches nested panes), as in Menu portal mode.
  watch([() => open.value, () => props.variant, () => props.widthAnchorRef, () => positioned.value, () =>
    props.inline, () => props.fitContent, () => dismissImmediately, () => rootRef.value], (_values, _previous, onCleanup) => {
    const dispose: (() => void) | void = (() => {
      if (!open.value) {
        pos.value = null
        return
      }
      const place = () => {
        const wrapper = rootRef.value
        if (wrapper === null)
          return
        if (wrapper.closest('[inert], [hidden]') !== null) {
          dismissImmediately()
          return
        }
        if (compact.value) {
          pos.value = ANCHORED
          return
        }
        const r = wrapper.getBoundingClientRect()
        const h = cardRef.value?.offsetHeight ?? 0
        if (props.variant === 'preview') {
          const bounds = props.widthAnchorRef?.value?.getBoundingClientRect() ?? r
          const width = Math.max(0, Math.min(bounds.width - PREVIEW_INSET * 2, window.innerWidth - VIEWPORT_MARGIN * 2))
          const topMargin = overlayTopMargin(VIEWPORT_MARGIN, r, ANCHOR_GAP)
          const belowTop = Math.max(topMargin, r.bottom + ANCHOR_GAP)
          const above = Math.max(0, r.top - ANCHOR_GAP - topMargin)
          const below = Math.max(0, window.innerHeight - belowTop - VIEWPORT_MARGIN)
          const onTop = above >= Math.min(PREVIEW_MAX_HEIGHT, below)
          const maxHeight = Math.min(PREVIEW_MAX_HEIGHT, onTop ? above : below)
          pos.value = {
            left: Math.max(VIEWPORT_MARGIN, Math.min(bounds.left + PREVIEW_INSET, window.innerWidth - width - VIEWPORT_MARGIN)),
            top: onTop ? Math.max(topMargin, r.top - Math.min(h, maxHeight) - ANCHOR_GAP) : belowTop,
            width,
            maxHeight,
          }
          return
        }
        const height = Math.max(h, cardRef.value?.scrollHeight ?? 0)
        const maxWidth = Math.max(0, Math.min(INLINE_PREVIEW_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2))
        const width = props.fitContent ? Math.min(cardRef.value?.offsetWidth ?? maxWidth, maxWidth) : maxWidth
        const topMargin = overlayTopMargin(VIEWPORT_MARGIN, r, ANCHOR_GAP)
        const belowTop = Math.max(topMargin, r.bottom + ANCHOR_GAP)
        const above = Math.max(0, r.top - ANCHOR_GAP - topMargin)
        const below = Math.max(0, window.innerHeight - belowTop - VIEWPORT_MARGIN)
        const onTop = height > below && above > below
        const maxHeight = onTop ? above : below
        const left = Math.max(VIEWPORT_MARGIN, Math.min(r.left, window.innerWidth - width - VIEWPORT_MARGIN))
        const top = onTop ? r.top - ANCHOR_GAP - Math.min(height, maxHeight) : belowTop
        const bridgeTop = onTop ? top + Math.min(height, maxHeight) : r.bottom
        const bridgeLeft = Math.min(r.left, left)
        pos.value = {
          left,
          top,
          ...props.fitContent ? {} : { width },
          maxWidth,
          maxHeight,
          bridge: {
            left: bridgeLeft,
            top: bridgeTop,
            width: Math.max(r.right, left + width) - bridgeLeft,
            height: Math.max(0, (onTop ? r.top : top) - bridgeTop),
          },
        }
      }
      place()
      const visibility = new MutationObserver(place)
      for (let ancestor = rootRef.value?.parentElement; ancestor != null; ancestor = ancestor.parentElement) {
        visibility.observe(ancestor, { attributes: true, attributeFilter: ['inert', 'hidden'] })
      }
      const observer = !compact.value && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null
      for (const element of [cardRef.value, rootRef.value, props.widthAnchorRef?.value]) {
        if (element !== null && element !== undefined)
          observer?.observe(element)
      }
      if (!compact.value) {
        window.addEventListener('scroll', place, true)
        window.addEventListener('resize', place)
      }
      return () => {
        observer?.disconnect()
        visibility.disconnect()
        window.removeEventListener('scroll', place, true)
        window.removeEventListener('resize', place)
      }
    })()
    if (typeof dispose === 'function')
      onCleanup(dispose)
  }, { immediate: true, flush: 'post' })
  const copy = async (text: string): Promise<void> => {
    if (copied.value || copyingRef.value)
      return
    copyingRef.value = true
    const copyEpoch = copyEpochRef.value
    const accepted = await writeClipboard(text)
    copyingRef.value = false
    const card = cardRef.value
    if (!accepted || !mountedRef.value || copyEpoch !== copyEpochRef.value || card === null)
      return
    const height = card.offsetHeight
    copyHeightRef.value = height > 0 ? height : null
    copied.value = true
    copyTimerRef.value = setTimeout(clearCopied, 1000)
  }
  const copyable = computed(() => props.copyText !== undefined)
  const dismissFromAnchor = (event: Event): void => {
    // Card interactions preserve the anchor's open state.
    if (portalRef.value?.contains(event.target as Node))
      return
    clearTimer()
    cancelClose()
    close()
  }
  return () => {
    const card = open.value && pos.value !== null && (h('div', { 'ref': cardRef, 'class': clsx(css.card, compact.value && css.compact, props.variant === 'preview' && css.preview, props.inline && css.media, props.inline && props.fitContent && css.fitContent, copyable.value && css.copyable, copied.value && css.feedback), 'data-closing': closing.value || undefined, 'style': {
      positionAnchor: compact.value ? anchorName : undefined,
      left: pos.value.left === undefined ? undefined : `${pos.value.left}px`, top: pos.value.top === undefined ? undefined : `${pos.value.top}px`, width: pos.value.width === undefined ? undefined : `${pos.value.width}px`, maxWidth: pos.value.maxWidth === undefined ? undefined : `${pos.value.maxWidth}px`, maxHeight: pos.value.maxHeight === undefined ? undefined : `${pos.value.maxHeight}px`,
      minHeight: copied.value && copyHeightRef.value !== null ? `${copyHeightRef.value}px` : undefined,
      '--dsh-hover-preview-fade': `${PREVIEW_FADE_MS}ms`,
    } satisfies CSSProperties, 'role': copyable.value ? 'button' : undefined, 'tabIndex': copyable.value ? 0 : undefined, 'aria-label': copyable.value ? `${props.copyLabel}: ${props.copyText}` : undefined, 'onClick': copyable.value ? (e: MouseEvent) => {
      const selection = window.getSelection()
      if (selection !== null && !selection.isCollapsed) {
        for (let i = 0; i < selection.rangeCount; i += 1) {
          if (selection.getRangeAt(i).intersectsNode(e.currentTarget as Node))
            return
        }
      }
      if (props.copyText !== undefined) void copy(props.copyText)
    }
      : undefined, 'onKeydown': copyable.value ? (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ')
        return
      e.preventDefault()
      if (props.copyText !== undefined) void copy(props.copyText)
    }
      : undefined }, [copied.value ? h('span', { 'class': css.copied, 'aria-hidden': 'true' }, [props.copiedLabel]) : slots.default?.()]))
    return (h('span', { 'ref': rootRef, 'class': clsx(css.root, props.inline && css.inline), 'style': compact.value && open.value ? { anchorName } : undefined, 'onFocusin': props.inline ? (event: FocusEvent) => {
      if (!props.disabled && event.target instanceof Element && event.target.matches(':focus-visible')) {
        cancelClose()
        phase.value = 'open'
      }
    } : undefined, 'onFocusout': props.inline ? (event: FocusEvent) => {
      if (event.currentTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget as Node | null)) {
        clearTimer()
        cancelClose()
        close()
      }
    } : undefined, 'onPointerenter': (event: PointerEvent) => {
      if (props.disabled || event.pointerType === 'touch')
        return
      if (event.pointerType === 'mouse' && !window.matchMedia('(any-hover: hover)').matches)
        return
      // Coming back inside during the grace (the gap, or the card itself)
      // keeps the current card rather than restarting the dwell.
      cancelClose()
      if (open.value) {
        phase.value = 'open'
        return
      }
      clearTimer()
      if (group.value?.isWarm())
        phase.value = 'open'
      else
        timerRef.value = setTimeout(() => { phase.value = 'open' }, props.openDelayMs)
    }, 'onPointerleave': () => {
      clearTimer()
      // Leaving a closed card schedules a no-op close; only arm while
      // open, matching Menu's shape.
      if (open.value)
        armClose()
    }, 'onPointerdownCapture': dismissFromAnchor, 'onClickCapture': dismissFromAnchor }, [slots.anchor?.(), open.value && copyable.value && h('span', { 'class': css.status, 'role': 'status' }, [copied.value ? props.copiedLabel : '']), card !== false && pos.value !== null && h(Teleport, { to: document.body }, [h('span', { 'ref': portalRef, 'class': css.portal, onPointerenter: () => { cancelClose(); phase.value = 'open' }, onPointerleave: armClose }, [pos.value.bridge !== undefined && h('span', { 'class': css.bridge, 'style': { left: `${pos.value.bridge.left}px`, top: `${pos.value.bridge.top}px`, width: `${pos.value.bridge.width}px`, height: `${pos.value.bridge.height}px` }, 'data-hovercard-bridge': '', 'aria-hidden': true }, undefined), card])])]))
  }
} })
