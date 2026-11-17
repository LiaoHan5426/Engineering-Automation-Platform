import { defineComponent, Fragment, h, ref } from 'vue'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import { DisclosureRow, IconBrowseOutlineRegular, IconContextInjectionOutlineRegular, ReferenceIconRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ContextMessageNode } from '../contract/snapshot.ts'
import { contextBody } from './ContextBody.tsx'
import css from './ContextInjectionRow.module.css'
/** Props for the logged non-user message presentation. */
export interface ContextInjectionRowProps {
  content: ContextMessageNode['content']
  source: ContextMessageNode['source']
  /** Role and producer name projected from the durable source. */
  producer: ContextMessageNode['producer']
  /** Producer-declared information form; null renders the opaque body. */
  form: ContextMessageNode['form']
  /** The owning view's locale seat, passed down as a plain prop. */
  t: ChatViewSlotProps['t']
}
/**
 * Render logged context with the Tool calls disclosure chrome from Figma.
 *
 * The header names the role the context plays and, beside it, the producer the
 * durable source identifies, so a reader can tell an injected skill catalog
 * from a workspace instruction file or a recalled session without expanding.
 * The expanded body follows the producer-declared form; an absent or unknown
 * form renders the opaque body.
 * @param props - Durable content, its projected producer role/name and form, and the locale seat.
 * @returns A collapsed context row with a bounded, form-specific body.
 */
export const ContextInjectionRow = defineComponent((props: ContextInjectionRowProps) => {
  const open = ref(false)
  return () => {
    const { content, source, producer, form, t } = props
    // Resolved rather than declared: a form whose fields are unreadable renders
    // the opaque body, and the marker must say what the row actually shows.
    const { rendered, summary, body } = contextBody(form, { content, source, t })
    const toolBlocks = content.length > 0
            && content.every(block => block.type === 'tool-addition' || block.type === 'tool-removal')
      ? content : undefined
    const added = toolBlocks?.flatMap(block => block.type === 'tool-addition' ? [block.toolName] : []) ?? []
    const removed = toolBlocks?.flatMap(block => block.type === 'tool-removal' ? [block.toolName] : []) ?? []
    const single = toolBlocks?.length === 1 ? toolBlocks[0] : undefined
    const toolSummary = toolBlocks === undefined || single !== undefined ? null
      : added.length > 0 && removed.length > 0
        ? t('message.toolsChanged', { added: added.length, removed: removed.length })
        : added.length > 0
          ? t('message.toolsAddedCount', { count: added.length })
          : t('message.toolsRemovedCount', { count: removed.length })
    return (h(DisclosureRow, { 'className': css.root, 'icon': toolBlocks !== undefined ? h(IconBrowseOutlineRegular, { 'size': 14 }) : producer.role === 'recall'
      ? h('span', { 'data-context-recall-icon': true }, [
        h(ReferenceIconRegular, { 'kind': 'session' }),
      ]) : h(IconContextInjectionOutlineRegular, { 'size': 14 }), 'chevronClassName': css.chevron, 'title': single !== undefined ? t(single.type === 'tool-addition' ? 'message.toolAdded' : 'message.toolRemoved', { name: single.toolName }) : t(toolBlocks !== undefined ? 'message.toolsUpdated' : producer.role === 'recall' ? 'message.contextRecall' : 'message.contextInjection'), 'collapsedContent': toolSummary !== null ? (h(Fragment, null, [
      h('span', { 'class': css.sep, 'aria-hidden': true }),
      h('span', { 'class': css.summary }, [
        toolSummary,
      ]),
    ])) : toolBlocks !== undefined || producer.label === null ? undefined : (h(Fragment, null, [
      h('span', { 'class': css.sep, 'aria-hidden': true }),
      h('span', { 'class': css.source, 'data-context-source': true }, [
        producer.label,
      ]),
      summary !== null && (h(Fragment, null, [
        h('span', { 'class': css.sep, 'aria-hidden': true }),
        h('span', { 'class': css.summary, 'data-context-summary': true }, [
          summary,
        ]),
      ])),
    ])), 'keepContentWhenOpen': true, 'open': open.value && single === undefined, 'expandable': single === undefined, 'expandOnRowClick': true, 'onToggle': () => { open.value = (value => !value)(open.value) } }, { default: () => [
      h('div', { 'class': css.body, 'data-context-injection-body': true, 'data-context-form': rendered ?? undefined }, [
        toolBlocks === undefined ? body : (h('div', { 'class': css.toolChanges }, [
          added.length > 0 && h('div', null, [
            t('message.toolsAdded', { names: added.join(', ') }),
          ]),
          removed.length > 0 && h('div', null, [
            t('message.toolsRemoved', { names: removed.join(', ') }),
          ]),
        ])),
      ]),
    ] }))
  }
}, { name: 'ContextInjectionRow', inheritAttrs: false, props: ['content', 'source', 'producer', 'form', 't'] })
