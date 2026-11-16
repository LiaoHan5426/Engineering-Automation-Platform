import { defineComponent, h, ref } from 'vue'
import type { ChatViewSlotProps, CommandRowOwnerProps } from '../contract/slots.ts'
import { DisclosureRow, IconApiOutlineRegular, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import a11yCss from './accessibility.module.css'
import css from './GenericCommandCard.module.css'

type CommandRowState = 'running' | 'ok' | 'error'

/** Node state → row state semantic (running while unsettled; outcome kind after). */
function stateOf(outcome: CommandRowOwnerProps['node']['outcome']): CommandRowState {
  if (outcome === null) return 'running'
  return outcome.kind === 'error' ? 'error' : 'ok'
}

/** Card props: the owner payload plus the render site's locale seat (plain prop). */
export interface GenericCommandCardProps extends CommandRowOwnerProps {
  t: ChatViewSlotProps['t']
  /** Command-specific running copy; absent uses the generic command label. */
  runningSummary?: string | undefined
}

/** Command summary with lazily mounted multiline output. */
export const GenericCommandCard = defineComponent((props: GenericCommandCardProps) => {
  const expanded = ref(false)
  const toggle = (): void => { expanded.value = !expanded.value }
  return () => {
    const { node, t, runningSummary } = props
    const text = node.outcome?.text
    const summary = node.outcome === null
      ? runningSummary ?? t('command.running')
      : text ?? (node.outcome.kind === 'error' ? t('command.failed') : t('command.done'))
    const title = node.name ?? t('command.title')
    const state = stateOf(node.outcome)
    const running = state === 'running'
    const body = text !== undefined && text.includes('\n') ? text : null
    const open = expanded.value && body !== null
    const collapsedContent = [
      h('span', { class: css.separator, 'data-shimmer-decoration': '', 'aria-hidden': true }),
      h('span', { class: css.summary, 'data-error': state === 'error' || undefined }, [
        h(TextShimmer, {}, { default: () => summary }),
      ]),
    ]
    return h('div', { class: css.root, 'data-variant': 'others', 'data-state': state }, [
      running ? h('span', { class: a11yCss.visuallyHidden }, t('row.running')) : null,
      state === 'error' ? h('span', { class: a11yCss.visuallyHidden }, t('row.failed')) : null,
      h(DisclosureRow, {
        leadingClassName: css.leading ?? '', titleClassName: css.title ?? '',
        icon: h(IconApiOutlineRegular, { size: 14 }), title, running, open,
        expandable: body !== null, expandOnRowClick: true, keepContentWhenOpen: true,
        onToggle: toggle, collapsedContent,
      }, { default: () => open ? h('pre', { class: css.body, 'data-error': state === 'error' || undefined }, body) : undefined }),
    ])
  }
}, { name: 'GenericCommandCard', inheritAttrs: false, props: ['node', 't', 'runningSummary'] })
