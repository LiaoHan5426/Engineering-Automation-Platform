/** Native Vue mounting and DOM interaction helpers for docking component specs. */
import { render as renderVNode, nextTick, type VNode } from 'vue'
import { fireEvent as dispatch, getQueriesForElement } from '@testing-library/dom'
export { screen } from '@testing-library/dom'

const mounted = new Set<HTMLElement>()

export function render(node: VNode) {
  const container = document.createElement('div')
  document.body.append(container)
  mounted.add(container)
  renderVNode(node, container)
  return {
    container,
    ...getQueriesForElement(document.body),
    rerender: (next: VNode) => {
      renderVNode(next, container)
    },
    unmount: () => {
      renderVNode(null, container)
      container.remove()
      mounted.delete(container)
    },
  }
}

export function cleanup(): void {
  for (const container of mounted) {
    renderVNode(null, container)
    container.remove()
  }
  mounted.clear()
}

export async function act(action: () => void): Promise<void> {
  action()
  await nextTick()
}

const fire = async (...args: Parameters<typeof dispatch>): Promise<boolean> => {
  const result = dispatch(...args)
  await nextTick()
  return result
}
export const fireEvent = Object.assign(fire, {
  click: async (...args: Parameters<typeof dispatch.click>): Promise<boolean> => {
    const result = dispatch.click(...args)
    await nextTick()
    return result
  },
  compositionEnd: async (...args: Parameters<typeof dispatch.compositionEnd>): Promise<boolean> => {
    const result = dispatch.compositionEnd(...args)
    await nextTick()
    return result
  },
  compositionStart: async (...args: Parameters<typeof dispatch.compositionStart>): Promise<boolean> => {
    const result = dispatch.compositionStart(...args)
    await nextTick()
    return result
  },
  contextMenu: async (...args: Parameters<typeof dispatch.contextMenu>): Promise<boolean> => {
    const result = dispatch.contextMenu(...args)
    await nextTick()
    return result
  },
  focus: async (...args: Parameters<typeof dispatch.focus>): Promise<boolean> => {
    const result = dispatch.focus(...args)
    await nextTick()
    return result
  },
  keyDown: async (...args: Parameters<typeof dispatch.keyDown>): Promise<boolean> => {
    const result = dispatch.keyDown(...args)
    await nextTick()
    return result
  },
  keyUp: async (...args: Parameters<typeof dispatch.keyUp>): Promise<boolean> => {
    const result = dispatch.keyUp(...args)
    await nextTick()
    return result
  },
  mouseDown: async (...args: Parameters<typeof dispatch.mouseDown>): Promise<boolean> => {
    const result = dispatch.mouseDown(...args)
    await nextTick()
    return result
  },
  mouseUp: async (...args: Parameters<typeof dispatch.mouseUp>): Promise<boolean> => {
    const result = dispatch.mouseUp(...args)
    await nextTick()
    return result
  },
  pointerCancel: async (...args: Parameters<typeof dispatch.pointerCancel>): Promise<boolean> => {
    const result = dispatch.pointerCancel(...args)
    await nextTick()
    return result
  },
  pointerDown: async (...args: Parameters<typeof dispatch.pointerDown>): Promise<boolean> => {
    const result = dispatch.pointerDown(...args)
    await nextTick()
    return result
  },
  pointerEnter: async (...args: Parameters<typeof dispatch.pointerEnter>): Promise<boolean> => {
    const result = dispatch.pointerEnter(...args)
    await nextTick()
    return result
  },
  pointerLeave: async (...args: Parameters<typeof dispatch.pointerLeave>): Promise<boolean> => {
    const result = dispatch.pointerLeave(...args)
    await nextTick()
    return result
  },
  pointerMove: async (...args: Parameters<typeof dispatch.pointerMove>): Promise<boolean> => {
    const result = dispatch.pointerMove(...args)
    await nextTick()
    return result
  },
  pointerUp: async (...args: Parameters<typeof dispatch.pointerUp>): Promise<boolean> => {
    const result = dispatch.pointerUp(...args)
    await nextTick()
    return result
  },
  scroll: async (...args: Parameters<typeof dispatch.scroll>): Promise<boolean> => {
    const result = dispatch.scroll(...args)
    await nextTick()
    return result
  },
})
