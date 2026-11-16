// One trigger-anchored stat dialog seat shared by the Turn-stat pills
// (TurnUsagePanel) and the composer-dock session stats pills (StatsPills.tsx);
// the matching dialog surface skin lives in stat-dialog.module.css.

import { ref, shallowRef, shallowReadonly, useId, watchEffect, type Ref, type ShallowRef } from 'vue'
import { useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'

/** Open state, refs, and CSS anchor identity for one stat dialog. */
export interface StatDialogSeat {
  open: Readonly<Ref<boolean>>
  setOpen: (open: boolean) => void
  rootRef: ShallowRef<HTMLSpanElement | null>
  panelRef: ShallowRef<HTMLDivElement | null>
  anchorName: string
}

/** One trigger-anchored dialog seat, including its portaled surface.
 * @returns scoped open state, DOM refs, and CSS anchor identity.
 */
export function useStatDialog(): StatDialogSeat {
  const open = ref(false)
  const setOpen = (next: boolean): void => { open.value = next }
  const rootRef = shallowRef<HTMLSpanElement | null>(null)
  const panelRef = shallowRef<HTMLDivElement | null>(null)
  const anchorName = `--dsh-stat-${useId().replaceAll(':', '')}`

  useDismissOnOutsidePointer(rootRef, () => open.value, setOpen, panelRef)
  // Capture closes this dialog before keyboard activation opens a sibling.
  watchEffect(onCleanup => {
    if (!open.value) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    const onClick = (event: MouseEvent): void => {
      if (event.target instanceof Node
        && rootRef.value?.contains(event.target) !== true
        && panelRef.value?.contains(event.target) !== true) setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onClick, true)
    onCleanup(() => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onClick, true)
    })
  })
  return { open: shallowReadonly(open), setOpen, rootRef, panelRef, anchorName }
}
