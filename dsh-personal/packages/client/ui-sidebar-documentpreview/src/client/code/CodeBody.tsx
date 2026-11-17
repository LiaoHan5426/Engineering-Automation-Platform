/** Incrementally highlighted source; the document owner supplies the accumulated text and wrap preference. */
import { defineComponent, h } from 'vue'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { CodeBlock, languageForPath } from '@deepseek-ai/dsh-client-ui-primitives'
import { parseFileAddress } from '@deepseek-ai/dsh-util-workspace-path'
import type { DocumentPreviewProps } from '../document/contract.ts'
import type {} from './locales.ts'
import css from './CodeBody.module.css'

/** Document owner props and this renderer's localized controls. */
export type CodeBodyProps = DocumentPreviewProps & PropsLocale<'sidebarCodePreview'>

/** One stable code surface follows accumulated content and localized controls. */
export const CodeBody = defineComponent((props: CodeBodyProps) => () => {
  const { resourceAddress, content, wrap, scrollportRef, t } = props
  if (content.kind !== 'text') return null
  const file = parseFileAddress(resourceAddress)
  if (file === undefined) throw new Error(`ui-sidebar-documentpreview: not a file address "${resourceAddress}"`)
  return h('div', { class: css.renderer, 'data-code-preview': '', 'data-wrap': wrap }, [
    h(CodeBlock, {
      className: css.code, contentRef: scrollportRef, code: content.text, lang: languageForPath(file.path),
      streaming: !content.eof, wrap, lineNumbers: true, copyLabel: t('copy'), copiedLabel: t('copied'),
      toolbarLabels: { codeLabel: t('codeBlock.title'), wrapLabel: t('codeBlock.wrap'), unwrapLabel: t('codeBlock.unwrap') },
    }),
  ])
}, { name: 'CodeBody', inheritAttrs: false, props: ['addResource','setResources','resourceAddress','content','wrap','scrollportRef','useTabInfo','useSession','sessionId','useProjection','useAccess','useConversation','useInput','inputActions','useRemoteAccess','useSessions','useSessionRetainInfo','useSessionAccess','usePanelInfo','useContextMenu','useResource','useWorkspaces','t'] })
