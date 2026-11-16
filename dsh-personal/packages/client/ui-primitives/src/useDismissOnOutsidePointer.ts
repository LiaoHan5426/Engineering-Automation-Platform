/** Outside-pointer dismissal for trigger-owned popovers. */
import { watchEffect, type Ref } from 'vue'

/**
 * Close an open popover when a pointerdown lands outside its root element.
 * @param root - Element containing both the trigger and the open surface.
 * @param open - Getter for whether the surface is showing; false detaches the listener.
 * @param setOpen - State setter invoked with false on an outside pointerdown.
 * @param portal - Optional surface outside the root that also counts as inside.
 */
export function useDismissOnOutsidePointer(
  root: Readonly<Ref<HTMLElement | null>>,
  open: () => boolean,
  setOpen: (open: boolean) => void,
  portal?: Readonly<Ref<HTMLElement | null>>,
): void {
  watchEffect(onCleanup => {
    if (!open()) return
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node
        && root.value?.contains(event.target) !== true
        && portal?.value?.contains(event.target) !== true) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    onCleanup(() => { document.removeEventListener('pointerdown', closeOutside) })
  })
}
