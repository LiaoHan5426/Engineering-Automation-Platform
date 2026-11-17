/** One retained Markdown renderer over the document owner's accumulated text. */
import { computed, defineAsyncComponent, defineComponent, h, type VNodeChild } from 'vue'
import { MarkdownText, type MarkdownLabels, type MarkdownPathImages } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { DocumentPreviewProps } from '../document/contract.ts'
import { splitFrontmatter } from './frontmatter.ts'
import type { FrontmatterFieldsProps } from './frontmatter-fields.tsx'
import { markdownImageUrl } from './path-images.ts'
import type {} from './locales.ts'
import css from './MarkdownBody.module.css'

/** Show the verbatim frontmatter while its field-list chunk is unavailable. */
const FrontmatterFallback = defineComponent((props: FrontmatterFieldsProps) => () => props.fallback,
  { name: 'FrontmatterFallback', inheritAttrs: false, props: ['source','fallback'] })

const FrontmatterFields = defineAsyncComponent({
  loader: () => import('./frontmatter-fields.tsx').then(
    module => module.FrontmatterFields,
    // The failed chunk only removes the field layout; the body and metadata stay usable.
    () => FrontmatterFallback,
  ),
  loadingComponent: FrontmatterFallback,
  delay: 0,
})

/** Standard document inputs and this implementation's locale. */
export type MarkdownBodyProps = DocumentPreviewProps & PropsLocale<'documentMarkdown'>

/** Render accumulated Markdown with lazy frontmatter and localized primitive controls. */
export const MarkdownBody = defineComponent((props: MarkdownBodyProps) => {
  const metadata = props.useResource<'file'>(computed(() => props.resourceAddress))
  const pathImages = computed<MarkdownPathImages>(() => {
    const absolutePath = metadata.value?.value?.absolutePath
    return { resolve: value => markdownImageUrl(document.baseURI, absolutePath, value) }
  })
  const labels = computed<MarkdownLabels>(() => ({
    code: { copyLabel: props.t('code.copy'), copiedLabel: props.t('code.copied'), toolbarLabels: {
      codeLabel: props.t('codeBlock.title'), wrapLabel: props.t('codeBlock.wrap'), unwrapLabel: props.t('codeBlock.unwrap'),
    } }, footnotes: props.t('footnotes'),
  }))
  const text = computed(() => props.content.kind === 'text' ? props.content.text : '')
  const split = computed(() => splitFrontmatter(text.value))
  return () => {
    if (props.content.kind !== 'text') return null
    return h('div', { class: css.document, 'data-document-markdown': '' }, [
      split.value === undefined ? null : h(FrontmatterBox, { source: split.value.source }),
      h(MarkdownText, { text: split.value?.body ?? text.value, streaming: !props.content.eof,
        labels: labels.value, pathImages: pathImages.value }),
    ])
  }
}, { name: 'MarkdownBody', inheritAttrs: false, props: ['addResource','setResources','resourceAddress','content','wrap','scrollportRef','useTabInfo','useSession','sessionId','useProjection','useAccess','useConversation','useInput','inputActions','useRemoteAccess','useSessions','useSessionRetainInfo','useSessionAccess','usePanelInfo','useContextMenu','useResource','useWorkspaces','t'] })

/**
 * @param props - YAML between the frontmatter delimiters.
 * @returns the metadata box, which collapses when its document has no content.
 */
function FrontmatterBox({ source }: { source: string }): VNodeChild {
  const verbatim = h('pre', { class: css.frontmatterSource }, source)
  return h('div', { class: css.frontmatter, 'data-document-frontmatter': '' }, [
    h(FrontmatterFields, { source, fallback: verbatim }),
  ])
}
