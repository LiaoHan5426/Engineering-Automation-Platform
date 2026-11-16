/** Fixed-pitch virtual turn rail with independent activation and scroll controls. */
import { computed, defineComponent, h, ref, shallowRef, useId, watch, watchEffect } from 'vue'
import { defaultRangeExtractor, elementScroll, observeElementOffset, useVirtualizer, type Range } from '@tanstack/vue-virtual'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import type { TurnRailItem } from './turn-rail-items.ts'
import css from './TurnNavigator.module.css'

interface TurnNavigatorProps {
  readonly items: readonly TurnRailItem[]
  readonly activeTurn: number | null
  /** Turn whose jump is still paging history in; its mark pulses. */
  readonly busyTurn: number | null
  readonly onNavigate: (item: TurnRailItem) => void
  readonly t: ChatViewSlotProps['t']
}

/** Imperative controls for known turns; unknown turn numbers are ignored. */
export interface TurnNavigatorHandle {
  /** @param turn - turn to activate through the navigation callback. */
  activateTurn(turn: number): void
  /** @param turn - turn to center in the rail without navigating the transcript. */
  scrollToTurn(turn: number): void
}

/** Fixed pitch between neighbouring marks; overflow scrolls inside the frame. */
const TURN_SPACING_PX = 10
/** Rail padding above the first mark and below the last one, per end. */
const RAIL_INSET_PX = 6
/** Fade band the mask reserves at a scrollable end. */
const FADE_PX = 24

function preferredScrollBehavior(): 'auto' | 'smooth' {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth'
}

export const TurnNavigator = defineComponent((props: TurnNavigatorProps, { expose }) => {
  const previewTurn = ref<number | null>(null)
  const focusedTurn = ref<number | null>(null)
  const scrollerRef = shallowRef<HTMLDivElement | null>(null)
  const initialization = {
    placed: false, index: 0,
    follow: null as { index: number; count: number; height: number } | null,
    publishOffset: null as ((offset: number, scrolling: boolean) => void) | null,
  }
  let pointerInside = false
  const previewId = useId()
  const turnIndexes = computed(() => {
    const indexes = new Map<number, number>()
    props.items.forEach((item, index) => { indexes.set(item.turn, index) })
    return indexes
  })
  const activeIndex = computed(() => props.activeTurn === null ? undefined : turnIndexes.value.get(props.activeTurn))
  const focusedIndex = computed(() => focusedTurn.value === null ? undefined : turnIndexes.value.get(focusedTurn.value))
  const previewIndex = computed(() => previewTurn.value === null ? undefined : turnIndexes.value.get(previewTurn.value))
  watch(activeIndex, index => { initialization.index = index ?? 0 }, { immediate: true, flush: 'sync' })
  const virtualizer = useVirtualizer<HTMLDivElement, HTMLButtonElement>(computed(() => {
    const focused = focusedIndex.value
    return ({
    count: props.items.length, enabled: props.items.length >= 2,
    useScrollendEvent: true,
    getScrollElement: () => scrollerRef.value,
    getItemKey: (index: number) => props.items[index]?.turn ?? index,
    estimateSize: () => TURN_SPACING_PX,
    measureElement: () => TURN_SPACING_PX,
    initialRect: { width: 0, height: 0 }, initialOffset: 0,
    scrollToFn: (offset, options, instance) => {
      if (initialization.placed) elementScroll(offset, options, instance)
    },
    observeElementOffset: (instance, notify) => {
      initialization.publishOffset = notify
      const dispose = observeElementOffset(instance, notify)
      return () => {
        dispose?.()
        initialization.placed = false
        initialization.follow = null
        initialization.publishOffset = null
      }
    },
    observeElementRect: (instance, notify) => {
      const element = instance.scrollElement
      const Observer = instance.targetWindow?.ResizeObserver
      if (element === null || Observer === undefined) return
      const observer = new Observer(([entry]) => {
        if (entry === undefined) return
        const box = entry.borderBoxSize[0]
        const rect = {
          width: Math.round(box?.inlineSize ?? entry.contentRect.width),
          height: Math.round(box?.blockSize ?? entry.contentRect.height),
        }
        const initial = initialization
        if (!initial.placed && rect.height > 0) {
          const max = Math.max(0, instance.getTotalSize() - rect.height)
          const center = initial.index * TURN_SPACING_PX + RAIL_INSET_PX
          const target = Math.max(0, Math.min(max, center - rect.height / 2))
          initial.placed = true
          initial.follow = { index: initial.index, count: instance.options.count, height: rect.height }
          element.scrollTop = target
          initial.publishOffset?.(target, false)
        }
        notify(rect)
      })
      observer.observe(element, { box: 'border-box' })
      return () => { observer.disconnect() }
    },
    paddingStart: RAIL_INSET_PX - TURN_SPACING_PX / 2,
    paddingEnd: RAIL_INSET_PX - TURN_SPACING_PX / 2,
    scrollPaddingStart: FADE_PX, scrollPaddingEnd: FADE_PX, overscan: 3,
    rangeExtractor: (range: Range) => {
      const indexes = defaultRangeExtractor(range)
      if (focused !== undefined) {
        const last = Math.min(range.count - 1, focused + 1)
        for (let index = Math.max(0, focused - 1); index <= last; index++) {
          if (!indexes.includes(index)) indexes.push(index)
        }
        indexes.sort((left, right) => left - right)
      }
      return indexes
    },
    })
  }))
  const scrollToIndex = (
    index: number, reveal: 'if-needed' | 'always', behavior: 'auto' | 'smooth' | 'instant' = preferredScrollBehavior(),
  ): void => {
    const instance = virtualizer.value
    const item = instance.measurementsCache[index]
    const height = instance.scrollRect?.height ?? 0
    if (item === undefined || height <= 0) return
    const current = instance.scrollOffset ?? 0
    const center = item.start + item.size / 2
    if (reveal === 'if-needed') {
      const { scrollPaddingStart, scrollPaddingEnd } = instance.options
      if (center >= current + scrollPaddingStart && center <= current + height - scrollPaddingEnd) return
    }
    const target = center - height / 2
    const max = Math.max(0, instance.getTotalSize() - height)
    const delta = Math.max(0, Math.min(max, target)) - current
    // The rail owns its fixed-pitch extent; avoid a synchronous DOM extent read.
    if (delta !== 0) elementScroll(current + delta, { behavior }, instance)
  }
  expose({
    activateTurn(turn: number) {
      const index = turnIndexes.value.get(turn)
      const item = index === undefined ? undefined : props.items[index]
      if (item !== undefined) props.onNavigate(item)
    },
    scrollToTurn(turn: number) {
      const index = turnIndexes.value.get(turn)
      if (index !== undefined) scrollToIndex(index, 'always')
    },
  } satisfies TurnNavigatorHandle)
  watchEffect(() => {
    const viewHeight = virtualizer.value.scrollRect?.height ?? 0
    if (viewHeight <= 0) { initialization.follow = null; return }
    const active = activeIndex.value
    if (active === undefined || pointerInside) return
    const previous = initialization.follow
    if (previous?.index === active && previous.count === props.items.length && previous.height === viewHeight) return
    initialization.follow = { index: active, count: props.items.length, height: viewHeight }
    const behavior = previous?.count === props.items.length && previous.height === viewHeight
      ? preferredScrollBehavior() : 'instant'
    scrollToIndex(active, 'if-needed', behavior)
  }, { flush: 'post' })
  return () => {
    if (props.items.length < 2) return null
    const instance = virtualizer.value
    const scrollTop = instance.scrollOffset ?? 0
    const viewHeight = instance.scrollRect?.height ?? 0
    const virtualItems = instance.getVirtualItems()
    const index = previewIndex.value
    const preview = index === undefined ? undefined : props.items[index]
    const previewPosition = virtualItems.find(item => item.index === index)
    const fadeClasses = [css.scroller]
    if (scrollTop > 1) fadeClasses.push(css.fadeTop)
    if (scrollTop < instance.getTotalSize() - viewHeight - 1) fadeClasses.push(css.fadeBottom)
    return h('div', { class: css.slot }, [h('nav', {
      class: css.frame, 'aria-label': props.t('chat.turnNavigation.label'),
      onPointerenter: () => { pointerInside = true },
      onPointerleave: () => { pointerInside = false; previewTurn.value = null },
    }, [
      h('div', { ref: scrollerRef, class: fadeClasses.join(' ') }, [
        h('div', { class: css.marks, style: { height: `${String(instance.getTotalSize())}px` } },
          virtualItems.map(({ index, key, start }) => {
            const item = props.items[index]
            if (item === undefined) return null
            const active = item.turn === props.activeTurn
            const describedBy = item.turn === previewTurn.value ? previewId : undefined
            return h('button', {
              key: String(key), ref: element => { instance.measureElement(element instanceof HTMLButtonElement ? element : null) },
              'data-index': index, type: 'button',
              class: [css.mark, item.anchor.kind === 'unloaded' && css.markUnloaded,
                active ? css.markActive : describedBy !== undefined && css.markPreview,
                item.turn === props.busyTurn && css.markBusy],
              style: { transform: `translateY(${String(start)}px)` },
              'aria-label': props.t(item.anchor.kind === 'loaded' ? 'chat.turnNavigation.jump' : 'chat.turnNavigation.jumpLoad', { turn: item.turn }),
              'aria-current': active ? 'true' : undefined, 'aria-busy': item.turn === props.busyTurn ? 'true' : undefined,
              'aria-describedby': describedBy,
              onPointermove: () => { previewTurn.value = item.turn },
              onClick: () => { props.onNavigate(item) },
              onFocus: () => { focusedTurn.value = item.turn; previewTurn.value = item.turn },
              onBlur: () => { focusedTurn.value = null; previewTurn.value = null },
            })
          })),
      ]),
      preview !== undefined && previewPosition !== undefined ? h('div', {
        id: previewId, role: 'tooltip', class: css.preview,
        style: { '--turn-preview-center': `${String(previewPosition.start + previewPosition.size / 2 - scrollTop)}px` },
      }, [
        h('div', { class: css.previewPrompt }, preview.prompt || props.t('chat.turnNavigation.turn', { turn: preview.turn })),
        preview.response !== '' ? h('div', { class: css.previewResponse }, preview.response) : null,
      ]) : null,
    ])])
  }
}, { name: 'TurnNavigator', inheritAttrs: false, props: ['items', 'activeTurn', 'busyTurn', 'onNavigate', 't'] })
