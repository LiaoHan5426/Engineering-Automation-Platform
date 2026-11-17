import { defineComponent, computed, h } from 'vue'
import { IconWarningOutlineRegular, Toast } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { PluginManagerFace } from './manager-store.ts'
import { noticeText } from './presentation.ts'
/** The controller's shared notice source and dismissal action. */
export type PluginRefreshToastFace = Pick<PluginManagerFace, 'dismissNotice'> & {
  hooks: Pick<PluginManagerFace['hooks'], 'pluginManager'>
}
/** Render inputs bound from the shared controller and plugin dictionary. */
export type PluginRefreshToastProps = InjectFace<PluginRefreshToastFace> &
  PropsLocale<'pluginManager'>
/**
 * Display refresh failures even after navigation leaves the Plugins panel.
 * @param props - shared notice hook, dismissal action, and locale seat.
 * @returns the refresh failure toast, or null for other notices.
 */
export const PluginRefreshToast = defineComponent(
  (props: PluginRefreshToastProps) => {
    const usePluginManager = computed(() => props.usePluginManager)
    const dismissNotice = computed(() => props.dismissNotice)
    const t = computed(() => props.t)
    const notice = usePluginManager.value(state => state.notice)
    return () => {
      if (notice.value?.kind !== 'refresh-failed') return null
      return h(Toast, {
        key: notice.value.seq,
        text: noticeText(notice.value, t.value),
        icon: h(IconWarningOutlineRegular, null),
        onDone: dismissNotice.value,
      })
    }
  },
  {
    props: ['usePluginManager', 'dismissNotice', 't'],
    inheritAttrs: false,
  },
)
