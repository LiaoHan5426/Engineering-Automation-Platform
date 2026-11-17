/** Offscreen row snapshots for native browser dragging. */
import { onBeforeUnmount, toValue, watch, type MaybeRefOrGetter } from 'vue'
import clsx from 'clsx'
import css from './RowDragPreview.module.css'

/**
 * Own a row's inert drag preview until drag end, replacement, or unmount.
 * The offscreen copy keeps WebKit snapshots separate from overlapping panels.
 * The wrapper copies only explicitly requested computed custom properties.
 * Its cloned slot DOM remains in document.body for that lifetime; query live rows
 * within their list to exclude duplicate text and element IDs.
 * @param className - Preview background matching the row's surface; WebKit fills
 * transparent snapshot pixels white, including rounded corners. A reactive source clears the preview when it changes.
 * @param inheritedProperties - Custom-property names whose computed values the preview needs.
 * Omit to copy none. Replacing a reactive list clears the active preview.
 * @returns Preview callbacks; cleanup reports whether this row started a drag,
 * even when its preview failed or the row became non-draggable before drag end.
 * Start accepts the source row when a child handle owns the native drag event.
 */
export function useRowDragPreview(
  className: MaybeRefOrGetter<string>,
  inheritedProperties?: MaybeRefOrGetter<readonly `--${string}`[] | undefined>,
): {
  start: (event: DragEvent, row?: HTMLElement) => void
  clear: () => boolean
} {
  let current: HTMLDivElement | null = null
  let dragging = false
  const clear = (): boolean => {
    const wasDragging = dragging
    dragging = false
    current?.remove()
    current = null
    return wasDragging
  }
  watch([() => toValue(className), () => toValue(inheritedProperties)], clear, { flush: 'sync' })
  onBeforeUnmount(clear)
  return {
    clear,
    start: (event, row): void => {
      clear()
      dragging = true
      const transfer = event.dataTransfer
      if (transfer === null) return
      const source = row ?? event.currentTarget
      if (!(source instanceof HTMLElement)) throw new Error('drag preview: the source row must be an HTMLElement')
      const rect = source.getBoundingClientRect()
      const style = getComputedStyle(source)
      const copy = source.cloneNode(true) as HTMLElement
      copy.removeAttribute('data-row-key')
      copy.tabIndex = -1
      for (const control of copy.querySelectorAll<HTMLElement>(
        'button, a[href], input, select, textarea, [tabindex], [contenteditable]',
      )) control.tabIndex = -1
      copy.style.color = style.color
      copy.style.paddingInlineStart = style.paddingInlineStart
      const image = source.ownerDocument.createElement('div')
      image.className = clsx(css.preview, toValue(className))
      image.inert = true
      image.setAttribute('aria-hidden', 'true')
      toValue(inheritedProperties)?.forEach((property) => {
        image.style.setProperty(property, style.getPropertyValue(property))
      })
      Object.assign(image.style, {
        left: `${String(-rect.width)}px`, width: `${String(rect.width)}px`,
        height: `${String(rect.height)}px`, font: style.font,
      })
      image.append(copy)
      source.ownerDocument.body.append(image)
      current = image
      try {
        transfer.setDragImage(image, event.clientX - rect.left, event.clientY - rect.top)
      } catch (_error) {
        // Browsers may reject a custom image; retain native dragging without the copy.
        image.remove()
        current = null
      }
    },
  }
}
