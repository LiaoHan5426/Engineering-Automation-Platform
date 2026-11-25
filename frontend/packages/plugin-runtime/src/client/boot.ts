/**
 * Cordis Client boot for EAP.
 *
 * Shell context → shell slot registry → shell declares the seat catalog
 * → mount root into the shell outlet.
 *
 * The context and slot registry live in this package. Cordis, ui-renderer, and
 * ui-sidebar-right are not loaded.
 * Host remotes (session/settings/workspaceFiles) → py-backend only.
 * No EAP profile.
 */

import { createApp, nextTick, type App } from 'vue'
import { installLayoutSlotFacade } from './layoutFacade'
import { retainLayoutRegions } from './layoutRegions'
import { createHostProxiedRemote, type HostFetch } from './hostRemotes'
import { installReactSlotBridge } from './reactSlotBridge'
import { installShellLayout } from './shellFrame'
import { createShellContext } from './shellContext'
import { createEapSlotRegistry } from './slotRegistry'
import type { ClientContext } from './types'

const COLUMN_ID = 'eap-cordis-sidebar-right'

export type CordisBootHandle = {
  ctx: ClientContext
  dispose: () => void
}

function createMinimalLocale() {
  const listeners = new Set<() => void>()
  let revision = 1
  let snap = { revision }
  const dicts = new Map<string, Record<string, string>>()
  const bump = () => {
    revision += 1
    snap = { revision }
    for (const l of listeners) l()
  }
  return {
    /** LocaleFace extends HostObservable<{ revision }> for the Vue renderer. */
    getSnapshot: () => snap,
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    bind(ns: string) {
      return (key: string, params?: Record<string, unknown>) => {
        const dict = dicts.get(`${ns}:zh`) ?? dicts.get(`${ns}:en`)
        let text = dict?.[key] ?? key
        if (params) {
          for (const [name, value] of Object.entries(params)) {
            text = text.replaceAll(`{${name}}`, String(value))
          }
        }
        return text
      }
    },
    register(ns: string, packs: Record<string, Record<string, string>> | unknown) {
      if (packs && typeof packs === 'object') {
        for (const [lang, dict] of Object.entries(packs as Record<string, Record<string, string>>)) {
          if (dict && typeof dict === 'object') dicts.set(`${ns}:${lang}`, dict)
        }
      }
      bump()
      return () => {}
    },
    getLocale: () => ({ active: 'zh', revision }),
    t: (key: string) => key,
  }
}

function ensureColumn(): HTMLElement {
  let el = document.getElementById(COLUMN_ID)
  if (!el) {
    el = document.createElement('aside')
    el.id = COLUMN_ID
    el.className = 'eap-dsh-rightbar'
    el.setAttribute('data-testid', 'cordis-sidebar-right-column')
    const body = document.querySelector<HTMLElement>('.app .body')
    if (body) body.appendChild(el)
    else document.body.appendChild(el)
  }
  el.removeAttribute('hidden')
  el.setAttribute('data-sidebar-right-seat', '')
  return el
}

/** Marks that the layout right column is seated. It does not open the workspace inspector. */
function applyShellLayout(open: boolean) {
  if (open) document.documentElement.setAttribute('data-sidebar-right-open', '')
  else document.documentElement.removeAttribute('data-sidebar-right-open')
}

/**
 * Boot the slot registry and mount the shell layout into the Vue outlets.
 */
export async function bootCordisClient(options: {
  hostApiBase: string
  fetchHost: HostFetch
}): Promise<CordisBootHandle> {
  const ctx = createShellContext()
  const releaseContext = ctx.dispose.bind(ctx)
  const disposers: Array<() => void> = []

  const slots = createEapSlotRegistry()
  ctx.provide('slots', slots as never)
  disposers.push(installReactSlotBridge(slots))
  installLayoutSlotFacade(slots)

  // 2) Host remotes (DSH namespaces) → py-backend
  const remote = createHostProxiedRemote(options.fetchHost)
  ctx.provide('remote', remote as never)
  ctx.provide('remote.session', remote.session as never)
  ctx.provide('remote.settings', remote.settings as never)
  ctx.provide('remote.workspaceFiles', (remote as { workspaceFiles: unknown }).workspaceFiles as never)

  const locale = createMinimalLocale()
  ctx.provide('locale', locale as never)

  // 2) Declare the catalog tree. The shell owns every seat, including the right column.
  const releaseRegions = retainLayoutRegions()
  disposers.push(releaseRegions)
  const rightbarOwner = {
    width: 380,
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1440,
    canShow: true,
  }
  disposers.push(installShellLayout(slots as never, rightbarOwner))

  // 3) Mount root. The right column is the sidebar-right outlet.
  const column = ensureColumn()
  applyShellLayout(true)
  const shell = document.getElementById('eap-dsh-region-shell')
  if (!shell) throw new Error('missing layout outlet shell')
  let vueApp: App | null = createApp({
    name: 'EapCordisMount',
    setup() {
      return () => slots.renderSlot('root', {})
    },
  })
  vueApp.mount(shell)
  await nextTick()
  disposers.push(() => {
    vueApp?.unmount()
    vueApp = null
    column.setAttribute('hidden', '')
    column.removeAttribute('data-sidebar-right-seat')
    column.replaceChildren()
    applyShellLayout(false)
  })

  // Provide non-fiber helpers a plugin may read via ctx.get / property access.
  ctx.provide('connection', { state: 'connected' } as never)
  ctx.provide('modules', {
    import: async () => {
      throw new Error('MODULE_IMPORT_USE_LOADER')
    },
  } as never)

  return {
    ctx,
    dispose() {
      releaseContext()
      while (disposers.length) {
        try {
          disposers.pop()?.()
        } catch {
          /* ignore */
        }
      }
    },
  }
}
