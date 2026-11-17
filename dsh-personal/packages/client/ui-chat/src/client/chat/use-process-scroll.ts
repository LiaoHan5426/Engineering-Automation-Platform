/** Capped process-group scrolling and fades over the shared follow controller. */
import { shallowRef, shallowReadonly, watch, toValue, type Ref, type HTMLAttributes, type MaybeRefOrGetter } from 'vue'
import { scrollMetrics, useScrollFollow } from './use-scroll-follow.ts'

interface ScrollEdges { readonly canScrollUp: boolean; readonly canScrollDown: boolean }
const AT_REST: ScrollEdges = { canScrollUp: false, canScrollDown: false }
const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '])

/**
 * Observe one group's body and content without coupling its follow intent to the outer transcript.
 * Wheel, touchstart, any pointerdown, and unprevented scroll keys interrupt active animations,
 * including events from editable controls; subsequent position sampling determines follow intent.
 * @param bodyRef - capped scrolling body.
 * @param contentRef - uncapped content whose size reports growth.
 * @param open - local disclosure state.
 * @param grouped - whether the display mode retains the group's height cap.
 * @returns edge fades, DOM event bindings, and one-shot positioning for manual opening.
 */
export function useProcessScroll(
  bodyRef: Readonly<Ref<HTMLDivElement | null>>, contentRef: Readonly<Ref<HTMLDivElement | null>>,
  open: MaybeRefOrGetter<boolean>, grouped: MaybeRefOrGetter<boolean>,
): {
  edges: Readonly<Ref<ScrollEdges>>
  events: Pick<HTMLAttributes, 'onScroll' | 'onWheel' | 'onTouchstart' | 'onPointerdown' | 'onKeydown'>
  initialize: (position: 'top' | 'bottom') => void
} {
  const follow = useScrollFollow(false, 1)
  let initialPosition: 'top' | 'bottom' | null = null
  const edges = shallowRef<ScrollEdges>(AT_REST)
  const initialize = (position: 'top' | 'bottom'): void => { initialPosition = position }
  const sync = (cause: 'resize' | 'scroll' | 'scrollend'): void => {
    const body = bodyRef.value
    let next = AT_REST
    if (body !== null && body.closest('[hidden], [data-group-expanded-mode]') === null) {
      let metrics = scrollMetrics(body)
      const initial = cause === 'resize' ? initialPosition : null
      if (initial !== null) {
        metrics = follow.jump(body, metrics, initial === 'bottom' ? metrics.floor : 0)
        if (initial === 'top') follow.setFollowing(false)
        initialPosition = null
      } else {
        const wasAnimating = follow.animating
        if (cause === 'scrollend') follow.settle(metrics)
        else follow.sample(metrics)
        if (follow.active && (cause === 'resize' || (cause === 'scrollend' && wasAnimating))) {
          metrics = follow.toBottom(body, metrics, 'smooth')
        }
      }
      next = { canScrollUp: metrics.top > 1, canScrollDown: metrics.top < metrics.floor - 1 }
    } else follow.reset()
    if (edges.value.canScrollUp !== next.canScrollUp || edges.value.canScrollDown !== next.canScrollDown) edges.value = next
  }
  const interrupt = (): void => {
    const body = bodyRef.value
    if (body !== null && follow.animating) follow.interrupt(body, scrollMetrics(body))
  }
  const events = {
    onScroll: () => { sync('scroll') },
    onWheel: interrupt,
    onTouchstart: interrupt,
    onPointerdown: interrupt,
    onKeydown: (event: KeyboardEvent) => {
      if (!event.defaultPrevented && SCROLL_KEYS.has(event.key)) interrupt()
    },
  }

  watch([() => toValue(grouped), () => toValue(open)], () => {
    interrupt()
    follow.reset()
    if (!toValue(grouped) || !toValue(open)) initialPosition = null
  }, { immediate: true, flush: 'post' })
  watch([bodyRef, contentRef, () => toValue(open)], (_, __, onCleanup) => {
    const body = bodyRef.value
    if (body === null || !toValue(open) || typeof ResizeObserver === 'undefined') return
    const unbind = follow.bind(body)
    const observer = new ResizeObserver(() => { sync('resize') })
    const onScrollEnd = (event: Event): void => { if (event.target === body) sync('scrollend') }
    body.addEventListener('scrollend', onScrollEnd)
    observer.observe(body)
    if (contentRef.value !== null) observer.observe(contentRef.value)
    onCleanup(() => {
      unbind()
      observer.disconnect()
      body.removeEventListener('scrollend', onScrollEnd)
    })
  }, { flush: 'post' })
  return { edges: shallowReadonly(edges), events, initialize }
}
