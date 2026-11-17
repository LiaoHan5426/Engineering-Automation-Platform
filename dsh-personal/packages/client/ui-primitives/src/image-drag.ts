/** Image gestures delegate file preparation and transport to the owning feature. */
import { computed, watch, onScopeDispose } from 'vue'
import type { FileDragActions, FileDragSource, PreparedFileDrag } from './file-drag-actions.ts'

interface Preparation { abort: AbortController; prepared?: PreparedFileDrag; failed: boolean }
type ImageGestures = {
  onPointerenter: (event: PointerEvent) => void
  onPointerdown: (event: PointerEvent) => void
  onPointerleave: (event: PointerEvent) => void
  onDragstart: (event: DragEvent) => void
  onDragend: () => void
  onClickCapture: (event: MouseEvent) => void
}

/**
 * Prepare resource-backed images on primary press, other images also on hover; release on leave.
 * Releasing inside the image retains preparation for the next gesture; cancelled drags never start late.
 * @param read - Current callbacks, displayed URL, export name, and optional original bytes or resource address.
 * @returns image gesture handlers; overflowing images remain owned by their pan handler.
 */
export function useImageDrag(
  read: () => { actions: FileDragActions; src: string; name: string; original?: File | undefined; resourceAddress?: string | undefined },
): ImageGestures {
  const source = computed<FileDragSource>(() => {
    const { src, name, original, resourceAddress } = read()
    return original === undefined ? { kind: 'url', url: src, name, mediaType: '', resourceAddress }
      : { kind: 'blob', blob: original, name, mediaType: original.type, resourceAddress }
  })
  let state: Preparation | undefined
  let dragged = false
  const release = ((): void => {
    const previous = state
    state = undefined
    previous?.abort.abort()
    previous?.prepared?.release()
  })
  watch([source, () => read().actions], release)
  onScopeDispose(release)
  const prepare = ((image: HTMLImageElement): void => {
    const { src, actions } = read()
    if (src === '' || state !== undefined) return
    const current: Preparation = { abort: new AbortController(), failed: false }
    state = current
    window.addEventListener('pointerup', (event) => {
      if (event.target !== image) release()
    }, { signal: current.abort.signal })
    window.addEventListener('blur', release, { once: true, signal: current.abort.signal })
    void actions.prepare(source.value, current.abort.signal).then((prepared) => {
      if (current.abort.signal.aborted) prepared.release()
      else current.prepared = prepared
    }, (_error: unknown) => {
      // Speculation stays quiet; only a later failed gesture presents retry feedback.
      current.failed = true
    })
  })
  const intent = ((event: PointerEvent): void => {
    const { resourceAddress } = read()
    if (!event.defaultPrevented && event.currentTarget instanceof HTMLImageElement && event.currentTarget.draggable
      && (resourceAddress === undefined || event.type === 'pointerdown')) prepare(event.currentTarget)
  })
  const onDragStart = ((event: DragEvent): void => {
    const { src, original, actions } = read()
    if (event.defaultPrevented || src === '' || !(event.currentTarget instanceof HTMLImageElement) || event.dataTransfer === null) return
    dragged = true
    const current = state
    if (current?.prepared !== undefined) {
      if (!current.prepared.start(event.dataTransfer, event.currentTarget)) { event.preventDefault(); release() }
      return
    }
    const url = new URL(src, location.href)
    if (original === undefined && (url.protocol === 'https:' || url.protocol === 'http:') && url.origin !== location.origin) return
    event.preventDefault()
    if (current?.failed === true) { actions.reportFailure(); release() }
    prepare(event.currentTarget)
  })
  const onPointerDown = ((event: PointerEvent): void => {
    dragged = false
    if (event.button === 0) intent(event)
  })
  const onPointerLeave = ((event: PointerEvent): void => {
    // Browsers may leave a small image before dispatching its dragstart.
    if (event.buttons !== 1) release()
  })
  const onClickCapture = ((event: MouseEvent): void => {
    if (event.detail === 0) { dragged = false; return }
    if (!dragged) return
    event.preventDefault()
    event.stopPropagation()
    dragged = false
  })
  return { onPointerenter: intent, onPointerdown: onPointerDown, onPointerleave: onPointerLeave,
    onDragstart: onDragStart, onDragend: release, onClickCapture }
}
