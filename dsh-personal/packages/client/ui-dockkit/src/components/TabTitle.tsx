/**
 * A chip's title: one line, clipped at the chip's inset, never ellipsized.
 * While the text is wider than its box the span carries
 * `data-dockkit-tab-clipped`, and the stylesheet fades the text out at the
 * clipped edge in place of an ellipsis. Written to the DOM directly rather
 * than through state: a reading changes nothing that renders, only how the
 * stylesheet paints it. Re-read after every commit (the text may have
 * changed) and whenever the span's box resizes (the chip shrank or grew).
 */
import { defineComponent, h, shallowRef, onMounted, onUpdated, onBeforeUnmount } from 'vue'
import css from './dockkit.module.css'
/** Set or clear the span's `data-dockkit-tab-clipped` from its current geometry. */
function markClipped(element: HTMLElement): void {
  // Sub-pixel widths: the text counts as clipped past one whole pixel.
  if (element.scrollWidth > element.clientWidth + 1) element.dataset.dockkitTabClipped = ''
  else delete element.dataset.dockkitTabClipped
}
/** The title span of a strip chip or a floating panel's header chip. */
export const TabTitle = defineComponent((_props, { slots }) => {
  const span = shallowRef<HTMLSpanElement | null>(null)
  const mark = (): void => {
    if (span.value) markClipped(span.value)
  }
  onMounted(() => {
    mark()
    if (!span.value || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(mark)
    observer.observe(span.value)
    onBeforeUnmount(() => { observer.disconnect() })
  })
  onUpdated(mark)
  return () =>
    h(
      'span',
      {
        ref: span,
        class: css.tabTitle,
        'data-dockkit-tab-title': '',
      },
      [slots.default?.()],
    )
})
