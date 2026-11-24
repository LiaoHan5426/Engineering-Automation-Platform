/**
 * Cordis Client boot for EAP — real dsh-personal packages, no hand-rolled seat.
 *
 * Mirrors SlotTestRuntime / apply.client.spec peers:
 * Context → SlotRegistry + Vue renderer → declare rightbar → ui-sidebar-right.apply
 * → mount rightbar into #eap-cordis-sidebar-right.
 *
 * Host remotes (session/settings/workspaceFiles) → py-backend only.
 * No EAP profile.
 */

import { Context } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import { MenuRegistry } from '@deepseek-ai/dsh-client-ui-context-menu/src/client/registry.ts'
import { createContextMenuBindings } from '@deepseek-ai/dsh-client-ui-context-menu/src/client/trigger.ts'
import { SlotRegistry } from '@deepseek-ai/dsh-client-ui-renderer/src/client/registry.ts'
import { createVueSlotRenderer } from '@deepseek-ai/dsh-client-ui-renderer/src/client/vue/slots.ts'
import {
  apply as applySidebarRight,
  inject as sidebarRightInject,
} from '@deepseek-ai/dsh-client-ui-sidebar-right/src/client/index.ts'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createApp, defineComponent, Fragment, h, type App } from 'vue'
import { createHostProxiedRemote, type HostFetch } from './hostRemotes'
import { installReactSlotBridge } from './reactSlotBridge'
import type { ClientContext } from './types'

const COLUMN_ID = 'eap-cordis-sidebar-right'
const SESSION = 'eap' as SessionId

export type CordisBootHandle = {
  ctx: ClientContext
  dispose: () => void
}

function createMinimalSessions() {
  const listSnap = {
    items: [{ id: SESSION, cwd: '/' }],
    byId: { [SESSION]: { id: SESSION, cwd: '/', title: 'EAP' } },
    archivedSessionIds: [] as string[],
  }
  const list = {
    getSnapshot: () => listSnap,
    subscribe: (_fn: () => void) => () => {},
  }
  return {
    list,
    retain(sessionId: SessionId, _opts?: unknown) {
      const reference = {
        sessionId,
        ready: Promise.resolve(),
        release: () => {},
        source: 'sidebarView' as const,
      }
      return reference
    },
    retainInfo: (_id: SessionId) => ({
      getSnapshot: () => ({ counts: {} }),
      subscribe: () => () => {},
    }),
  }
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
    el.className = 'workspace-inspector eap-dsh-rightbar'
    el.setAttribute('data-testid', 'cordis-sidebar-right-column')
    const body = document.querySelector<HTMLElement>('.app .body')
    if (body) body.appendChild(el)
    else document.body.appendChild(el)
  }
  el.removeAttribute('hidden')
  el.setAttribute('data-sidebar-right-seat', '')
  return el
}

function applyShellLayout(open: boolean) {
  const app = document.querySelector('.app')
  const body = document.querySelector('.app .body')
  if (open) {
    app?.classList.add('app--inspector')
    body?.classList.add('body--inspector')
    document.documentElement.setAttribute('data-sidebar-right-open', '')
  } else {
    app?.classList.remove('app--inspector')
    body?.classList.remove('body--inspector')
    document.documentElement.removeAttribute('data-sidebar-right-open')
  }
  document
    .querySelectorAll(`.workspace-inspector:not([data-sidebar-right-seat]):not(#${COLUMN_ID})`)
    .forEach((node) => {
      ;(node as HTMLElement).style.display = open ? 'none' : ''
    })
}

/**
 * Boot real Cordis Client packages and mount ui-sidebar-right into the Vue column.
 */
export async function bootCordisClient(options: {
  hostApiBase: string
  fetchHost: HostFetch
}): Promise<CordisBootHandle> {
  const ctx = new Context()
  const disposers: Array<() => void> = []

  // 1) Real SlotRegistry (ui-renderer) + Vue slot renderer
  const slotsFiber = ctx.plugin(SlotRegistry)
  await slotsFiber.await()
  const slots = ctx.get('slots') as InstanceType<typeof SlotRegistry>
  const vueRenderer = createVueSlotRenderer()
  slots.install(vueRenderer)
  disposers.push(installReactSlotBridge(slots as never))

  // 2) Host remotes (DSH namespaces) → py-backend
  const remote = createHostProxiedRemote(options.fetchHost)
  ctx.provide('remote', remote as never)
  ctx.provide('remote.session', remote.session as never)
  ctx.provide('remote.settings', remote.settings as never)
  ctx.provide('remote.workspaceFiles', (remote as { workspaceFiles: unknown }).workspaceFiles as never)

  // 3) Inject peers required by ui-sidebar-right.apply
  const sessions = createMinimalSessions()
  ctx.provide('sessions', sessions as never)

  const currentSession = createSnapshotStore<{ key: SessionId | undefined }>({ key: SESSION })
  ctx.provide('uiSession', { adapter: { current: currentSession } } as never)

  const panelInfo = createSnapshotStore<{ activePanelId: string | null }>({ activePanelId: null })
  const layout = {
    openRightbar: (track: boolean, _fullscreen?: boolean) => {
      applyShellLayout(true)
      document.documentElement.setAttribute('data-sidebar-right-track', track ? '1' : '0')
    },
    closeRightbar: () => {
      applyShellLayout(false)
    },
    panelInfo,
  }
  ctx.provide('layout', layout as never)

  const locale = createMinimalLocale()
  ctx.provide('locale', locale as never)
  slots.installLocale(locale as never)

  const shortcutCatalog = createSnapshotStore<readonly unknown[]>([])
  ctx.provide('shortcuts', {
    runtime: 'web',
    register: () => () => {},
    catalog: shortcutCatalog,
    closeWindow: async () => {},
  } as never)

  ctx.provide('resources', {
    pin: (_address: string, _signal: AbortSignal) => {},
  } as never)

  const menus = new MenuRegistry(() => {})
  disposers.push(() => menus.dispose())
  const activeMenu = createSnapshotStore<unknown>(undefined)
  ctx.provide('contextMenus', {
    register: menus.register.bind(menus),
    open: () => {},
    active: activeMenu,
  } as never)

  // Minimal remoteAccess so session-scoped hooks do not throw
  ctx.provide('remoteAccess', {
    source: () => ({ getSnapshot: () => ({ allowed: true }), subscribe: () => () => {} }),
  } as never)

  // Session scope adapter (passthrough SessionProvider)
  slots.installScope('session', {
    current: createSnapshotStore({
      key: SESSION as string,
      props: { sessionId: SESSION },
      ctx,
    }),
    bindingSource: (target: { sessionId?: SessionId } | undefined) => {
      const key = (target && 'sessionId' in (target as object)
        ? (target as { sessionId: SessionId }).sessionId
        : SESSION) as string
      return createSnapshotStore({
        key,
        props: { sessionId: key },
        ctx,
      })
    },
    renderArea: (binding, props) => {
      if (binding.key === undefined) return props.empty?.() ?? null
      return props.children
    },
  } as never)

  // RightbarSeat reads GlobalStandardProps.useContextMenu (normally installed by
  // ui-context-menu.apply via provideRoot). Stub bindings keep the seat alive
  // without the full menu overlay roster.
  const menuBindings = createContextMenuBindings(() => {}, () => true)
  slots.provideRoot({
    hooks: {
      panelInfo,
      sessions: sessions.list,
    },
    props: {
      useContextMenu: () => menuBindings,
    },
  })

  // 4) Declare frame holes occupied by ui-sidebar-right
  const ownerCell = {
    rightbar: {
      width: 380,
      viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1440,
      canShow: true,
    },
  }
  const AutoFrame = defineComponent({
    name: 'EapCordisRightbarFrame',
    props: ['renderSlot', 'SessionProvider'],
    setup(props) {
      return () => {
        const renderSlot = props.renderSlot as (
          key: string,
          owner: object,
          opts?: object,
        ) => unknown
        return h(Fragment, null, [renderSlot('rightbar', ownerCell.rightbar)])
      }
    },
  })

  const disposeRoot = slots.register(
    {
      name: 'root',
      children: {
        rightbar: { kind: 'single', scope: 'root' },
        'conversation.session.header.corner': { kind: 'single', scope: 'session' },
        'shell.overlay': { kind: 'list', scope: 'root' },
        'contextMenu.icon': { kind: 'keyed', scope: 'root' },
        'contextMenu.content': { kind: 'keyed', scope: 'root' },
      },
    } as never,
    AutoFrame as never,
  )
  disposers.push(disposeRoot)

  // 5) Real ui-sidebar-right apply
  const missing = sidebarRightInject.filter((name) => ctx.get(name) === undefined)
  if (missing.length) {
    throw new Error(`ui-sidebar-right inject missing: ${missing.join(', ')}`)
  }
  const sidebarFiber = ctx.plugin({
    inject: [...sidebarRightInject],
    apply: applySidebarRight,
  })
  await sidebarFiber.await()

  // Select session so RightbarRoot has a view
  currentSession.set({ key: SESSION })

  // 6) Mount root → rightbar into Vue column
  const column = ensureColumn()
  applyShellLayout(true)
  let vueApp: App | null = createApp({
    name: 'EapCordisMount',
    setup() {
      return () => slots.renderSlot('root', {})
    },
  })
  vueApp.mount(column)
  disposers.push(() => {
    vueApp?.unmount()
    vueApp = null
    column.setAttribute('hidden', '')
    column.removeAttribute('data-sidebar-right-seat')
    column.replaceChildren()
    applyShellLayout(false)
  })

  // Expand + open guide so GuideBody mounts (docked bodies stay off while collapsed).
  const sidebarRight = ctx.get('sidebarRight') as
    | { openTab?: (kind: string) => void }
    | undefined
  sidebarRight?.openTab?.('guide')

  // Provide non-fiber helpers better-sidebar may read via ctx.get / property access.
  ctx.provide('connection', { state: 'connected' } as never)
  ctx.provide('modules', {
    import: async () => {
      throw new Error('MODULE_IMPORT_USE_LOADER')
    },
  } as never)

  return {
    // Cordis Context is the ClientContext; services come from provide/get.
    ctx: ctx as unknown as ClientContext,
    dispose() {
      void sidebarFiber.dispose()
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
