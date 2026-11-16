/** Static or interactive HTML in an opaque iframe, without parent application access. */
import { computed, defineComponent, h, shallowRef, watch } from 'vue'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { DocumentPreviewProps } from '../document/contract.ts'
import { LoadingIndicator } from '../LoadingIndicator.tsx'
import { createHtmlDocument } from './bootstrap.ts'
import { createBasicHtmlDocument } from './basic-document.ts'
import { packHtml } from './pack.ts'
import { createReadHtmlRelative } from './read-relative.ts'
import type { ReadHtmlRelated } from './read-relative.ts'
import type {} from './locales.ts'
import css from './HtmlBody.module.css'

/** Standard document inputs plus this renderer's dictionary. */
export type HtmlBodyProps = DocumentPreviewProps & PropsLocale<'documentHtml'> & InjectFace<HtmlBodyInjected>

/** Related-file reader and accepted preview mode supplied by the plugin. */
export interface HtmlBodyInjected {
  hooks: { interactivePreview: ObservableSnapshot<boolean> }
  /** Ordinary Remote callback bound by this renderer's Slot inject. */
  readonly readRelated: ReadHtmlRelated
}

type FrameInput = Pick<HtmlBodyProps, 'resourceAddress' | 'readRelated' | 'addResource' | 'setResources'> & {
  readonly data: Uint8Array<ArrayBuffer>
  readonly signal: AbortSignal
  readonly frameName: string
}
type FrameState = Pick<FrameInput, 'data' | 'readRelated'> & { readonly url: string | undefined }

/** One mounted file owns its root Blob and replaces it with its browsing context. */
const HtmlFrame = defineComponent((props: FrameInput & { t: HtmlBodyProps['t'] }) => {
  const frame = shallowRef<FrameState>()
  watch(() => [props.data, props.readRelated, props.resourceAddress, props.addResource, props.setResources, props.signal] as const,
    (_, _previous, onCleanup) => {
      const { data, readRelated, resourceAddress, addResource, setResources, signal } = props
      const controller = new AbortController()
      const resources = new Set<string>()
      const readRelative = createReadHtmlRelative(readRelated, resourceAddress, signal, (address) => {
        resources.add(address)
        addResource(address)
      })
      let url: string | undefined
      void (async () => {
        try {
          const bundle = await packHtml(data, readRelative, controller.signal)
          controller.signal.throwIfAborted()
          const html = createHtmlDocument(bundle)
          url = URL.createObjectURL(new Blob([html], { type: 'text/html' }))
          frame.value = { data, readRelated, url }
        } catch (error) {
          // Packing failures have one localized preview message; cancellation publishes nothing.
          if (!controller.signal.aborted) frame.value = { data, readRelated, url: undefined }
        } finally {
          if (!controller.signal.aborted && !signal.aborted) setResources([...resources])
        }
      })()
      onCleanup(() => {
        controller.abort()
        if (url !== undefined) URL.revokeObjectURL(url)
      })
    }, { immediate: true })
  return () => {
    const current = frame.value
    if (current?.data !== props.data || current.readRelated !== props.readRelated) return h(LoadingIndicator, { label: props.t('loading') })
    if (current.url === undefined) return h('p', { class: css.status, role: 'alert' }, props.t('failed'))
    return h('iframe', { key: current.url, name: props.frameName, class: css.frame, src: current.url,
      sandbox: 'allow-scripts', title: props.t('frame'), 'data-html-preview': '' })
  }
}, { name: 'HtmlFrame', inheritAttrs: false, props: ["readRelated","resourceAddress","addResource","setResources","data","signal","frameName","t"] })

/** Mode changes retire the previous frame and its related-file ownership. */
export const HtmlBody = defineComponent((props: HtmlBodyProps) => {
  const interactivePreview = props.useInteractivePreview(value => value)
  const info = props.useTabInfo()
  watch([interactivePreview, () => props.setResources], () => {
    if (!interactivePreview.value) props.setResources([])
  }, { immediate: true })
  return () => {
    if (props.content.kind !== 'bytes') return null
    const frameName = `dsh-sidebar-html-${info.value.tab.id}`
    if (!interactivePreview.value) return h(BasicHtmlFrame, { data: props.content.data, frameName, t: props.t })
    return h(HtmlFrame, { key: props.resourceAddress, data: props.content.data, resourceAddress: props.resourceAddress,
      readRelated: props.readRelated, signal: info.value.tab.signal, frameName, addResource: props.addResource,
      setResources: props.setResources, t: props.t })
  }
}, { name: 'HtmlBody', inheritAttrs: false, props: ["addResource","setResources","resourceAddress","content","wrap","scrollportRef","useTabInfo","useSession","sessionId","useProjection","useAccess","useConversation","useInput","inputActions","useRemoteAccess","useSessions","useSessionRetainInfo","useSessionAccess","usePanelInfo","useContextMenu","useResource","useWorkspaces","t","readRelated","useInteractivePreview"] })

/** Static preview uses a separate browsing context from the scripted preview. */
const BasicHtmlFrame = defineComponent((props: Pick<FrameInput, 'data' | 'frameName'> & { t: HtmlBodyProps['t'] }) => {
  const html = computed(() => {
    try {
      return createBasicHtmlDocument(props.data)
    } catch (error) {
      // Malformed UTF-8 files cannot produce a document.
      return undefined
    }
  })
  return () => html.value === undefined ? h('p', { class: css.status, role: 'alert' }, props.t('failed'))
    : h('iframe', { name: props.frameName, class: css.frame, srcdoc: html.value, sandbox: '', title: props.t('frame'), 'data-html-preview': '' })
}, { name: 'BasicHtmlFrame', inheritAttrs: false, props: ["data","frameName","t"] })
