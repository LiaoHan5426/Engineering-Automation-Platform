import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as JsxRuntime from 'react/jsx-runtime'
import { createPluginUi } from './client/pluginUi'

type ModuleFactory = (require: (id: string) => unknown) => unknown

type LoaderRegistration = {
  id: string
  factory: ModuleFactory
  exports?: unknown
}

declare global {
  interface Window {
    __ModuleLoader__?: {
      mode?: string
      pendingQueue?: LoaderRegistration[]
      load: (registration: { id: string; factory: ModuleFactory; chunk?: string }) => void
      get?: (id: string) => unknown
      create?: (options: unknown) => unknown
    }
    __EAP_PLUGIN_MODULES__?: Map<string, LoaderRegistration>
  }
}

const pluginUi = createPluginUi()

/** Resolve one module id inside a plugin client bundle. */
export function pluginRequire(id: string, filesBaseUrl = ''): unknown {
  if (id === 'react') return React
  if (id === 'react/jsx-runtime') return JsxRuntime
  if (id === 'react-dom') return ReactDOM
  if (id === 'react-dom/client') return ReactDOMClient
  if (id === '@deepseek-ai/dsh-client-ui-primitives') return pluginUi
  if (id.startsWith('.') || id.startsWith('/')) {
    throw new Error(`RELATIVE_REQUIRE_UNSUPPORTED:${id}@${filesBaseUrl}`)
  }
  throw new Error(`MODULE_NOT_PROVIDED:${id}`)
}

function createRequire(filesBaseUrl: string) {
  return (id: string): unknown => pluginRequire(id, filesBaseUrl)
}

/**
 * Install `__ModuleLoader__` so packaged `./client` scripts can register.
 * Forbidden: executing Host/Agent code from these factories beyond UI apply().
 */
export function ensureModuleLoader(): Map<string, LoaderRegistration> {
  if (!window.__EAP_PLUGIN_MODULES__) {
    window.__EAP_PLUGIN_MODULES__ = new Map()
  }
  const registry = window.__EAP_PLUGIN_MODULES__
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

export async function loadClientModule(options: {
  name: string
  clientUrl: string
  filesBaseUrl: string
}): Promise<{ apply: (ctx: unknown) => void; inject?: string[] }> {
  const registry = ensureModuleLoader()
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
  if (!registration.exports) {
    registration.exports = registration.factory(createRequire(options.filesBaseUrl))
  }
  const mod = registration.exports as { apply?: (ctx: unknown) => void; inject?: string[] }
  if (typeof mod.apply !== 'function') {
    throw new Error(`CLIENT_APPLY_MISSING:${options.name}`)
  }
  return { apply: mod.apply, inject: mod.inject }
}
