/** Browser title selection follows the active main panel without subscribing the frame. */
import { defineComponent, onUnmounted, watchEffect } from 'vue'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'

/** Props for the browser title projection. */
export type DocumentTitleProps = Pick<PropsRuntime<'root'>, 'useSessions' | 'usePanelInfo'> & {
  /** Build-configured or localized product title. */
  productTitle: string
}

/** Project the retained Session title while the Conversation is visible; restore the product title on disposal. */
export const DocumentTitle = defineComponent((props: DocumentTitleProps) => {
  const showSessionTitle = props.usePanelInfo(info => info.activePanelId === null)
  const title = props.useSessions(state => Object.values(state.byId)
    .find(session => (session.retainedBy.mainView ?? 0) > 0)?.title)
  watchEffect(() => {
    document.title = !showSessionTitle.value || title.value === undefined
      ? props.productTitle : `${title.value} — ${props.productTitle}`
  })
  onUnmounted(() => { document.title = props.productTitle })
  return () => null
}, { props: ['useSessions', 'usePanelInfo', 'productTitle'] })
