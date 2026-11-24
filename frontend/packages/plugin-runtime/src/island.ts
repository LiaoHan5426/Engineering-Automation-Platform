/**
 * Cordis Client UI island — presentation only.
 *
 * Boots real dsh-personal Cordis packages (ui-renderer + ui-sidebar-right.apply),
 * then loads plugin `./client`. Host remotes → py-backend.
 * Forbidden: install/enable, Agent loop, forging Host success, EAP profile.
 */

import type { PluginUiContribution } from '@eap/runtime-client'
import { bootCordisClient, type CordisBootHandle } from './client/boot'
import { ensureDshCenterAnchor } from './centerAnchor'
import { loadClientModule } from './moduleLoader'

export type IslandHandle = {
  name: string
  dispose: () => void
}

export type IslandHost = {
  sync: (contributions: PluginUiContribution[]) => Promise<void>
  dispose: () => void
  mounted: () => string[]
}

function createHostFetch(hostApiBase: string) {
  return async (method: string, body: Record<string, unknown> = {}) => {
    const response = await fetch(
      `${hostApiBase}/sidebar/api/${encodeURIComponent(method)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      },
    )
    const envelope = (await response.json()) as {
      ok?: boolean
      value?: unknown
      error?: { code?: string; message?: string }
      controlPlane?: string
    }
    if (envelope.controlPlane && envelope.controlPlane !== 'py-backend') {
      throw new Error('INVALID_HOST_CONTROL_PLANE')
    }
    if (!response.ok || envelope.ok !== true) {
      throw new Error(envelope.error?.code ?? `HOST_API_${response.status}`)
    }
    return envelope.value
  }
}

export function createPluginIsland(): IslandHost {
  const active = new Map<
    string,
    { boot: CordisBootHandle; handle: IslandHandle }
  >()
  let sharedAnchorRelease: (() => void) | null = null

  const retainAnchor = () => {
    if (!sharedAnchorRelease) sharedAnchorRelease = ensureDshCenterAnchor()
  }
  const releaseAnchorIfIdle = () => {
    if (active.size === 0 && sharedAnchorRelease) {
      sharedAnchorRelease()
      sharedAnchorRelease = null
    }
  }

  return {
    async sync(contributions) {
      const wanted = new Set(contributions.map((item) => item.name))
      for (const [name, entry] of active) {
        if (!wanted.has(name)) {
          entry.handle.dispose()
          active.delete(name)
        }
      }
      releaseAnchorIfIdle()
      for (const contrib of contributions) {
        if (contrib.controlPlane !== 'py-backend') {
          throw new Error('INVALID_PLUGIN_CONTROL_PLANE')
        }
        if (active.has(contrib.name)) continue
        retainAnchor()
        const fetchHost = createHostFetch(contrib.hostApiBase)
        const boot = await bootCordisClient({
          hostApiBase: contrib.hostApiBase,
          fetchHost,
        })
        try {
          const mod = await loadClientModule({
            name: contrib.name,
            clientUrl: contrib.clientUrl,
            filesBaseUrl: contrib.filesBaseUrl,
          })
          mod.apply(boot.ctx)
        } catch (error) {
          boot.dispose()
          document.querySelectorAll('[data-dsh-better-sidebar]').forEach((node) => node.remove())
          releaseAnchorIfIdle()
          throw error
        }
        await Promise.resolve()
        await Promise.resolve()
        const handle: IslandHandle = {
          name: contrib.name,
          dispose: () => {
            boot.dispose()
            document.querySelectorAll(`[data-dsh-better-sidebar]`).forEach((node) => node.remove())
            document
              .querySelectorAll(`script[data-eap-plugin="${contrib.name}"]`)
              .forEach((node) => node.remove())
          },
        }
        active.set(contrib.name, { boot, handle })
      }
    },
    dispose() {
      for (const entry of active.values()) entry.handle.dispose()
      active.clear()
      releaseAnchorIfIdle()
    },
    mounted() {
      return [...active.keys()]
    },
  }
}

export function islandControlSurface(): ReadonlyArray<string> {
  return ['sync', 'dispose', 'mounted']
}
