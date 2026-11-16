/** Assistant reasoning disclosure, independent of Tool-call presentation. */
import { computed, defineComponent, h } from 'vue'
import { DisclosureRow, IconThinkOutlineRegular, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChatViewSlotProps, UseDisclosure, UsePresentation } from '../contract/slots.ts'
import { reasoningText } from '../reasoning-text.ts'
import a11yCss from './accessibility.module.css'
import css from './ReasoningRow.module.css'

function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}

function latestCompletedParagraphFirstLine(text: string): string {
  let summary = ''
  let paragraphStart = 0
  const separator = /\r?\n(?:[\t ]*\r?\n)+/g
  while (true) {
    const nextParagraph = separator.exec(text)
    const paragraphEnd = nextParagraph === null ? text.length
      : nextParagraph.index + nextParagraph[0].indexOf('\n')
    const newline = text.indexOf('\n', paragraphStart)
    if (newline !== -1 && newline <= paragraphEnd) {
      const candidate = text.slice(paragraphStart, newline).trim()
      if (candidate !== '') summary = candidate
    }
    if (nextParagraph === null) return summary
    paragraphStart = nextParagraph.index + nextParagraph[0].length
  }
}

/**
 * Render one assistant reasoning block collapsed until the reader opens it. The
 * collapsed summary omits double-asterisk markers; expanded content renders
 * the complete Markdown with secondary typography. A streaming preview advances
 * when a paragraph's first line completes. Mode changes toggle CSS display without unmounting
 * collapsed summaries. The Body Slot receives both original and display-ready text.
 * @param props.text - complete or streaming reasoning text.
 * @param props.running - whether this block is the streaming tail.
 * @param props.usePresentation - live display-policy selector for this reasoning row.
 * @param props.useDisclosure - independent open state with enclosing-Turn resets.
 * @param props.renderSlot - framework renderer for the standard reasoning Body Slot.
 * @param props.t - conversation locale seat for the disclosure and running status.
 * @returns the reasoning disclosure.
 */
type ReasoningRowProps = {
  text: string
  running: boolean
  textInteractionSource?: boolean
  useDisclosure: UseDisclosure
  usePresentation: UsePresentation
  t: ChatViewSlotProps['t']
} & Pick<PropsRenderSlots<'conversation.chat.reasoning.body'>, 'renderSlot'>

export const ReasoningRow = defineComponent((props: ReasoningRowProps) => {
  const disclosure = props.useDisclosure()
  const display = computed(() => {
    const text = reasoningText(props.text)
    return { text, hidden: text !== props.text && text.trim() === '' }
  })
  const summary = computed(() => (props.running
    ? latestCompletedParagraphFirstLine(display.value.text)
    : firstLine(display.value.text)).replaceAll('**', ''))
  const preview = props.usePresentation(policy => !disclosure.value.expanded && summary.value !== ''
    && (props.running || policy.settledReasoningPreview))
  return () => {
    if (display.value.hidden) return null
    const { expanded, toggle } = disclosure.value
    const { running, t } = props
    const collapsedContent = [
      h('span', { class: css.separator, 'data-shimmer-decoration': '', 'aria-hidden': true }),
      h('span', { class: css.summary, 'data-streaming': running || undefined }, [
        h('span', { class: css.summaryText }, [h(TextShimmer, {}, { default: () => summary.value })]),
      ]),
    ]
    return h('div', {
      class: css.root, 'data-variant': 'think', 'data-state': running ? 'running' : 'ok',
      'data-expanded': expanded || undefined, 'data-preview': preview.value || undefined,
    }, [
      running ? h('span', { class: a11yCss.visuallyHidden }, t('row.running')) : null,
      h(DisclosureRow, {
        rowClassName: css.row ?? '', leadingClassName: css.leading ?? '', titleClassName: css.title ?? '',
        icon: h(IconThinkOutlineRegular, { size: 14 }), title: t('message.think'), running,
        open: expanded, expandable: true, expandOnRowClick: true, onToggle: toggle, collapsedContent,
      }, { default: () => expanded ? h('div', {
        class: css.thinkBody,
        'data-text-interaction-source': props.textInteractionSource && !running ? '' : undefined,
      }, [props.renderSlot('conversation.chat.reasoning.body', {
        rawText: props.text, text: display.value.text, running,
      })]) : undefined }),
    ])
  }
}, {
  name: 'ReasoningRow', inheritAttrs: false,
  props: ['text', 'running', 'textInteractionSource', 'useDisclosure', 'usePresentation', 'renderSlot', 't'],
})
