/**
 * Plugin client context owned by the shell.
 * Provides services, runs `effect` disposers on dispose, and does not load Cordis.
 */
import type { ClientContext, Disposer } from './types'

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

export function createShellContext(): ClientContext {
  const services = new Map<string, unknown>()
  const effects: Disposer[] = []
  let disposed = false

  const ctx = {
    provide(name: string, value: unknown) {
      services.set(name, value)
      if (IDENTIFIER.test(name)) {
        ;(ctx as Record<string, unknown>)[name] = value
      }
    },
    get(name: string) {
      return services.get(name)
    },
    inject(deps: string | string[], callback: (injected: ClientContext) => Disposer | void) {
      const names = Array.isArray(deps) ? deps : [deps]
      const missing = names.filter((name) => !services.has(name))
      if (missing.length) {
        throw new Error(`shell context inject missing: ${missing.join(', ')}`)
      }
      const stop = callback(ctx as ClientContext)
      if (typeof stop === 'function') effects.push(stop)
      return () => stop?.()
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
