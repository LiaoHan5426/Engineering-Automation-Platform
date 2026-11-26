/** Document region a rendered row lands in: after the opening head or body tag. */
export type IndexInjectionPlacement = 'head' | 'body'

/** One structured index injection row (wire-safe subset of DSH Host injections). */
export type IndexInjection =
  | { kind: 'global'; name: string; value: unknown }
  | { kind: 'script'; placement: IndexInjectionPlacement; text: string }
  | { kind: 'script-src'; placement: IndexInjectionPlacement; src: string }
  | { kind: 'script-preload'; src: string }
  | { kind: 'style'; text: string }
  | { kind: 'html'; placement: IndexInjectionPlacement; html: string }

/** One composed client entry pushed by the host (a graph row). */
export interface WebBootEntry {
  id: string
  url: string
  rev: string
  inject?: string[]
  immediately?: boolean
  external?: string[]
  config?: Record<string, unknown>
}

export type WebBootBatchPhase = 'bootstrap' | 'application'

export interface WebBootBatch {
  phase: WebBootBatchPhase
  url: string
  rev: string
  entries: string[]
}

export interface WebBootRelease {
  version: string
  commit?: string
}

/** The composed client entry graph the host injects as `window.__DSH_BOOT__`. */
export interface WebBootGraph {
  rev: string
  release?: WebBootRelease
  entries: WebBootEntry[]
  batches: WebBootBatch[]
}

/** py-backend `GET /api/plugins/contributions` uiClients row. */
export interface UiClientContribution {
  name: string
  clientUrl: string
  filesBaseUrl?: string
  hostApiBase: string
  inject?: string[]
  controlPlane?: 'py-backend'
  enabled?: boolean
}