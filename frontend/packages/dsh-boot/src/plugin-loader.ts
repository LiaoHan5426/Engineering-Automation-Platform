/**
 * Load an enabled DSH npm plugin `./client` after `__DSH_BOOT__` injection.
 * Enablement truth stays on py-backend; this only materializes UI factories.
 */

type ModuleFactory = (require: (id: string) => unknown) => unknown

type LoaderRegistration = {
  id: string
  factory: ModuleFactory
  exports?: unknown
}

declare global {
  interface Window {
    __EAP_PLUGIN_MODULES__?: Map<string, LoaderRegistration>
    __ModuleLoader__?: {
      mode?: string
      pendingQueue?: LoaderRegistration[]
      load: (registration: {
        id: string
        factory: ModuleFactory
        chunk?: string
      }) => void
      get?: (id: string) => unknown
      create?: (options: unknown) => unknown
    }
  }
}

function ensureRegistry(): Map<string, LoaderRegistration> {
  if (!window.__EAP_PLUGIN_MODULES__) {
    window.__EAP_PLUGIN_MODULES__ = new Map()
  }
  return window.__EAP_PLUGIN_MODULES__
}

/**
 * Ensure a registration sink exists. Prefer the Host-injected queue loader;
 * otherwise install a simple EAP registry for script-tag clients.
 */
export function ensurePluginModuleSink(): Map<string, LoaderRegistration> {
  const registry = ensureRegistry()
  const existing = window.__ModuleLoader__
  if (existing && typeof existing.load === 'function') {
    const prior = existing.load.bind(existing)
    existing.load = (registration) => {
      registry.set(registration.id, {
        id: registration.id,
        factory: registration.factory,
      })
      prior(registration)
    }
    return registry
  }
  window.__ModuleLoader__ = {
    mode: 'eap-registry',
    load(registration) {
      registry.set(registration.id, {
        id: registration.id,
        factory: registration.factory,
      })
    },
    get(id) {
      return registry.get(id)?.exports
    },
  }
  return registry
}

export async function loadEnabledClient(options: {
  name: string
  clientUrl: string
  require?: (id: string) => unknown
}): Promise<{ apply: (ctx: unknown) => void; inject?: string[] }> {
  const registry = ensurePluginModuleSink()
  if (!registry.has(options.name)) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = options.clientUrl
      script.async = true
      script.dataset.eapPlugin = options.name
      script.onload = () => resolve()
      script.onerror = () => reject(new Error(`CLIENT_SCRIPT_LOAD_FAILED:${options.name}`))
      document.head.appendChild(script)
    })
  }
  const registration = registry.get(options.name)
  if (!registration) {
    throw new Error(`CLIENT_MODULE_NOT_REGISTERED:${options.name}`)
  }
  const requireFn =
    options.require ??
    ((id: string): unknown => {
      throw new Error(`MODULE_NOT_PROVIDED:${id}`)
    })
  if (!registration.exports) {
    registration.exports = registration.factory(requireFn)
  }
  const mod = registration.exports as { apply?: (ctx: unknown) => void; inject?: string[] }
  if (typeof mod.apply !== 'function') {
    throw new Error(`CLIENT_APPLY_MISSING:${options.name}`)
  }
  return { apply: mod.apply, inject: mod.inject }
}

export function disposePluginDom(name: string): void {
  document.querySelectorAll(`[data-eap-plugin="${CSS.escape(name)}"]`).forEach((node) => {
    node.remove()
  })
  document.querySelectorAll(`[data-dsh-plugin="${CSS.escape(name)}"]`).forEach((node) => {
    node.remove()
  })
  document.querySelectorAll('[data-dsh-better-sidebar]').forEach((node) => {
    if (name === 'dsh-better-sidebar') node.remove()
  })
}
