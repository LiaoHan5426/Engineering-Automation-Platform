import { defineComponent, inject, provide, type HTMLAttributes, type InjectionKey, type VNodeChild } from 'vue'
import type { FileDragActions } from '../file-drag-actions.ts'
import type { ImageLightboxLabels } from '../ImageLightbox.tsx'

export type MarkdownExternalLinkHandler = (href: string) => void
export type MarkdownMenuTarget =
  | { kind: 'file'; path: string; line?: number }
  | { kind: 'url'; url: string }
  | { kind: 'image'; url: string; path?: string; name?: string; mediaType?: string }
export interface MarkdownDelegateFenceInfo {
  readonly lang: string
  readonly code: string
  readonly streaming: boolean
  readonly meta?: string | undefined
}
export interface MarkdownDelegate {
  readonly getTriggerProps?: ((target: MarkdownMenuTarget) => Pick<HTMLAttributes, 'onContextmenu' | 'onKeydown' | 'tabindex'>) | undefined
  readonly fileImages?: {
    fileDrag: FileDragActions
    resolve: (path: string) => string | undefined
    resourceAddress?: ((path: string) => string) | undefined
    labels: ImageLightboxLabels & { open: string; loading: string; failed: string }
  } | undefined
  readonly openExternalLink?: MarkdownExternalLinkHandler | undefined
  readonly openFile?: ((path: string, options?: { line?: number }) => void) | undefined
  readonly renderCode?: ((fence: MarkdownDelegateFenceInfo) => VNodeChild) | undefined
}
const delegateKey: InjectionKey<MarkdownDelegate> = Symbol('markdown-delegate')
export interface MarkdownDelegateProviderProps extends MarkdownDelegate {}
/** Nested scopes replace capabilities; the reactive props object keeps cached links current. */
export const MarkdownDelegateProvider = defineComponent((props: MarkdownDelegateProviderProps, { slots }) => {
  provide(delegateKey, props)
  return () => slots.default?.()
}, { name: 'MarkdownDelegateProvider', props: ['openExternalLink', 'openFile', 'fileImages', 'getTriggerProps', 'renderCode'] })
export function useMarkdownDelegate(): MarkdownDelegate {
  return inject(delegateKey, {})
}
