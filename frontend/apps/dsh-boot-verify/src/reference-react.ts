import { registerProductPanels } from './product-panels'
import { mergeEnablement } from '@eap/dsh-boot/enablement'
import { createReactSlotWrapper, isReactComponent, pluginRequire } from '@eap/plugin-runtime'
import { startReference } from './reference'

type BundleRequire = (id: string) => unknown
type Registration = { id: string; factory: (require: BundleRequire) => unknown }
type RegistrationQueue = {
  mode: string
  load: (registration: Registration) => void
  create: (options: unknown) => unknown
}

const loader = Reflect.get(window, '__ModuleLoader__') as RegistrationQueue | undefined
if (loader?.mode !== 'queue' || typeof loader.load !== 'function') {
  throw new Error('React modules require the reference Host boot queue')
}

type ReferenceVue = Parameters<typeof createReactSlotWrapper>[1]
type ReactSlot = Parameters<typeof createReactSlotWrapper>[0]
type Guide = { icon?: unknown }
type TabDescriptor = { guide?: Guide[] }

function scopeLegacyContext(ctx: object, vue: ReferenceVue): object {
  const slots = Reflect.get(ctx, 'slots') as object
  const scopedSlots = new Proxy(slots, {
    get(target, key) {
      const value = Reflect.get(target, key)
      if (key === 'register') {
        return (options: { name?: string }, component: unknown) =>
          value.call(
            target,
            options,
            isReactComponent(component)
              ? createReactSlotWrapper(
                  component as ReactSlot,
                  vue,
                  options.name?.startsWith('sidebar.right.pane.tab')
                    ? [
                        'useTabInfo',
                        'ctx',
                        'store',
                        'service',
                        'records',
                        'descriptorId',
                        'sessionId',
                        'paramsOf',
                        'sessionIdOf',
                        'diagnostics',
                      ]
                    : [],
                )
              : component,
          )
      }
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  return new Proxy(ctx, {
    get(target, key, receiver) {
      if (key === 'slots') return scopedSlots
      const value = Reflect.get(target, key, receiver)
      if (key === 'inject' && typeof value === 'function') {
        return (names: unknown, callback: unknown, ...tail: unknown[]) =>
          value.call(
            target,
            names,
            typeof callback === 'function'
              ? (child: object, ...args: unknown[]) =>
                  callback(scopeLegacyContext(child, vue), ...args)
              : callback,
            ...tail,
          )
      }
      if (key === 'get' && typeof value === 'function') {
        return (name: string, ...args: unknown[]) => {
          const service = value.call(target, name, ...args)
          if (name !== 'sidebarRightTabs' || !service) return service
          return new Proxy(service, {
            get(registry, property) {
              const member = Reflect.get(registry, property)
              if (property === 'register') {
                return (tab: TabDescriptor) =>
                  member.call(registry, {
                    ...tab,
                    ...(tab.guide && {
                      guide: tab.guide.map((entry) =>
                        isReactComponent(entry.icon)
                          ? {
                              ...entry,
                              icon: createReactSlotWrapper(entry.icon as ReactSlot, vue, [
                                'size',
                                'className',
                              ]),
                            }
                          : entry,
                      ),
                    }),
                  })
              }
              return typeof member === 'function' ? member.bind(registry) : member
            },
          })
        }
      }
      return value
    },
  })
}

const primitives = pluginRequire('@deepseek-ai/dsh-client-ui-primitives')
function scopeLegacyRegistration(registration: Registration): Registration {
  if (registration.id !== 'dsh-better-sidebar') return registration
  return {
    ...registration,
    factory(require) {
      const scoped = Object.assign(
        (id: string) => (id === '@deepseek-ai/dsh-client-ui-primitives' ? primitives : require(id)),
        require,
      )
      const exported = registration.factory(scoped)
      if (
        !exported ||
        typeof exported !== 'object' ||
        !('apply' in exported) ||
        typeof exported.apply !== 'function'
      )
        return exported

      const apply = exported.apply as (ctx: object) => unknown
      const vue = require('vue') as Parameters<typeof createReactSlotWrapper>[1]
      return {
        ...exported,
        apply(ctx: object) {
          return apply(scopeLegacyContext(ctx, vue))
        },
      }
    },
  }
}
function scopeLoad(target: RegistrationQueue) {
  const load = target.load.bind(target)
  target.load = (registration) => {
    if (!artifactMode || registration.id !== '@deepseek-ai/dsh-client-ui-sidebar') {
      return load(scopeLegacyRegistration(registration))
    }
    return load({
      ...registration,
      factory(require) {
        const exported = registration.factory(require) as {
          apply(ctx: Parameters<typeof registerProductPanels>[0]): void
        }
        return {
          ...exported,
          apply(ctx: Parameters<typeof registerProductPanels>[0]) {
            exported.apply(ctx)
            registerProductPanels(
              ctx,
              require('vue') as Parameters<typeof registerProductPanels>[1],
            )
          },
        }
      },
    })
  }
}

type GraphEntries = { sync(graph: unknown): Promise<void> }

const artifactMode = document.querySelector('[data-eap-artifact-graph]') !== null
const coreGraph = Reflect.get(window, '__DSH_BOOT__') as Parameters<typeof mergeEnablement>[0]
async function loadArtifactGraph(signal?: AbortSignal) {
  const response = await fetch('/api/plugins/contributions', {
    signal: signal ?? null,
    cache: 'no-store',
  })
  if (!response.ok) throw new Error(`Plugin contributions request failed (${response.status})`)
  const body = (await response.json()) as { uiClients: Parameters<typeof mergeEnablement>[1] }
  return mergeEnablement(coreGraph, body.uiClients)
}

function watchArtifactGraph(entries: GraphEntries) {
  const controller = new AbortController()
  let timer: number | undefined
  let appliedGraph: string | undefined
  const refresh = async () => {
    try {
      const graph = await loadArtifactGraph(controller.signal)
      const serialized = JSON.stringify(graph)
      if (serialized !== appliedGraph && !controller.signal.aborted) {
        await entries.sync(graph)
        appliedGraph = serialized
      }
    } catch (error) {
      if (!controller.signal.aborted) console.error(error)
    } finally {
      if (!controller.signal.aborted) timer = window.setTimeout(refresh, 1500)
    }
  }
  timer = window.setTimeout(refresh, 1500)
  window.addEventListener(
    'pagehide',
    () => {
      window.clearTimeout(timer)
      controller.abort()
    },
    { once: true },
  )
}

scopeLoad(loader)
const create = loader.create.bind(loader)
loader.create = (options) => {
  const result = create(options)
  // create() switches the queue to its live registration implementation.
  scopeLoad(loader)
  if (artifactMode) {
    const system = result as { entries: GraphEntries }
    watchArtifactGraph(system.entries)
  }
  return result
}

for (const id of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
  loader.load({ id, factory: () => pluginRequire(id) })
}
if (artifactMode) {
  void loadArtifactGraph()
    .then((graph) => {
      Reflect.set(window, '__DSH_BOOT__', graph)
      startReference()
    })
    .catch((error: unknown) => {
      const root = document.getElementById('root')
      if (root) root.textContent = '无法加载插件启动配置。'
      console.error(error)
    })
} else {
  startReference()
}
