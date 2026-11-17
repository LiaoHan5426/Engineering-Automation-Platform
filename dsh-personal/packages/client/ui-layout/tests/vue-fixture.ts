/** Same-package native Vue fixture; no Host boot or production renderer is simulated. */
import { computed, createApp, onScopeDispose, shallowRef, nextTick } from 'vue'
import type { VNode } from 'vue'
import type { HostObservable, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
const mounted = new Set<() => void>()
export function cleanup(): void { for (const dispose of mounted) dispose(); mounted.clear() }
export async function act(action: () => void | Promise<void>): Promise<void> { await action(); await nextTick() }
export function bindSnapshotSelector<T>(source: HostObservable<T>): SnapshotSelectorHook<T> {
  return (selector) => {
    const state = shallowRef({ snapshot: source.getSnapshot() })
    const off = source.subscribe(() => { state.value = { snapshot: source.getSnapshot() } })
    onScopeDispose(off)
    return computed(() => selector(state.value.snapshot))
  }
}
export async function render(element: () => VNode) {
  const revision = shallowRef(0)
  const container = document.createElement('div')
  document.body.append(container)
  const app = createApp({ setup: () => () => { void revision.value; return element() } })
  app.mount(container)
  const unmount = () => { app.unmount(); container.remove(); mounted.delete(unmount) }
  mounted.add(unmount)
  await nextTick()
  const queryByTestId = (id: string) => container.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  return { container, unmount, queryByTestId,
    getByTestId: (id: string) => { const el = queryByTestId(id); if (el === null) throw new Error(`Missing ${id}`); return el },
    rerender: async () => { revision.value++; await nextTick() },
  }
}
export const fireEvent = {
  click: async (element: Element) => { element.dispatchEvent(new MouseEvent('click', { bubbles: true })); await nextTick() },
  transitionEnd: async (element: Element, data: { propertyName: string }) => {
    element.dispatchEvent(Object.assign(new Event('transitionend', { bubbles: true }), data)); await nextTick()
  },
}
