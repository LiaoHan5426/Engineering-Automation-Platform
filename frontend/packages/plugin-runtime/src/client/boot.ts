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

import { createAppI18n } from '@eap/i18n'
import { pluginRequire } from '../moduleLoader'
import { createApp, Fragment, h, nextTick, Teleport, type App } from 'vue'
import { installLayoutSlotFacade } from './layoutFacade'
import { retainLayoutRegions } from './layoutRegions'
import { createHostProxiedRemote, type HostFetch } from './hostRemotes'
import { installReactSlotBridge } from './reactSlotBridge'
import { installShellLayout } from './shellFrame'
import { createShellContext } from './shellContext'
import { createSidebarSeat, WORKSPACE_SEAT } from './sidebarSeat'
import { createEapSlotRegistry } from './slotRegistry'
import type { ClientContext, LocaleService } from './types'

import './pluginTheme.css'

const COLUMN_ID = 'eap-cordis-sidebar-right'

export type CordisBootHandle = {
  ctx: ClientContext
  dispose: () => void
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
  locale?: LocaleService
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
  ctx.provide(
    'remote.workspaceFiles',
    (remote as { workspaceFiles: unknown }).workspaceFiles as never,
  )

  const locale =
    options.locale ??
    createAppI18n({
      locale: 'zh-CN',
      fallbackLocale: 'en-US',
    }).createPluginLocale('cordis')
  ctx.provide('locale', locale as never)

  // A workspace presentation seat, backed by py-backend's cwd.
  const listeners = new Set<() => void>()
  let sessionSnapshot: { byId: Record<string, { cwd: string }> } = { byId: {} }
  ctx.provide('sessions', {
    list: {
      getSnapshot: () => sessionSnapshot,
      subscribe(listener: () => void) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
  })
  void options
    .fetchHost('session.cwd', { sessionId: WORKSPACE_SEAT })
    .then((value) => {
      const cwd = (value as { cwd?: unknown } | null)?.cwd
      if (typeof cwd !== 'string' || !cwd) return
      sessionSnapshot = { byId: { [WORKSPACE_SEAT]: { cwd } } }
      for (const listener of listeners) listener()
    })
    .catch(() => {})
  disposers.push(() => listeners.clear())

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
  const sidebar = createSidebarSeat(
    slots,
    column,
    options.locale && (() => locale.t('desktop.sidebarStart')),
    options.locale && (() => locale.t('desktop.sidebarNewTab')),
  )
  disposers.push(sidebar.dispose)
  ctx.provide('sidebarRightTabs', sidebar.registry)
  ctx.provide('sidebarRight', sidebar.controller)
  applyShellLayout(true)
  const shell = document.getElementById('eap-dsh-region-shell')
  if (!shell) throw new Error('missing layout outlet shell')
  let vueApp: App | null = createApp({
    name: 'EapCordisMount',
    setup() {
      return () =>
        h(Fragment, [slots.renderSlot('root', {}), h(Teleport, { to: column }, [h(sidebar.View)])])
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
    import: async (specifier: string) => pluginRequire(specifier),
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
