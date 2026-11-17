/** Settled question batches rendered with the shared user-message surface. */
import { defineComponent, h } from 'vue'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconCheckOutlineRegular, IconCopyOutlineRegular, Tooltip, UserMessageBubble, useClipboardCopy } from '@deepseek-ai/dsh-client-ui-primitives'
import type { QuestionReplyData } from './question-reply.ts'
import { replyAnswerValues, replyClipboardText } from './question-reply.ts'
import css from './QuestionReplyView.module.css'
type QuestionReplyViewProps = PropsRuntime<'conversation.chat.node', 'question-reply'> & PropsLocale<'question'>
/** Render recorded questions and answers without an expandable process row. */
export function QuestionReplyView({ node, t }: QuestionReplyViewProps) {
  return h(QuestionReplyBubble, { 'data': node.data, 't': t }, undefined)
}
/**
 * Render one answered batch with questions above their corresponding answers.
 * @param props - Reply data and the question locale translator.
 * @returns The right-aligned, fully visible question-and-answer bubble.
 */
export const QuestionReplyBubble = defineComponent((props: {
  data: QuestionReplyData
  t: PropsLocale<'question'>['t']
}) => {
  const { copied, onCopy } = useClipboardCopy(() => replyClipboardText(props.data, props.t))
  return () => {
    const { data, t } = props
    return (h('div', { 'class': css.row, 'data-question-reply': data.callId, 'data-reply-outcome': data.outcome, 'role': 'group', 'aria-label': t('reply.label') }, [h('div', { 'class': css.bubbleWidth }, [h(UserMessageBubble, { 'className': css.bubble ?? '' }, { default: () => [data.questions.length === 0
      ? h('p', { 'class': css.text }, [data.text]) : h('dl', { 'class': css.details }, [data.questions.map((question) => {
        const values = replyAnswerValues(data, question.id)
        return h('div', { 'key': question.id }, [h('dt', { 'class': css.question }, [question.header && question.header !== question.question && h('span', { 'class': css.header }, [question.header]), h('span', null, [question.question])]), h('dd', { 'class': css.answer }, [values.length === 0 ? t('reply.skipped') : values.join(', ')])])
      })])] })]), h('div', { 'class': css.actions }, [h('span', { 'class': css.time }, [new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(data.time)]), h(Tooltip, { 'label': copied.value ? t('copied') : t('copy'), 'side': 'bottom' }, { default: () => [h('button', { 'type': 'button', 'class': css.action, 'aria-label': copied.value ? t('copied') : t('copy'), 'onClick': onCopy }, [copied.value ? h(IconCheckOutlineRegular, null, undefined) : h(IconCopyOutlineRegular, null, undefined)])] })])]))
  }
}, { name: 'QuestionReplyBubble', inheritAttrs: false, props: ['data', 't'] })
