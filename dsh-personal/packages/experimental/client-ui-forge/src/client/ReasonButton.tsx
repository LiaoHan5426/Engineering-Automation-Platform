/** Accessible failure reason, available on hover, focus, and touch. */
import { h, type VNodeChild } from 'vue'
import { IconInfoOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './Forge.module.css'
export function ReasonButton({ reason, label }: { readonly reason: string; readonly label: string }): VNodeChild {
  return h(Tooltip, { label: reason, side: 'bottom', align: 'end', delayMs: 500, maxWidth: 320, openOnClick: true, portal: true }, { default: () => h('button', { type: 'button', class: css.reason, 'aria-label': label, 'data-forge-reason': '' }, [h(IconInfoOutlineRegular, { size: 16 })]) })
}
