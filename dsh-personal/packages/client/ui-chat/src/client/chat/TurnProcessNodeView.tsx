import { defineComponent, h, Fragment } from 'vue'
import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatNodeViewProps } from '../contract/slots.ts'
import { turnProcessAlwaysOpen } from '../contract/turn-process.ts'
import { formatRunDuration } from './message-chrome.ts'
import a11yCss from './accessibility.module.css'
import css from './TurnProcessNodeView.module.css'

/** Settled Turn duration and process disclosure above its content. */
export const TurnProcessNodeView = defineComponent((props: ChatNodeViewProps<'turn-process'>) => () => {
  const { node, turnProcess, t } = props
  if (turnProcess === undefined) throw new Error('turn-process node requires Turn process owner state')
  const open = !turnProcess.foldable || turnProcess.open
  const turn = node.location.kind === 'turn' || node.location.kind === 'step' ? node.location.turn : undefined
  if (turn?.status !== 'closed') return null
  const canCollapse = turnProcess.foldable && turnProcess.hasContent && !turnProcessAlwaysOpen(node)
  const reason = turn.end?.data.reason.kind
  const stopped = reason === 'aborted' || reason === 'interrupted'
  const elapsedMs = turn.start === undefined || turn.end === undefined ? undefined
    : Math.max(1000, turn.end.time - turn.start.time)
  const duration = elapsedMs === undefined || stopped || reason === 'error' ? undefined : formatRunDuration(elapsedMs, t)
  const label = stopped ? t('message.stopped') : reason === 'error' ? t('message.turnProcess.failed')
    : duration === undefined ? t('message.turnProcess.worked') : t('message.turnProcess.took')
  const announcement = stopped ? t('message.stopped') : reason === 'error'
    ? t('message.turnProcess.failed') : t('message.turnProcess.worked')
  return h(Fragment, [
    h('span', { class: a11yCss.visuallyHidden, role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }, announcement),
    h('button', {
      type: 'button', class: css.root, 'data-open': open || undefined,
      'data-turn-process': node.data.turn, 'data-turn-process-messages': node.data.messageCount,
      'data-turn-process-tool-calls': node.data.toolCallCount, 'data-turn-process-subagents': node.data.subagentCount,
      disabled: !canCollapse, 'aria-expanded': turnProcess.hasContent ? open : undefined,
      onClick: (event: MouseEvent) => {
        if (event.currentTarget instanceof HTMLButtonElement) event.currentTarget.focus()
        turnProcess.setOpen(!open)
      },
    }, [h('span', { class: css.label }, [label, ...(duration?.map((part, index) =>
      h('span', { key: index, class: part.numeric ? css.durationNumber : undefined }, part.text)) ?? [])]),
      canCollapse ? h(IconChevronDownOutlineRegular, { className: css.chevron ?? '' }) : null]),
  ])
}, { name: 'TurnProcessNodeView', inheritAttrs: false, props: ['node', 'turnProcess', 't'] })
