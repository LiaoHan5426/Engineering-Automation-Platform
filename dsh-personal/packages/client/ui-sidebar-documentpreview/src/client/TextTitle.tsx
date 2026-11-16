/** The file type's icon and captured title in docked and floating tab headers. */
import { defineComponent, h, Fragment } from 'vue'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { FileTypeIcon, classifyFileType } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './TextPreview.module.css'

/** Read the tab title through the framework's setup-bound reader. */
export const TextTitle = defineComponent((props: PropsRuntime<'sidebar.right.pane.tab.title'>) => {
  const info = props.useTabInfo()
  return () => h(Fragment, [
    h(FileTypeIcon, { kind: classifyFileType(info.value.tab.title), size: 16, className: css.titleIcon }),
    info.value.tab.title,
  ])
}, { name: 'TextTitle', inheritAttrs: false, props: ["useTabInfo","useSession","sessionId","useProjection","useAccess","useConversation","useInput","inputActions","useRemoteAccess","useSessions","useSessionRetainInfo","useSessionAccess","usePanelInfo","useContextMenu","useResource","useWorkspaces"] })
