import type { ComponentType, ReactNode } from 'react'
export interface Snapshot {
  getSnapshot(): unknown
  subscribe(listener: () => void): () => void
}
export interface Store extends Snapshot {
  actions: Record<string, (...args: never[]) => unknown>
}
export interface Injection {
  hooks: Record<string, Snapshot>
  [key: string]: unknown
}
export interface OverlayDefinition {
  name: string
  id: string
  locale: string
  store: { create(): Store }
  inject(): Injection
}
export interface FactoryDefinition {
  name: string
  [key: string]: unknown
}
export interface MenuService {
  register(input: {
    id: string
    target: string
    order: number
    resolve(
      target: import('./index').MessageTarget,
    ): { id: string; label: string; failureLabel: string; run(): Promise<void> }[]
  }): () => void
  open(
    target: { kind: string; value: import('./index').MessageTarget },
    point: { x: number; y: number },
  ): void
}
export type OverlayComponent = ComponentType<Record<string, unknown>>
export type Selector = (snapshot: unknown) => ReactNode
