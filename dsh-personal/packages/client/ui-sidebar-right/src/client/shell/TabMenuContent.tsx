/** Preserve existing tab-menu extensions under the clicked Session's retained scope. */
import { defineComponent, h } from 'vue'
import type { PropsRuntime, PropsRenderSlots, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SidebarSessionViewSnapshot } from '../session-views.ts'

type Props = PropsRuntime<'contextMenu.content'> & PropsRenderSlots<'sidebar.right.tab.menu.item'> & InjectFace<{
  hooks: { views: ObservableSnapshot<readonly SidebarSessionViewSnapshot[]> }
}>
/** @param props - clicked tab and already retained view. @returns existing plugin menu rows. */
export const TabMenuContent = defineComponent((props: Props) => {
  const views = props.useViews(value => value)
  return () => {
    const target = props.target
    if (target.kind !== 'tab') return null
    const view = views.value.find(view => view.sessionId === target.value.sessionId)
    if (view === undefined) return null
    return h(props.SessionProvider, { session: view.reference, children: props.renderSlot('sidebar.right.tab.menu.item', { tab: target.value.tab, dismiss: props.dismiss }) })
  }
}, { name: 'TabMenuContent', props: ['target', 'dismiss', 'useViews', 'SessionProvider', 'renderSlot', '__renders', 'useRemoteAccess', 'useSessions', 'useSessionRetainInfo', 'useSessionAccess', 'usePanelInfo'], inheritAttrs: false })
