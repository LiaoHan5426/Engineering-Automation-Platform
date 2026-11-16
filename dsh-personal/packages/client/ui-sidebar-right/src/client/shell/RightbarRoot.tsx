/** Root-scoped controller for the right Sidebar's Session content. */
import { defineComponent, h, watchEffect } from 'vue'
import type { HostObservable, InjectFace, PropsRenderSlots, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionReference } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SidebarSessionViewSnapshot } from '../session-views.ts'
import type {} from '../contract/slots.ts'
import css from './SidebarRight.module.css'

/** Root-only retained Session targets and their committed mount lifetimes. */
export interface RightbarRootInjected {
  readonly hooks: { readonly views: HostObservable<readonly SidebarSessionViewSnapshot[]> }
  readonly mountView: (reference: SessionReference) => () => void
}

type RootProps = PropsRuntime<'rightbar'> & PropsRenderSlots<'rightbar.session'> & InjectFace<RightbarRootInjected>
type ViewProps = Pick<RootProps, 'SessionProvider' | 'renderSlot' | 'mountView' | 'width' | 'viewportWidth' | 'canShow'>
  & { readonly view: SidebarSessionViewSnapshot; readonly visible: boolean }

const SessionView = defineComponent((props: ViewProps) => {
  watchEffect(onCleanup => { onCleanup(props.mountView(props.view.reference)) })
  return () => h('div', {
    class: css.session, hidden: !(props.visible && props.view.selected), 'data-sidebar-right-session': props.view.sessionId,
  }, h(props.SessionProvider, { session: props.view.reference, children: props.renderSlot('rightbar.session', {
    width: props.width, viewportWidth: props.viewportWidth, canShow: props.canShow,
    active: props.visible && props.view.selected, retainTab: props.view.retainTab,
  }) }))
}, { name: 'RightbarSessionView', props: ['SessionProvider', 'renderSlot', 'mountView', 'width', 'viewportWidth', 'canShow', 'view', 'visible'], inheritAttrs: false })

/**
 * Keep independent Session subtrees and hide those outside the selected Conversation.
 * @param props - frame geometry, view targets and the authorized Session renderer.
 * @returns the foreground and retained background Sidebars.
 */
export const RightbarRoot = defineComponent((props: RootProps) => {
  const visible = props.usePanelInfo(info => info.activePanelId === null)
  const views = props.useViews(value => value)
  return () => views.value.map(view => h(SessionView, { key: view.sessionId, ...props, view, visible: visible.value }))
}, { name: 'RightbarRoot', props: ['usePanelInfo', 'useViews', 'SessionProvider', 'renderSlot', '__renders', 'mountView', 'width', 'viewportWidth', 'canShow', 'useRemoteAccess', 'useSessions', 'useSessionRetainInfo', 'useSessionAccess'], inheritAttrs: false })
