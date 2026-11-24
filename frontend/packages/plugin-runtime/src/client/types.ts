/** Shared Cordis Client island types (UI-only; no Host/Agent authority). */

export type Disposer = () => void

export type SlotEntry = {
  name: string
  id?: string
  key?: string
  order?: number
  label?: () => string
  inject?: ((...args: unknown[]) => Record<string, unknown>) | (() => Record<string, unknown>)
  render?: (props: Record<string, unknown>) => unknown
  options?: Record<string, unknown>
}

export type SlotService = {
  inject: (name: string, factory: () => Disposer | void) => Disposer
  register: (
    meta: SlotEntry,
    render?: (props: Record<string, unknown>) => unknown,
  ) => Disposer
  entries: (name: string) => SlotEntry[]
  entriesOfSlot: (name: string) => Array<{ options: SlotEntry }>
  subscribe: (name: string, listener: () => void) => Disposer
}

export type LocaleService = {
  register: (ns: string, lang: string, dict: Record<string, string>) => Disposer
  subscribe: (listener: () => void) => Disposer
  getSnapshot: () => { active: string; revision: number }
  getLocale: () => { active: string; revision: number }
  bind: (ns: string) => (key: string, params?: Record<string, unknown>) => string
  t: (key: string) => string
  publish?: (active: string, force?: boolean) => void
}

export type ClientModules = {
  import: (specifier: string) => Promise<unknown>
}

/**
 * Host remotes that affect Agent / session / fs / settings must call py-backend.
 * Pure UI peers (layout expand, guide open) stay on the Client assembly.
 */
export type RemoteFacade = {
  $on: (event: string, listener: (...args: unknown[]) => void) => Disposer
  session: {
    canOpenWorkspacePath?: () => boolean
    openWorkspacePath?: (args: unknown) => Promise<unknown>
    workspacePathApplications?: (args: unknown) => Promise<unknown>
    cwd?: (args?: unknown) => Promise<unknown>
    phase?: (args?: unknown) => Promise<unknown>
  }
  fs?: {
    tree?: (args: unknown) => Promise<unknown>
    trees?: (args: unknown) => Promise<unknown>
    read?: (args: unknown) => Promise<unknown>
  }
  /** DSH api-remotes namespace (maps to Host fs.* on py-backend). */
  workspaceFiles?: {
    tree?: (args: unknown) => Promise<unknown>
    trees?: (args: unknown) => Promise<unknown>
    read?: (args: unknown) => Promise<unknown>
    [method: string]: ((args?: unknown) => Promise<unknown>) | undefined
  }
  settings?: {
    get?: (args?: unknown) => Promise<unknown>
    update?: (args: unknown) => Promise<unknown>
  }
  [key: string]: unknown
}

export type ClientContext = {
  provide: (name: string, value: unknown) => void
  get: (name: string) => unknown
  inject: (
    deps: string | string[],
    callback: (injected: ClientContext) => Disposer | void,
  ) => Disposer
  effect: (factory: () => Disposer | void, label?: string) => Disposer
  plugin?: (plugin: unknown) => Disposer
  slots: SlotService
  locale: LocaleService
  modules: ClientModules
  sessions: unknown
  connection: { state: string }
  remote: RemoteFacade
  dispose: () => void
}
