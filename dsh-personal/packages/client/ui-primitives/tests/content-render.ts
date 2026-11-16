import { render as patch, nextTick, effectScope, type VNode } from 'vue'
import { getQueriesForElement, queries, fireEvent as domFireEvent } from '@testing-library/dom'
export { screen, within, waitFor } from '@testing-library/dom'
const roots = new Set<HTMLElement>()
const scopes = new Set<ReturnType<typeof effectScope>>()
export function renderHook<T>(callback: () => T) {
  const scope = effectScope()
  scopes.add(scope)
  const value = scope.run(callback)!
  return { result: { value }, unmount: () => { scope.stop(); scopes.delete(scope) } }
}
export function cleanup() {
  for (const root of roots) { patch(null, root); root.remove() }
  roots.clear()
  for (const scope of scopes) scope.stop()
  scopes.clear()
}
export function render(node: VNode) {
  const container = document.createElement('div')
  document.body.append(container)
  roots.add(container)
  patch(node, container)
  return { container, ...getQueriesForElement(container, queries), rerender: (next: VNode) => patch(next, container), unmount: () => { patch(null, container); container.remove(); roots.delete(container) } }
}
export async function act(callback: () => unknown) { await callback(); await nextTick() }
export const fireEvent = Object.fromEntries(Object.entries(domFireEvent).map(([name, event]) => [name, async (...args: Parameters<typeof event>) => { await nextTick(); const result = event(...args); await nextTick(); return result }])) as { [K in keyof typeof domFireEvent]: (...args: Parameters<typeof domFireEvent[K]>) => Promise<boolean> }
