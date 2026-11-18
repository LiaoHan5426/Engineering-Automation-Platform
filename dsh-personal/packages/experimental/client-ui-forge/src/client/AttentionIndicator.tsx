/** Mark the Session panel toggle while a bound request needs attention. */
import { defineComponent, h, computed } from 'vue'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session-panel/client'
import type { NS } from './locales.ts'
import type { PanelSnapshot } from './source.ts'
import { needsAttention } from './status.ts'
import css from './Forge.module.css'
export interface AttentionIndicatorInjected {
  readonly hooks: { readonly panel: HostObservable<PanelSnapshot> }
}
export type AttentionIndicatorProps = PropsRuntime<'conversation.session.panel.indicator'> & InjectFace<AttentionIndicatorInjected> & PropsLocale<typeof NS>
export const AttentionIndicator = defineComponent((props: AttentionIndicatorProps) => {
  const panel = props.usePanel(value => value)
  const attention = computed(() => panel.value.state?.changeRequests.some(needsAttention) === true)
  return () => attention.value ? h('span', { class: css.attention, 'data-forge-attention': '' }, [h('span', { class: css.visuallyHidden }, props.t('header.attention'))]) : null
}, { name: 'AttentionIndicator', props: ['usePanel', 't'] })
