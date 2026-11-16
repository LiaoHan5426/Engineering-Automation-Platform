import { shallowRef, toValue, watch, type ShallowRef, type MaybeRefOrGetter } from 'vue'

/** Caller-owned visibility operation; commit applies visibility before completion. */
export type HiddenTransition = (element: HTMLElement, hidden: boolean, commit: () => void) => void

/**
 * Retain a searchable subtree and release its browser-find listener with the setup scope.
 * @param hidden - live desired visibility.
 * @param reveal - browser-find and focused-content reveal action.
 * @param transition - optional caller-owned visibility operation.
 * @returns the stable subtree element ref.
 */
export function useSearchableHidden(
  hidden: MaybeRefOrGetter<boolean>, reveal: () => void, transition?: HiddenTransition,
): ShallowRef<HTMLDivElement | null> {
  const ref = shallowRef<HTMLDivElement | null>(null)
  watch([ref, () => toValue(hidden)], ([element, isHidden]) => {
    if (element === null) return
    if (isHidden && element.contains(element.ownerDocument.activeElement)) { reveal(); return }
    const commit = (): void => {
      if (isHidden) element.setAttribute('hidden', 'until-found')
      else element.removeAttribute('hidden')
    }
    if (transition === undefined) commit()
    else transition(element, isHidden, commit)
  }, { flush: 'post' })
  watch(ref, (element, _, onCleanup) => {
    if (element === null) return
    element.addEventListener('beforematch', reveal)
    onCleanup(() => { element.removeEventListener('beforematch', reveal) })
  }, { flush: 'post' })
  return ref
}
