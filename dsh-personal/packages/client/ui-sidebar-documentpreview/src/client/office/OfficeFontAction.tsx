/** Font warning for the Office revision displayed by the document toolbar. */
import { defineComponent, h } from 'vue'
import type { PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { OfficeStore } from './store.ts'
import { FontNotice } from './FontNotice.tsx'

/** Office toolbar inputs share the body’s conversion result. */
export type OfficeFontActionProps = PropsRuntime<'sidebar.right.tab.document.action'>
  & PropsStore<OfficeStore> & PropsLocale<'sidebarOffice'>

/** Expose font details only for the currently loaded Office revision. */
export const OfficeFontAction = defineComponent((props: OfficeFontActionProps) => {
  const info = props.useTabInfo()
  const tabId = info.value.tab.id
  const held = props.useStore(state => state.byTab[tabId])
  return () => {
    const content = props.content
    const current = held.value
    if (content.kind !== 'renderer' || current?.revision !== content.revision || current.file === undefined) return null
    return h(FontNotice, { key: content.revision, fonts: current.file.missingFonts, t: props.t })
  }
}, { name: 'OfficeFontAction', inheritAttrs: false, props: ['content','useTabInfo','useSession','sessionId','useProjection','useAccess','useConversation','useInput','inputActions','useRemoteAccess','useSessions','useSessionRetainInfo','useSessionAccess','usePanelInfo','useContextMenu','useResource','useWorkspaces','useStore','actions','t'] })
