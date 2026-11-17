/** Bind independent native disclosure state to a Chat seat's reset source. */
import { computed, getCurrentScope, onScopeDispose, shallowReadonly, shallowRef, toValue, type Ref } from 'vue'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { UseDisclosure } from '../contract/slots.ts'

/** Own one collapsed disclosure; unchanged generations retain its local state.
 * @param version - reset generation; changing it collapses an open disclosure.
 * @returns readonly expanded state and local disclosure actions.
 */
export function useDisclosure(version: number | Readonly<Ref<number>> = 0): ReturnType<UseDisclosure> {
  const expandedVersion = shallowRef<number | null>(null)
  const setExpanded = (open: boolean): void => { expandedVersion.value = open ? toValue(version) : null }
  const toggle = (): void => {
    const current = toValue(version)
    expandedVersion.value = expandedVersion.value === current ? null : current
  }
  return shallowReadonly(computed(() => ({
    expanded: expandedVersion.value === toValue(version), setExpanded, toggle,
  })))
}

/** Bind lazily; each invocation owns its reset subscription and local open state.
 * @param reset - source of disclosure reset generations.
 * @returns a setup hook whose subscription ends with its Vue effect scope.
 */
export function bindDisclosure(reset: ObservableSnapshot<number>): UseDisclosure {
  return function useBoundDisclosure() {
    if (getCurrentScope() === undefined) throw new Error('disclosure requires an active Vue effect scope')
    const version = shallowRef(reset.getSnapshot())
    let active = true
    const isActive = () => active
    const release: { unsubscribe?: () => void } = {}
    onScopeDispose(() => {
      active = false
      const unsubscribe = release.unsubscribe
      unsubscribe?.()
    })
    const read = (): void => { if (isActive()) version.value = reset.getSnapshot() }
    const unsubscribe = reset.subscribe(read)
    release.unsubscribe = unsubscribe
    if (!isActive()) unsubscribe()
    else read()
    return useDisclosure(version)
  }
}
