import { defineComponent, h, ref } from 'vue'
// A compaction marker does not replace shadowed transcript rows. It is
// expandable only when the current window includes its cited summary.
import { IconApiOutlineRegular, IconChevronDownOutlineRegular, IconChevronRightOutlineRegular, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import { markdownLabels } from '../markdown-labels.ts'
import type { CompactionSummaryNode } from '../contract/snapshot.ts'
import css from './MessageItem.module.css'
interface CompactionItemProps {
  node: CompactionSummaryNode
  /** Optional command title for a manual compaction folded into this marker. */
  title?: string
  /** Command settlement text used when structured compaction counts are unavailable. */
  fallbackSummary?: string | null
  /** The owning view's locale seat. */
  t: ChatViewSlotProps['t']
}
/**
 * Renders the model-history compaction marker.
 * @param props - the marker node off the snapshot cache.
 * @returns the marker row, with the summary disclosure when one is available.
 */
export const CompactionItem = defineComponent((props: CompactionItemProps) => {
  const expanded = ref(false)
  return () => {
    const { node, title, fallbackSummary, t } = props
    const labels = (() => markdownLabels(t))()
    const expandable = node.summary !== null
    const open = expandable && expanded.value
    const summary = node.shadowedItemCount !== null && node.shadowedTokenCount !== null
      ? t('message.compaction.completed', {
        items: node.shadowedItemCount,
        tokens: node.shadowedTokenCount,
      })
      : fallbackSummary
                ?? (expandable ? t('message.compaction.expand') : t('message.compaction.unavailable'))
    return (h('div', { 'class': css.compactionRow }, [
      h('button', { 'type': 'button', 'class': css.compactionButton, 'disabled': !expandable, 'aria-expanded': expandable ? open : undefined, 'onClick': () => { expanded.value = (value => !value)(expanded.value) } }, [
        h('span', { 'class': css.compactionLeading, 'aria-hidden': true }, [
          h('span', { 'class': css.compactionContextIcon, 'data-compaction-icon': 'context' }, [
            h(IconApiOutlineRegular, null),
          ]),
          h('span', { 'class': css.compactionDisclosureIcon, 'data-compaction-disclosure': open ? 'expanded' : 'collapsed' }, [
            open ? h(IconChevronDownOutlineRegular, null) : h(IconChevronRightOutlineRegular, null),
          ]),
        ]),
        h('span', { 'class': css.compactionTitle }, [
          title ?? t('message.compaction'),
        ]),
        h('span', { 'class': css.compactionSep, 'aria-hidden': true }),
        h('span', { 'class': css.compactionSummary }, [
          summary,
        ]),
      ]),
      open && node.summary !== null
                && h('div', { 'class': css.compactionBody }, [
                  h(MarkdownText, { 'text': node.summary, 'labels': labels }),
                ]),
    ]))
  }
}, { name: 'CompactionItem', inheritAttrs: false, props: ['node', 'title', 'fallbackSummary', 't'] })
