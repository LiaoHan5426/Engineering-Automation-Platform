import { defineComponent, h } from 'vue'
import type { PropsLocale, PropsRenderFactories, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { GOAL_COMMAND, type GoalCommandInputData } from './goal-command-input.ts'
import css from './GoalCommandInputView.module.css'

const GOAL_COMMANDS = [{ start: 0, end: GOAL_COMMAND.length + 1, name: GOAL_COMMAND }] as const

type GoalCommandInputViewProps =
  PropsRuntime<'conversation.chat.node', 'command-input'>
  & PropsLocale<'goal'>
  & PropsRenderFactories

/** Right-aligned command input: only the confirmed leading command is decorated. */
export const GoalCommandInputView = defineComponent((props: GoalCommandInputViewProps) => () => {
  const data: GoalCommandInputData = props.node.data
  return h('div', {
    class: css.row,
    'data-command-input': '',
    role: 'group',
    'aria-label': props.t('commandInput.aria'),
  }, [h('div', { class: css.stack }, [h('div', { class: css.bubble }, [
    props.renderFactorySlot('conversation.user.text', {
      text: data.text,
      facts: { commands: GOAL_COMMANDS },
      interactive: false,
    }),
  ])])])
}, {
  name: 'GoalCommandInputView',
  inheritAttrs: false,
  props: ['node', 't', 'renderFactorySlot'],
})
