/** Native Vue row mounts and DOM interactions, without a Host or slot renderer. */
import { createApp, computed, nextTick, onScopeDispose, shallowRef, type VNode } from 'vue'
import { fireEvent as domFireEvent } from '@testing-library/dom'
import type { GlobalStandardProps, HostObservable, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
export { screen } from '@testing-library/dom'
const mounted = new Set<() => void>()
export function cleanup(): void { for (const dispose of mounted) dispose(); mounted.clear() }
export async function act(action: () => void): Promise<void> { action(); await nextTick() }
export function bindSnapshotSelector<T>(source: HostObservable<T>): SnapshotSelectorHook<T> {
  return selector => {
    const state = shallowRef(source.getSnapshot())
    onScopeDispose(source.subscribe(() => { state.value = source.getSnapshot() }))
    return computed(() => selector(state.value))
  }
}
const unusedSeat = (): never => { throw new Error('Theme row unexpectedly consumed an unrelated framework seat') }
export const emptyGlobalSeats: GlobalStandardProps = {
  useSessions: unusedSeat, useSessionStatus: unusedSeat, usePanelInfo: unusedSeat,
  useSessionRetainInfo: unusedSeat, useResource: unusedSeat, useWorkspaces: unusedSeat,
  useRemoteAccess: unusedSeat, useSessionAccess: unusedSeat, useWorkspaceAccess: unusedSeat,
  useContextMenu: unusedSeat,
}
export function render(element: () => VNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const app = createApp({ setup: () => element })
  app.mount(container)
  const unmount = () => { app.unmount(); container.remove(); mounted.delete(unmount) }
  mounted.add(unmount)
  return { container, unmount }
}
export const fireEvent = {
  click: async (...args: Parameters<typeof domFireEvent.click>) => { domFireEvent.click(...args); await nextTick() },
  change: async (...args: Parameters<typeof domFireEvent.change>) => { domFireEvent.change(...args); await nextTick() },
  blur: async (...args: Parameters<typeof domFireEvent.blur>) => { domFireEvent.blur(...args); await nextTick() },
  keyDown: async (...args: Parameters<typeof domFireEvent.keyDown>) => { domFireEvent.keyDown(...args); await nextTick() },
}
