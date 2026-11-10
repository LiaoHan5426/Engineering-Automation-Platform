export const SHELL_PAGE_IDS = [
  'sql',
  'scenes',
  'work',
  'plugins',
  'experts',
  'rules',
  'knowledge',
  'databases',
  'capabilities',
  'model-settings',
  'appearance',
  'skills',
  'board',
  'expert-catalog',
] as const

export const INSTALLATION_KEY = 'eap.plugin.installation'

export type PluginId = 'chat' | 'builder' | 'board'

export interface Installation {
  enabled: Record<PluginId, boolean>
}

export type BoardContributionId = 'board'

export interface PermissionRequest {
  id: string
  optional: boolean
}

export interface PluginManifest {
  id: PluginId
  version: string
  requests: readonly PermissionRequest[]
}

export type BuilderInstanceId = 'alpha' | 'beta'

export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Manifest requests are not grants. This list stays empty for the prototype. */
export const GRANTS: readonly string[] = []

export const MANIFESTS: readonly PluginManifest[] = [
  {
    id: 'chat',
    version: '0.1.0',
    requests: [{ id: 'workspace.read', optional: false }],
  },
  {
    id: 'builder',
    version: '0.1.0',
    requests: [
      { id: 'workspace.read', optional: false },
      { id: 'prototype.write', optional: false },
      { id: 'repository.read', optional: false },
      { id: 'repository.write', optional: true },
      { id: 'mission.create', optional: true },
    ],
  },
  {
    id: 'board',
    version: '0.1.0',
    requests: [
      { id: 'workspace.read', optional: false },
      { id: 'task.read', optional: false },
      { id: 'run.read', optional: false },
    ],
  },
]

const DEFAULT_INSTALLATION: Installation = { enabled: { chat: true, builder: true, board: true } }

export function isShellPage(id: string): boolean {
  return (SHELL_PAGE_IDS as readonly string[]).includes(id)
}

export function contributionHash(instanceId: BuilderInstanceId): string {
  return `builder-${instanceId}`
}

export function isKnownHash(id: string): boolean {
  return isShellPage(id) || id === 'chat' || id === 'builder-alpha' || id === 'builder-beta'
}

export function enabledHashes(installation: Installation): string[] {
  const hashes: string[] = []
  if (installation.enabled.chat) hashes.push('chat')
  if (installation.enabled.builder) hashes.push('builder-alpha', 'builder-beta')
  if (installation.enabled.board) hashes.push('board')
  return hashes
}

export function browserStore(): KeyValueStore {
  return {
    getItem(key) {
      try {
        const storage = globalThis.localStorage
        if (!storage) return null
        return storage.getItem(key)
      } catch {
        return null
      }
    },
    setItem(key, value) {
      if (!globalThis.localStorage) throw new Error('PLUGIN_LOCAL_STORAGE_UNAVAILABLE')
      globalThis.localStorage.setItem(key, value)
      if (globalThis.localStorage.getItem(key) !== value)
        throw new Error('PLUGIN_LOCAL_WRITE_UNCONFIRMED')
    },
  }
}

export function memoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const data = { ...initial }
  return {
    getItem(key) {
      const value = data[key]
      return value === undefined ? null : value
    },
    setItem: (key, value) => {
      data[key] = value
    },
  }
}

export function readInstallation(store: KeyValueStore): Installation {
  const raw = store.getItem(INSTALLATION_KEY)
  if (!raw) return { enabled: { ...DEFAULT_INSTALLATION.enabled } }
  try {
    const parsed = JSON.parse(raw) as { enabled?: Partial<Installation['enabled']> }
    return {
      enabled: {
        chat: parsed.enabled?.chat !== false,
        builder: parsed.enabled?.builder !== false,
        board: parsed.enabled?.board !== false,
      },
    }
  } catch {
    return { enabled: { ...DEFAULT_INSTALLATION.enabled } }
  }
}

export function writeInstallation(store: KeyValueStore, installation: Installation): void {
  store.setItem(
    INSTALLATION_KEY,
    JSON.stringify({
      enabled: {
        chat: installation.enabled.chat,
        builder: installation.enabled.builder,
        board: installation.enabled.board,
      },
    }),
  )
}
