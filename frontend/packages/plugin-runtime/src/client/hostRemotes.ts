/**
 * Host remotes aligned with DSH api-remotes namespaces.
 *
 * DSH: session / settings / workspaceFiles
 * EAP py-backend bridge still speaks fs.* for file ops — mapped here.
 * Layout peers stay Client-side; never invent Host success locally.
 */

import type { Disposer, RemoteFacade } from './types'

export type HostFetch = (method: string, body?: Record<string, unknown>) => Promise<unknown>

function asBody(args: unknown): Record<string, unknown> {
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    return args as Record<string, unknown>
  }
  return {}
}

function mapWorkspaceFilesMethod(method: string): string {
  // DSH workspaceFiles.* → existing Host bridge fs.*
  if (method === 'tree' || method === 'list') return 'fs.tree'
  if (method === 'trees') return 'fs.trees'
  if (method === 'read') return 'fs.read'
  return `fs.${method}`
}

/**
 * Build a remote facade that proxies authoritative Host methods to py-backend.
 */
export function createHostProxiedRemote(fetchHost: HostFetch): RemoteFacade {
  const remoteListeners = new Map<string, Set<(...args: unknown[]) => void>>()

  const session = {
    canOpenWorkspacePath: () => true,
    openWorkspacePath: async (args: unknown) =>
      fetchHost('session.openWorkspacePath', asBody(args)),
    workspacePathApplications: async (args: unknown) =>
      fetchHost('session.workspacePathApplications', asBody(args)),
    cwd: async (args?: unknown) => fetchHost('session.cwd', asBody(args)),
    phase: async (args?: unknown) => fetchHost('session.phase', asBody(args)),
  }

  const settings = {
    get: async (args?: unknown) => fetchHost('settings.get', asBody(args)),
    update: async (args: unknown) => fetchHost('settings.update', asBody(args)),
  }

  const workspaceFiles = new Proxy(
    {},
    {
      get(_t, method) {
        if (typeof method !== 'string') return undefined
        return (args?: unknown) => fetchHost(mapWorkspaceFilesMethod(method), asBody(args))
      },
    },
  )

  const fs = {
    tree: async (args: unknown) => fetchHost('fs.tree', asBody(args)),
    trees: async (args: unknown) => fetchHost('fs.trees', asBody(args)),
    read: async (args: unknown) => fetchHost('fs.read', asBody(args)),
  }

  const remote: RemoteFacade = {
    $on(event, listener) {
      let bag = remoteListeners.get(event)
      if (!bag) {
        bag = new Set()
        remoteListeners.set(event, bag)
      }
      bag.add(listener)
      const dispose: Disposer = () => bag!.delete(listener)
      return dispose
    },
    session,
    settings,
    workspaceFiles,
    fs,
  }

  return new Proxy(remote, {
    get(target, prop, receiver) {
      if (typeof prop !== 'string') return Reflect.get(target, prop, receiver)
      if (prop in target) return Reflect.get(target, prop, receiver)
      if (prop.startsWith('$')) return Reflect.get(target, prop, receiver)
      return new Proxy(
        {},
        {
          get(_ns, method) {
            if (typeof method !== 'string') return undefined
            return (args?: unknown) => fetchHost(`${prop}.${method}`, asBody(args))
          },
        },
      )
    },
  })
}
