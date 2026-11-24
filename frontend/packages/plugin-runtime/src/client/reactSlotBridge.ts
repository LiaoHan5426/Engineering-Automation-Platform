/**
 * Wrap React slot components so Vue RightbarSeat can host better-sidebar
 * NativeTabBody (React) without a hand-rolled guide seat.
 */
import {
  createElement,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  unref,
  watch,
  type Component,
  type Ref,
} from 'vue'

function isLikelyVueComponent(component: unknown): boolean {
  if (!component || (typeof component !== 'object' && typeof component !== 'function')) {
    return false
  }
  const c = component as Record<string, unknown>
  return (
    typeof c.render === 'function' ||
    typeof c.setup === 'function' ||
    typeof c.__vccOpts === 'object' ||
    c.__isVue === true
  )
}

function isReactComponent(component: unknown): boolean {
  if (typeof component !== 'function') return false
  if (isLikelyVueComponent(component)) return false
  return true
}

function unwrapMaybeRef<T>(value: T | Ref<T>): T {
  return unref(value) as T
}

/**
 * Adapt Vue slot props (ComputedRef hooks) into React-friendly props for
 * better-sidebar NativeTabBody (`useTabInfo()` → plain snapshot with `.tab`).
 */
function adaptPropsForReact(raw: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...raw }
  const useTabInfo = raw.useTabInfo
  if (typeof useTabInfo === 'function') {
    next.useTabInfo = () => {
      const read = () => {
        const result = (useTabInfo as () => unknown)()
        return unwrapMaybeRef(result as Ref<unknown> | unknown)
      }
      return useSyncExternalStore(
        (onStoreChange) => {
          let stopped = false
          let last = read()
          const tick = () => {
            if (stopped) return
            const cur = read()
            if (cur !== last) {
              last = cur
              onStoreChange()
            }
            timer = window.setTimeout(tick, 50)
          }
          let timer = window.setTimeout(tick, 50)
          return () => {
            stopped = true
            window.clearTimeout(timer)
          }
        },
        read,
        read,
      )
    }
  }
  return next
}

/** Vue host that createRoot-mounts a React component into a div. */
export function createReactSlotWrapper(
  ReactComp: ComponentType<Record<string, unknown>>,
): Component {
  return defineComponent({
    name: 'EapReactSlotHost',
    inheritAttrs: false,
    setup(_props, { attrs }) {
      const host = ref<HTMLElement | null>(null)
      let root: Root | null = null

      const paint = () => {
        if (!host.value) return
        if (!root) root = createRoot(host.value)
        const adapted = adaptPropsForReact({ ...(attrs as Record<string, unknown>) })
        root.render(createElement(ReactComp, adapted) as ReactNode)
      }

      onMounted(paint)
      watch(
        () => ({ ...attrs }),
        () => paint(),
        { deep: true },
      )
      onBeforeUnmount(() => {
        root?.unmount()
        root = null
      })

      return () =>
        h('div', {
          ref: host,
          'data-eap-react-slot-host': '',
          style: 'display:contents',
        })
    },
  })
}

/**
 * Patch slots.register so React components are wrapped for Vue RightbarSeat.
 */
export function installReactSlotBridge(slots: {
  register: (meta: object, component?: unknown) => () => void
}): () => void {
  const original = slots.register.bind(slots)
  slots.register = (meta: object, component?: unknown) => {
    if (component && isReactComponent(component)) {
      return original(
        meta,
        createReactSlotWrapper(component as ComponentType<Record<string, unknown>>),
      )
    }
    return original(meta, component)
  }
  return () => {
    slots.register = original
  }
}
