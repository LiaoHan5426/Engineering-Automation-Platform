/** Viewport fitting for overlays whose bottom position is independent of their height. */
import { shallowRef, watch, type Ref } from 'vue'
import { overlayTopMargin } from './overlay-top-margin.ts'

const MARGIN = 12

/**
 * Clamp a bottom-anchored overlay to the space above its bottom edge.
 * @param element - mounted overlay element; null skips measurement.
 * @param cap - maximum height in pixels.
 * @param signal - reactive owner state whose changes can move the anchor.
 * @param margin - minimum viewport top inset, widened by the frame's overlay inset.
 * @returns reactive maximum height in pixels; listeners leave with the current scope.
 */
export function useAnchoredMaxHeight(element: Readonly<Ref<HTMLElement | null>>, cap: number, signal: () => unknown, margin: number = MARGIN): Readonly<Ref<number>> {
  const maxHeight = shallowRef(cap)
  watch([element, signal], (_, __, onCleanup) => {
    const el = element.value
    if (el === null) return
    const fit = () => { maxHeight.value = Math.min(cap, Math.max(0, el.getBoundingClientRect().bottom - overlayTopMargin(margin))) }
    fit()
    window.addEventListener('resize', fit)
    window.addEventListener('scroll', fit, true)
    onCleanup(() => {
      window.removeEventListener('resize', fit)
      window.removeEventListener('scroll', fit, true)
    })
  }, { immediate: true, flush: 'post' })
  return maxHeight
}
