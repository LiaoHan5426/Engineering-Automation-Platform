import { defineComponent, h, shallowRef, watchEffect } from 'vue'
import { IconCheckOutlineRegular, IconRefreshOutlineRegular } from './icons/index.tsx'
import { StateDot } from './StateDot.tsx'
import css from './ConnectionIndicator.module.css'

/** Visual state rendered by the inline connection control. */
export type ConnectionIndicatorState = 'disconnected' | 'connecting' | 'recovered'
/** Match the exit duration in the stylesheet. */
const EXIT_MS = 150
interface ConnectionIndicatorProps {
  state: ConnectionIndicatorState | undefined
  disconnectedLabel: string
  connectingLabel: string
  recoveredLabel: string
  reconnectActionLabel: string
  restartActionLabel: string
  onReconnect: () => void
}
/** Render localized retry feedback and retain its last state during the exit transition. */
export const ConnectionIndicator = defineComponent((props: ConnectionIndicatorProps) => {
  const rendered = shallowRef(props.state)
  watchEffect(onCleanup => {
    if (props.state !== undefined) {
      rendered.value = props.state
      return
    }
    if (rendered.value === undefined) return
    const timeout = window.setTimeout(() => { rendered.value = undefined }, EXIT_MS)
    onCleanup(() => { window.clearTimeout(timeout) })
  }, { flush: 'sync' })
  return () => {
    if (rendered.value === undefined) return null
    const leavingClass = props.state === undefined ? ` ${css.leaving}` : ''
    if (rendered.value === 'recovered') return h('div', {
      class: `${css.indicator} ${css.success}${leavingClass}`, role: 'status', 'aria-label': props.recoveredLabel,
    }, [h('span', { class: css.icon, 'aria-hidden': 'true' }, [h(IconCheckOutlineRegular, { size: 14 })]), h('span', { class: css.label }, props.recoveredLabel)])
    const connecting = rendered.value === 'connecting'
    return h('button', {
      type: 'button', class: `${css.indicator} ${css.warning}${leavingClass}`, 'data-phase': rendered.value,
      'aria-label': connecting ? props.restartActionLabel : props.reconnectActionLabel, onClick: () => { props.onReconnect() },
    }, [
      h('span', { class: css.icon, 'aria-hidden': 'true' }, [connecting ? h(StateDot, { state: 'ongoing' }) : h(IconRefreshOutlineRegular, { size: 14 })]),
      h('span', { class: css.label }, connecting ? [props.connectingLabel, h('span', { class: css.dots, 'aria-hidden': 'true' }, [h('span', '.'), h('span', { class: css.secondDot }, '.'), h('span', { class: css.thirdDot }, '.')])] : props.disconnectedLabel),
    ])
  }
}, { name: 'ConnectionIndicator', inheritAttrs: false, props: ['state', 'disconnectedLabel', 'connectingLabel', 'recoveredLabel', 'reconnectActionLabel', 'restartActionLabel', 'onReconnect'] })
