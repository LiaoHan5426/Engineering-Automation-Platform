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
  return { container, ...getQueriesForElement(container, queries), rerender: (next: VNode) => { patch(next,
    container) }, unmount: () => { patch(null, container); container.remove(); roots.delete(container) } }
}
export async function act(callback: () => unknown) { await callback(); await nextTick() }
export const fireEvent = {
  async click(...args: Parameters<typeof domFireEvent.click>) {
    await nextTick()
    const result = domFireEvent.click(...args)
    await nextTick()
    return result
  },
  async contextMenu(...args: Parameters<typeof domFireEvent.contextMenu>) {
    await nextTick()
    const result = domFireEvent.contextMenu(...args)
    await nextTick()
    return result
  },
  async copy(...args: Parameters<typeof domFireEvent.copy>) {
    await nextTick()
    const result = domFireEvent.copy(...args)
    await nextTick()
    return result
  },
  async error(...args: Parameters<typeof domFireEvent.error>) {
    await nextTick()
    const result = domFireEvent.error(...args)
    await nextTick()
    return result
  },
  async focus(...args: Parameters<typeof domFireEvent.focus>) {
    await nextTick()
    const result = domFireEvent.focus(...args)
    await nextTick()
    return result
  },
  async keyDown(...args: Parameters<typeof domFireEvent.keyDown>) {
    await nextTick()
    const result = domFireEvent.keyDown(...args)
    await nextTick()
    return result
  },
  async load(...args: Parameters<typeof domFireEvent.load>) {
    await nextTick()
    const result = domFireEvent.load(...args)
    await nextTick()
    return result
  },
  async pointerDown(...args: Parameters<typeof domFireEvent.pointerDown>) {
    await nextTick()
    const result = domFireEvent.pointerDown(...args)
    await nextTick()
    return result
  },
  async pointerEnter(...args: Parameters<typeof domFireEvent.pointerEnter>) {
    await nextTick()
    const result = domFireEvent.pointerEnter(...args)
    await nextTick()
    return result
  },
  async pointerLeave(...args: Parameters<typeof domFireEvent.pointerLeave>) {
    await nextTick()
    const result = domFireEvent.pointerLeave(...args)
    await nextTick()
    return result
  },
}
