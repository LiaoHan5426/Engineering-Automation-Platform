/**
 * Shell-owned slot registry. Plugins still call catalog keys; the facade stores
 * layout names. This replaces the dsh ui-renderer registry for the Vue shell.
 */
import {
  defineComponent,
  h,
  onScopeDispose,
  ref,
  type Component,
  type VNodeChild,
} from 'vue'
import { LAYOUT_PREFIX, LAYOUT_SLOTS } from './layoutSlots'

type ChildSpec = { kind?: string; scope?: string }

type RegOptions = {
  name?: string
  scope?: string
  children?: Record<string, ChildSpec>
  priority?: number
  key?: string
  id?: string
  select?: (owner: unknown) => unknown
  inject?: (sessionId?: string) => Record<string, unknown>
}

type Entry = {
  options: RegOptions
  component: Component
}

const KIND = new Map<string, string>(LAYOUT_SLOTS.map((slot) => [slot.key, slot.kind]))

function kindOf(name: string): string {
  if (name === 'root') return 'single'
  const key = name.startsWith(LAYOUT_PREFIX) ? name.slice(LAYOUT_PREFIX.length) : name
  return KIND.get(key) ?? 'single'
}

function priorityOf(entry: Entry): number {
  return entry.options.priority ?? 0
}

export type EapSlotRegistry = {
  register: (options: RegOptions, component?: unknown) => () => void
  registerFactory: (options: RegOptions, component?: unknown) => () => void
  inject: (key: string, callback: () => (() => void) | void) => () => void
  entries: (key: string) => readonly { options: RegOptions }[]
  entriesOfSlot: (key: string) => readonly { options: RegOptions }[]
  subscribe: (key: string, fn: () => void) => () => void
  getVersion: (key: string) => number
  renderSlot: (key: string, input?: object, options?: { entryKey?: string }) => VNodeChild
}

export function createEapSlotRegistry(): EapSlotRegistry {
  const entries = new Map<string, Entry[]>()
  const factories = new Map<string, Entry>()
  const listeners = new Map<string, Set<() => void>>()
  const versions = new Map<string, number>()
  const declared = new Set<string>(['root'])
  const waiters = new Map<string, Array<{ run: () => (() => void) | void; stop?: () => void }>>()

  const SessionProvider = defineComponent({
    name: 'EapSessionProvider',
    props: ['session', 'children'],
    setup(props, { slots }) {
      return () => slots.default?.() ?? (props.children as VNodeChild)
    },
  })

  function notify(key: string) {
    versions.set(key, (versions.get(key) ?? 0) + 1)
    for (const listener of listeners.get(key) ?? []) listener()
  }

  function snapshot(key: string): readonly { options: RegOptions }[] {
    return (entries.get(key) ?? []).map((entry) => ({ options: entry.options }))
  }

  function declareChildren(children: Record<string, ChildSpec> | undefined) {
    if (!children) return
    for (const key of Object.keys(children)) {
      if (declared.has(key)) continue
      declared.add(key)
      const pending = waiters.get(key) ?? []
      waiters.delete(key)
      for (const waiter of pending) {
        waiter.stop = waiter.run() ?? undefined
      }
    }
  }

  function winners(name: string, entryKey?: string, chain = false): Entry[] {
    const list = entries.get(name) ?? []
    const kind = kindOf(name)
    if (kind === 'keyed') {
      if (entryKey === undefined) return []
      return list.filter((entry) => entry.options.key === entryKey)
    }
    if (kind === 'single') {
      if (list.length === 0) return []
      const best = Math.min(...list.map(priorityOf))
      return list.filter((entry) => priorityOf(entry) === best).slice(0, 1)
    }
    if (kind === 'chain' || chain) {
      const elected = list.find((entry) => {
        if (typeof entry.options.select !== 'function') return true
        return entry.options.select({}) != null
      })
      return elected ? [elected] : []
    }
    return list
  }

  function face(): Record<string, unknown> {
    return {
      renderSlot: registry.renderSlot,
      renderSlotChain: (key: string, input?: object) => renderNamed(key, input, undefined, true),
      renderFactorySlot: (name: string, input?: object) => {
        const factory = factories.get(name)
        if (!factory) return null
        return h(factory.component, { ...input, ...face() })
      },
      SessionProvider,
    }
  }

  function renderNamed(
    name: string,
    input?: object,
    entryKey?: string,
    chain = false,
  ): VNodeChild {
    return h(SlotView, { name, input: input ?? {}, entryKey, chain })
  }

  const SlotView = defineComponent({
    name: 'EapSlotView',
    props: {
      name: { type: String, required: true },
      input: { type: Object, required: true },
      entryKey: { type: String, required: false },
      chain: { type: Boolean, required: false },
    },
    setup(props) {
      const tick = ref(0)
      const stop = registry.subscribe(props.name, () => {
        tick.value += 1
      })
      onScopeDispose(stop)
      return () => {
        void tick.value
        const picked = winners(props.name, props.entryKey, props.chain)
        const input = props.input as Record<string, unknown>
        const sessionId = typeof input.sessionId === 'string' ? input.sessionId : undefined
        const body = picked.map((entry) =>
          h(entry.component, { ...entry.options.inject?.(sessionId), ...input, ...face() }),
        )
        return h(
          'div',
          { 'data-slot': props.name, style: { display: 'contents' } },
          body,
        )
      }
    },
  })

  const registry: EapSlotRegistry = {
    register(options, component) {
      const name = options.name
      if (!name) throw new Error('slot register requires a name')
      const kind = kindOf(name)
      const priority = options.priority ?? 0
      const list = entries.get(name) ?? []
      if (kind === 'single' && list.some((entry) => priorityOf(entry) === priority)) {
        throw new Error(
          `single slot "${name}" already has a registration at priority ${priority}`,
        )
      }
      const entry: Entry = { options, component: component as Component }
      list.push(entry)
      entries.set(name, list)
      declareChildren(options.children)
      notify(name)
      return () => {
        const current = entries.get(name) ?? []
        const next = current.filter((item) => item !== entry)
        if (next.length) entries.set(name, next)
        else entries.delete(name)
        notify(name)
      }
    },
    registerFactory(options, component) {
      const name = options.name
      if (!name) throw new Error('factory register requires a name')
      const entry: Entry = { options, component: component as Component }
      factories.set(name, entry)
      declareChildren(options.children)
      return () => {
        if (factories.get(name) === entry) factories.delete(name)
      }
    },
    inject(key, callback) {
      if (declared.has(key)) {
        const stop = callback() ?? undefined
        return () => stop?.()
      }
      const waiter = { run: callback, stop: undefined as (() => void) | undefined }
      const list = waiters.get(key) ?? []
      list.push(waiter)
      waiters.set(key, list)
      return () => {
        waiter.stop?.()
        const pending = waiters.get(key)
        if (!pending) return
        const next = pending.filter((item) => item !== waiter)
        if (next.length) waiters.set(key, next)
        else waiters.delete(key)
      }
    },
    entries: snapshot,
    entriesOfSlot: snapshot,
    subscribe(key, fn) {
      const set = listeners.get(key) ?? new Set()
      set.add(fn)
      listeners.set(key, set)
      return () => set.delete(fn)
    },
    getVersion(key) {
      return versions.get(key) ?? 0
    },
    renderSlot(key, input, options) {
      return renderNamed(key, input, options?.entryKey, false)
    },
  }

  return registry
}
