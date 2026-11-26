/**
 * Plugin client context owned by the shell.
 * Provides services, runs `effect` disposers on dispose, and does not load Cordis.
 */
import type { ClientContext, Disposer } from './types'

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

export function createShellContext(): ClientContext {
  const services = new Map<string, unknown>()
  const effects: Disposer[] = []
  const waiting = new Set<() => void>()
  let disposed = false

  const ctx = {
    provide(name: string, value: unknown) {
      services.set(name, value)
      if (IDENTIFIER.test(name)) {
        ;(ctx as Record<string, unknown>)[name] = value
      }
      for (const activate of [...waiting]) activate()
    },
    get(name: string) {
      return services.get(name)
    },
    inject(deps: string | string[], callback: (injected: ClientContext) => Disposer | void) {
      const names = Array.isArray(deps) ? deps : [deps]
      let stop: Disposer | void
      let cancelled = false
      const activate = () => {
        if (cancelled || disposed || names.some((name) => !services.has(name))) return
        waiting.delete(activate)
        stop = callback(ctx as ClientContext)
        if (cancelled || disposed) stop?.()
      }
      const cancel = () => {
        if (cancelled) return
        cancelled = true
        waiting.delete(activate)
        const cleanup = stop
        stop = undefined
        cleanup?.()
      }
      waiting.add(activate)
      effects.push(cancel)
      activate()
      return cancel
    },
    effect(factory: () => Disposer | void) {
      const stop = factory()
      if (typeof stop === 'function') effects.push(stop)
      return () => stop?.()
    },
    dispose() {
      if (disposed) return
      disposed = true
      while (effects.length) {
        try {
          effects.pop()?.()
        } catch {
          /* dispose continues */
        }
      }
    },
  }

  return ctx as ClientContext
}
