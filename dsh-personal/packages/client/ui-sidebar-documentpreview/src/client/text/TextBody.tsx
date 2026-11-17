/** Plain source display for files without a more specific document renderer. */
import { defineComponent, h } from 'vue'
import type { DocumentPreviewProps } from '../document/contract.ts'
import { linesOf } from './lines.ts'
import css from '../TextPreview.module.css'

/** Source lines retain their navigation targets as the selected tab changes. */
export const TextBody = defineComponent((props: DocumentPreviewProps) => {
  const info = props.useTabInfo()
  return () => {
    const { content } = props
    const params = info.value.tab.navigation.params
    const target = params !== undefined && 'line' in params ? params.line : undefined
    if (content.kind !== 'text') return null
    return h('div', { class: css.textDocument, 'data-textpreview-plain': '' }, content.pages.map(page =>
      h('pre', { key: page.offset, class: css.page, 'data-textpreview-page': page.offset },
        linesOf(page).map((text, index) => {
          const number = page.offset + index
          return h('div', { key: number, class: css.line, 'data-textpreview-line': number,
            ...(number === target ? { 'data-textpreview-target': number } : {}) }, [text, '\n'])
        })),
    ))
  }
}, { name: 'TextBody', inheritAttrs: false, props: ['addResource','setResources','resourceAddress','content','wrap','scrollportRef','useTabInfo','useSession','sessionId','useProjection','useAccess','useConversation','useInput','inputActions','useRemoteAccess','useSessions','useSessionRetainInfo','useSessionAccess','usePanelInfo','useContextMenu','useResource','useWorkspaces'] })
