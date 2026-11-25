import type { RequestClient } from '@eap/request'

/** Server-authoritative DSH plugin install row (py-backend). */
export type PluginInstallItem = {
  name: string
  version: string
  description: string
  enabled: boolean
  broken: boolean
  clientEntry: string
  inject?: string[]
  hasBundlePatch?: boolean
  clientUrl: string
  filesBaseUrl: string
  hostApiBase: string
  /** Spec used to install or update: package name, git address, or absolute path. */
  installSpec?: string
  /** Always py-backend — Cordis island must not claim Host authority. */
  controlPlane: 'py-backend'
}

export type PluginUiContribution = {
  name: string
  version: string
  description: string
  clientEntry: string
  clientUrl: string
  filesBaseUrl: string
  inject: string[]
  hostApiBase: string
  controlPlane: 'py-backend'
}

export type PluginContributions = {
  uiClients: PluginUiContribution[]
}

export type PluginHostStatus = {
  name: string
  version: string
  ready: boolean
  controlPlane: 'py-backend'
  sidecar: string
  callCount: number
  workspaceRoot?: string
}

export type PluginHostEnvelope<T = unknown> =
  | { ok: true; value: T; controlPlane: 'py-backend' }
  | { ok: false; error: { code: string; message: string }; controlPlane: 'py-backend' }

/**
 * Plugin management + Host API clients.
 * All baseUrl traffic targets py-backend; this module never executes Agent/tools.
 */
export function createPluginApi(client: RequestClient) {
  return {
    plugins: {
      list: (signal?: AbortSignal) =>
        client.get<{ items: PluginInstallItem[] }>('/plugins', { signal }).then((r) => r.data),
      install: (spec: string, signal?: AbortSignal) =>
        client
          .post<PluginInstallItem>('/plugins/install', { spec }, { signal })
          .then((r) => r.data),
      enable: (name: string, signal?: AbortSignal) =>
        client
          .post<PluginInstallItem>(`/plugins/${encodeURIComponent(name)}/enable`, {}, { signal })
          .then((r) => r.data),
      disable: (name: string, signal?: AbortSignal) =>
        client
          .post<PluginInstallItem>(`/plugins/${encodeURIComponent(name)}/disable`, {}, { signal })
          .then((r) => r.data),
      update: (name: string, signal?: AbortSignal) =>
        client
          .post<PluginInstallItem>(`/plugins/${encodeURIComponent(name)}/update`, {}, { signal })
          .then((r) => r.data),
      uninstall: (name: string, signal?: AbortSignal) =>
        client
          .post<{ name: string; removed: boolean }>(
            `/plugins/${encodeURIComponent(name)}/uninstall`,
            {},
            { signal },
          )
          .then((r) => r.data),
      contributions: (signal?: AbortSignal) =>
        client.get<PluginContributions>('/plugins/contributions', { signal }).then((r) => {
          for (const item of r.data.uiClients) {
            if (item.controlPlane !== 'py-backend') {
              throw new Error('INVALID_PLUGIN_CONTROL_PLANE')
            }
          }
          return r.data
        }),
      hostStatus: (name: string, signal?: AbortSignal) =>
        client
          .get<PluginHostStatus>(`/plugins/host/${encodeURIComponent(name)}/status`, { signal })
          .then((r) => r.data),
      /**
       * Call plugin Host JSON API through py-backend (not the browser).
       * Prefer this over inventing local Host success.
       */
      hostSidebarApi: <T = unknown>(
        name: string,
        method: string,
        body: Record<string, unknown> = {},
        signal?: AbortSignal,
      ) =>
        client
          .post<PluginHostEnvelope<T>>(
            `/plugins/host/${encodeURIComponent(name)}/sidebar/api/${encodeURIComponent(method)}`,
            body,
            { signal },
          )
          .then((r) => r.data),
    },
  }
}
