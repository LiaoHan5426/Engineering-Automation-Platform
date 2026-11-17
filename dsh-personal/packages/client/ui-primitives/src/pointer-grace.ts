/** Pointer-dismissed popup timing shared by hover cards and menus. */
import { onScopeDispose } from 'vue'

/** Grace period for crossing the gap between a trigger and its popup. */
export const POINTER_GRACE_MS = 200

/** Cancelable delayed close for a pointer-dismissed popup. */
export interface PointerGrace {
  /** Schedule closing after the grace period, replacing a pending close. */
  arm: () => void
  /** Abort a pending close when the pointer returns. */
  cancel: () => void
}

/** Delay closing until the pointer has stayed outside the popup region.
 * @param close - Callback reading current owner state when the grace elapses.
 * @returns Stable scheduling and cancellation operations disposed with their Vue scope.
 */
export function usePointerGrace(close: () => void): PointerGrace {
  let timer: ReturnType<typeof setTimeout> | null = null
  const cancel = () => {
    if (timer === null) return
    clearTimeout(timer)
    timer = null
  }
  const arm = () => {
    cancel()
    timer = setTimeout(() => { timer = null; close() }, POINTER_GRACE_MS)
  }
  onScopeDispose(cancel)
  return { arm, cancel }
}
