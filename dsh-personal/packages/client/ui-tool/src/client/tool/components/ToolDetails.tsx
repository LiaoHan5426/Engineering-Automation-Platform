import { h, Fragment } from 'vue'
/** Compact, read-only fields and lists for recorded Tool results. */
import {
  CodeBlock,
  MarkdownText,
  IconCheckOutlineRegular,
  IconChevronRightOutlineRegular,
  IconPlayOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { OpenFileOptions } from '@deepseek-ai/dsh-client-ui-chat/client'
import { codeToolbarLabels, markdownLabels } from '../models/primitive-labels.ts'
import css from './ToolDetails.module.css'
/** One recorded entity, receipt, or collapsible group of related values. */
export interface ToolDetailItem {
  title?: string
  subtitle?: string
  description?: string
  badge?: {
    label: string
    tone: 'neutral' | 'info' | 'success' | 'warning' | 'error'
  }
  status?: {
    value: 'completed' | 'in_progress' | 'pending'
    label: string
  }
  previousStatus?: string
  change?: {
    value: 'added' | 'removed' | 'updated'
    label: string
  }
  fields: readonly {
    label: string
    value: string
  }[]
  lines?: readonly string[]
  markdown?: string
  code?: {
    text: string
    language?: string
  }
  location?: {
    path: string
    line?: number
  }
  groups?: readonly {
    label: string
    items: readonly ToolDetailItem[]
  }[]
}
/** Localized display data shared by the built-in detail cards. */
export interface ToolDetailsModel {
  items: readonly ToolDetailItem[]
  /** Tight spacing for recorded entity rows. */
  compact?: boolean
  summary?: string
  /** Header text while expanded, omitting a receipt status shown in the body. */
  expandedSummary?: string
  empty?: string
  caption?: string
  unchanged?: {
    label: string
    items: ToolDetailsModel['items']
  }
}
interface DetailContentProps {
  t: TranslateNS<'conversation'>
  onOpenFile?: ((path: string, options?: OpenFileOptions) => void) | undefined
}
function DetailItem({
  item,
  t,
  onOpenFile,
}: {
  item: ToolDetailItem
} & DetailContentProps) {
  const status = item.status
  return h('li', { class: css.item, 'data-change': item.change?.value }, [
    item.title !== undefined &&
      h('div', { class: css.heading }, [
        status !== undefined &&
          h(
            'span',
            { class: css.status, role: 'img', 'aria-label': item.change?.label ?? status.label },
            [
              item.change?.value === 'added'
                ? '+'
                : item.change?.value === 'removed'
                  ? '−'
                  : status.value === 'completed'
                    ? h(IconCheckOutlineRegular, { size: 14 }, undefined)
                    : status.value === 'in_progress'
                      ? h(IconPlayOutlineRegular, { size: 14 }, undefined)
                      : h('span', { class: css.pending }, undefined),
            ],
          ),
        item.location !== undefined && onOpenFile !== undefined
          ? h(
            'button',
            {
              class: css.path,
              type: 'button',
              onClick: () => {
                const location = item.location
                if (location !== undefined)
                  onOpenFile(
                    location.path,
                    location.line === undefined ? undefined : { line: location.line },
                  )
              },
            },
            [item.title],
          )
          : h('span', { class: css.text }, [item.title]),
        item.badge !== undefined &&
          h('span', { class: css.badge, 'data-tone': item.badge.tone }, [item.badge.label]),
        status !== undefined &&
          h('span', { class: css.statusText }, [
            item.previousStatus !== undefined &&
              h(Fragment, null, [
                h('span', { class: css.previous }, [item.previousStatus]),
                h('span', null, [' \u2192 ']),
              ]),
            h('span', null, [status.label]),
            item.change?.value === 'updated' &&
              item.previousStatus === undefined &&
              h('span', null, [' \u00B7 ', item.change.label]),
          ]),
      ]),
    item.subtitle !== undefined && h('div', { class: css.subtitle }, [item.subtitle]),
    item.description !== undefined && h('p', { class: css.description }, [item.description]),
    item.fields.length > 0 &&
      h('dl', { class: css.fields }, [
        item.fields.map(field =>
          h('div', { key: field.label, class: css.field }, [
            h('dt', null, [field.label]),
            h('dd', null, [field.value]),
          ]),
        ),
      ]),
    item.lines !== undefined &&
      h('ul', { class: css.lines }, [
        item.lines.map((line, index) => h('li', { key: index }, [line])),
      ]),
    item.markdown !== undefined &&
      h('div', { class: css.prose }, [
        h(MarkdownText, { text: item.markdown, labels: markdownLabels(t) }, undefined),
      ]),
    item.code !== undefined &&
      h(
        CodeBlock,
        {
          toolbarLabels: codeToolbarLabels(t),
          className: css.code ?? '',
          code: item.code.text,
          lang: item.code.language,
          copyLabel: t('copy'),
          copiedLabel: t('copied'),
        },
        undefined,
      ),
    item.groups?.map((group, index) =>
      h('details', { key: index, class: css.group }, [
        h('summary', null, [
          h(IconChevronRightOutlineRegular, null, undefined),
          h('span', null, [group.label]),
        ]),
        h('ul', { class: css.list }, [
          group.items.map((child, childIndex) =>
            h(
              DetailItem,
              { key: childIndex, item: child, t: t, onOpenFile: onOpenFile },
              undefined,
            ),
          ),
        ]),
      ]),
    ),
  ])
}
/**
 * Render recorded values with local disclosures, copy controls, and file navigation.
 * @param props.model - Localized fields or list items; an empty list uses its empty label.
 * @param props.hasInspect - Reserve space for the row's upper-right Inspect button.
 * @param props.t - Conversation dictionary for shared Markdown and code controls.
 * @param props.onOpenFile - Open a recorded file location in the session workspace.
 * @returns The expanded detail body.
 */
export function ToolDetails({
  model,
  hasInspect = false,
  t,
  onOpenFile,
}: {
  model: ToolDetailsModel
  hasInspect?: boolean
} & DetailContentProps) {
  return h(
    'div',
    {
      class: css.root,
      'data-compact': model.compact || undefined,
      'data-inspect': hasInspect || undefined,
      'data-caption': model.caption !== undefined || undefined,
    },
    [
      model.caption !== undefined && h('div', { class: css.caption }, [model.caption]),
      model.items.length === 0
        ? h('p', { class: css.empty }, [model.empty])
        : h('ul', { class: css.list }, [
          model.items.map((item, index) =>
            h(DetailItem, { key: index, item: item, t: t, onOpenFile: onOpenFile }, undefined),
          ),
        ]),
      model.unchanged !== undefined &&
        h('details', { class: css.unchanged }, [
          h('summary', null, [
            h(IconChevronRightOutlineRegular, null, undefined),
            model.unchanged.label,
          ]),
          h('ul', { class: css.list }, [
            model.unchanged.items.map((item, index) =>
              h(DetailItem, { key: index, item: item, t: t, onOpenFile: onOpenFile }, undefined),
            ),
          ]),
        ]),
    ],
  )
}
