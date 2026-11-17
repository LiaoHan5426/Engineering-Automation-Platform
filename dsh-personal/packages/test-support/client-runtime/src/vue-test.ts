/** Native Vue mounting and scheduling used by the client test carrier. */
import { createApp, nextTick, shallowRef, type VNodeChild } from 'vue'
import { getQueriesForElement, type BoundFunctions, type queries } from '@testing-library/dom'

/** Mounted native view with DOM Testing Library queries. */
export type RenderResult = BoundFunctions<typeof queries> & {
  readonly container: HTMLElement
  readonly baseElement: HTMLElement
  unmount(): void
  rerender(element: VNodeChild): Promise<void>
}

/**
 * Flush a mutation and its queued native render work.
 * @param action - mutation, optionally asynchronous.
 * @returns the mutation result after the Vue update queue completes.
 */
export async function act<T>(action: () => T): Promise<Awaited<T>> {
  const result = await action()
  await nextTick()
  return result
}

const mountedViews = new Set<RenderResult>()

/** Unmount the views owned by the calling test. */
export function cleanup(): void {
  for (const view of mountedViews) view.unmount()
}

/**
 * Mount one native tree; the caller owns its teardown.
 * @param element - native element tree.
 * @returns the mounted DOM view and native update operations.
 */
export function render(element: VNodeChild): RenderResult {
  const tree = shallowRef(element)
  const container = document.createElement('div')
  document.body.append(container)
  const app = createApp({ setup: () => () => tree.value })
  const failure: { error?: unknown } = {}
  app.config.errorHandler = (error) => {
    if (!('error' in failure)) failure.error = error
  }
  try {
    app.mount(container)
  } catch (error) {
    app.unmount()
    container.remove()
    throw error
  } finally {
    delete app.config.errorHandler
  }
  if ('error' in failure) {
    app.unmount()
    container.remove()
    throw failure.error
  }
  let mounted = true
  const view: RenderResult = {
    ...getQueriesForElement(document.body),
    container,
    baseElement: document.body,
    unmount: () => {
      if (!mounted) return
      mounted = false
      app.unmount()
      container.remove()
      mountedViews.delete(view)
    },
    rerender: async (next) => {
      tree.value = next
      await nextTick()
    },
  }
  mountedViews.add(view)
  return view
}
