import { h, type Component } from 'vue'
import { canonicalSlotName, translateRenderSlot } from './layoutNames'
import { isReactComponent } from './reactSlotBridge'

type RegisterOptions = {
  name?: string
  children?: Record<string, unknown>
}

type SlotHost = {
  register: (options: object, component?: unknown) => () => void
  registerFactory: (options: object, component?: unknown) => () => void
  inject: (key: string, callback: () => unknown) => () => void
  entries: (key: string) => readonly unknown[]
  entriesOfSlot: (key: string) => readonly unknown[]
  subscribe: (key: string, fn: () => void) => () => void
  getVersion: (key: string) => number
}

let writingShellRoot = false

function rewriteChildren(
  children: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!children) return children
  const rewritten: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(children)) {
    rewritten[canonicalSlotName(key)] = value
  }
  return rewritten
}

function bridgeVue(component: unknown): Component {
  const wrapped = (props: Record<string, unknown>) => {
    const next = {
      ...props,
      renderSlot: translateRenderSlot(props.renderSlot as never),
      renderSlotChain: translateRenderSlot(props.renderSlotChain as never),
    }
    return h(component as Component, next)
  }
  ;(wrapped as { __isVue?: boolean }).__isVue = true
  return wrapped as unknown as Component
}

function rewriteName(name: string | undefined): string | undefined {
  if (name === undefined) return name
  if (name === 'root' && !writingShellRoot) {
    throw new Error('slot "root" is shell-owned; register into shell.overlay')
  }
  if (name === 'root') return 'root'
  return canonicalSlotName(name)
}

/**
 * Store catalog slot names as `dsh-layout-*` and keep plugin call sites on the catalog key.
 * Installed after the React slot bridge so React components still reach that bridge.
 */
export function installLayoutSlotFacade(slots: SlotHost): void {
  const register = slots.register.bind(slots)
  const registerFactory = slots.registerFactory.bind(slots)
  const inject = slots.inject.bind(slots)
  const entries = slots.entries.bind(slots)
  const entriesOfSlot = slots.entriesOfSlot.bind(slots)
  const subscribe = slots.subscribe.bind(slots)
  const getVersion = slots.getVersion.bind(slots)

  slots.register = (options: RegisterOptions, component?: unknown) => {
    const next = {
      ...options,
      name: rewriteName(options.name),
      children: rewriteChildren(options.children),
    }
    const wrapped =
      component && isReactComponent(component) ? component : component ? bridgeVue(component) : component
    return register(next, wrapped)
  }
  slots.registerFactory = (options: RegisterOptions, component?: unknown) => {
    const next = {
      ...options,
      children: rewriteChildren(options.children),
    }
    const wrapped = component ? bridgeVue(component) : component
    return registerFactory(next, wrapped)
  }
  slots.inject = (key, callback) => inject(canonicalSlotName(key), callback)
  slots.entries = (key) => entries(canonicalSlotName(key))
  slots.entriesOfSlot = (key) => entriesOfSlot(canonicalSlotName(key))
  slots.subscribe = (key, fn) => subscribe(canonicalSlotName(key), fn)
  slots.getVersion = (key) => getVersion(canonicalSlotName(key))
}

/** The one shell registration of `root`. Plugin registrations of `root` throw. */
export function withShellRoot<T>(run: () => T): T {
  writingShellRoot = true
  try {
    return run()
  } finally {
    writingShellRoot = false
  }
}
