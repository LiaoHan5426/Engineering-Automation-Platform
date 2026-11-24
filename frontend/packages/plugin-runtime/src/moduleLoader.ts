import * as React from 'react'
import * as ReactDOM from 'react-dom'
import * as ReactDOMClient from 'react-dom/client'
import * as JsxRuntime from 'react/jsx-runtime'

type ModuleFactory = (require: (id: string) => unknown) => unknown

type LoaderRegistration = {
  id: string
  factory: ModuleFactory
  exports?: unknown
}

declare global {
  interface Window {
    __ModuleLoader__?: {
      load: (registration: { id: string; factory: ModuleFactory; chunk?: string }) => void
      get: (id: string) => unknown
    }
    __EAP_PLUGIN_MODULES__?: Map<string, LoaderRegistration>
  }
}

function stubUiPrimitives(): Record<string, unknown> {
  const cache = new Map<string, unknown>()
  return new Proxy(
    { __esModule: true },
    {
      get(_target, prop) {
        if (prop === '__esModule') return true
        if (prop === 'default') return _target
        if (typeof prop !== 'string') return undefined
        if (cache.has(prop)) return cache.get(prop)
        if (prop.startsWith('use')) {
          const hook = () => undefined
          cache.set(prop, hook)
          return hook
        }
        if (prop === 'writeClipboard') {
          const fn = async (text: string) => {
            try {
              await navigator.clipboard.writeText(text)
            } catch {
              /* ignore */
            }
          }
          cache.set(prop, fn)
          return fn
        }
        if (prop === 'classifyFileType' || prop === 'fileSizeText') {
          const fn = (value: unknown) => String(value ?? '')
          cache.set(prop, fn)
          return fn
        }
        // FileTypeIcon is the guide/file-tree folder glyph — a blank stub
        // reads as "host forgot the icon", so draw a minimal folder shape.
        if (prop === 'FileTypeIcon') {
          const FileTypeIcon = (props: { size?: number; kind?: string; className?: string }) => {
            const size = typeof props.size === 'number' ? props.size : 16
            return React.createElement(
              'svg',
              {
                width: size,
                height: size,
                viewBox: '0 0 16 16',
                fill: 'currentColor',
                'aria-hidden': true,
                'data-eap-ui-stub': 'FileTypeIcon',
                'data-kind': props.kind,
                className: props.className,
              },
              React.createElement('path', {
                d: 'M1.5 3.5A1.5 1.5 0 0 1 3 2h3.2c.4 0 .77.2 1 .5L8 3h5a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 13 13H3a1.5 1.5 0 0 1-1.5-1.5v-8Z',
              }),
            )
          }
          cache.set(prop, FileTypeIcon)
          return FileTypeIcon
        }
        const Comp = React.forwardRef(function EapUiStub(
          props: Record<string, unknown>,
          ref: React.Ref<HTMLDivElement>,
        ) {
          return React.createElement(
            'div',
            {
              ref,
              'data-eap-ui-stub': prop,
              className: typeof props.className === 'string' ? props.className : undefined,
            },
            props.children as React.ReactNode,
          )
        })
        Comp.displayName = `EapUiStub(${prop})`
        cache.set(prop, Comp)
        return Comp
      },
    },
  ) as Record<string, unknown>
}

const uiPrimitives = stubUiPrimitives()

function createRequire(filesBaseUrl: string) {
  return (id: string): unknown => {
    if (id === 'react') return React
    if (id === 'react/jsx-runtime') return JsxRuntime
    if (id === 'react-dom') return ReactDOM
    if (id === 'react-dom/client') return ReactDOMClient
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return uiPrimitives
    // Relative requires inside the bundle should not escape to Host logic in-browser.
    if (id.startsWith('.') || id.startsWith('/')) {
      throw new Error(`RELATIVE_REQUIRE_UNSUPPORTED:${id}@${filesBaseUrl}`)
    }
    throw new Error(`MODULE_NOT_PROVIDED:${id}`)
  }
}

/**
 * Install DSH `__ModuleLoader__` so packaged `./client` scripts can register.
 * Forbidden: executing Host/Agent code from these factories beyond UI apply().
 */
export function ensureModuleLoader(): Map<string, LoaderRegistration> {
  if (!window.__EAP_PLUGIN_MODULES__) {
    window.__EAP_PLUGIN_MODULES__ = new Map()
  }
  const registry = window.__EAP_PLUGIN_MODULES__
  window.__ModuleLoader__ = {
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
