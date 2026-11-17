import { defineComponent, h } from 'vue'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { NS } from './locales.ts'
import css from './SubagentReadOnlyComposer.module.css'
/** Why a catalog-addressed conversation cannot accept human input. */
export interface SubagentReadOnlyMatch {
  reason: 'one-shot' | 'unknown'
}
/** Full chain props after the read-only subagent selector accepts the owner currency. */
export type SubagentReadOnlyComposerProps = PropsRuntime<'conversation.composer'> & {
  matched: SubagentReadOnlyMatch
} & PropsLocale<typeof NS>
/**
 * Explain why the normal composer is unavailable for an addressed child.
 * @param props - selector-owned read-only reason plus standard slot props.
 * @returns A read-only composer replacement.
 */
export const SubagentReadOnlyComposer = defineComponent((props: Pick<SubagentReadOnlyComposerProps, 'matched' | 't'>) => {
  return () => {
    const { matched, t } = props
    const oneShot = matched.reason === 'one-shot'
    return (h('div', { 'class': css.frame, 'role': 'status' }, [
      h('strong', null, [
        t(oneShot ? 'readonly.oneShot.title' : 'readonly.title'),
      ]),
      h('span', null, [
        t(oneShot ? 'readonly.oneShot.body' : 'readonly.unknown.body'),
      ]),
    ]))
  }
}, { name: 'SubagentReadOnlyComposer', inheritAttrs: false, props: ['matched', 't'] })
