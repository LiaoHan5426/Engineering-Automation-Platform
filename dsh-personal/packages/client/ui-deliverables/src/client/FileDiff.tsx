import { defineComponent, h, computed, shallowRef } from 'vue'
/** Shared file comparison for the turn-tail hover preview and Sidebar review. */
import { Button, languageForPath, useCodeHighlighter } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CodeHighlighter, HighlightSpan } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { WorkspaceDiffHunk } from '@deepseek-ai/dsh-workspace-changes/types'
import type { ChangesDiff } from '../changes.ts'
import type { ChangesDiffState } from './changes-diff.ts'
import type { NS } from './locales.ts'
import css from './FileDiff.module.css'
/** Maximum rendered lines per comparison. */
export const MAX_RENDERED_LINES = 5000
/** One drawn line of a hunk with its line numbers on each side. */
export interface DiffRow {
  kind: 'add' | 'del' | 'context'
  old: number | undefined
  new: number | undefined
  text: string
}
/** One side-by-side row: the old side, the new side, or both. */
export interface SplitRow {
  left?: {
    no: number
    text: string
    kind: 'del' | 'context'
  }
  right?: {
    no: number
    text: string
    kind: 'add' | 'context'
  }
}
interface HunkHighlights {
  old: ReadonlyMap<number, readonly HighlightSpan[]> | undefined
  new: ReadonlyMap<number, readonly HighlightSpan[]> | undefined
}
function highlightedSide(
  rows: readonly DiffRow[],
  side: 'old' | 'new',
  highlighter: CodeHighlighter,
): HunkHighlights['old'] {
  const source = rows.flatMap((row) => {
    const no = row[side]
    return no === undefined ? [] : [{ no, text: row.text }]
  })
  if (source.length === 0) return new Map()
  const highlighted = highlighter(source.map(line => line.text).join('\n'))
  if (highlighted === undefined) return undefined
  return new Map(
    source.map((line, index) => {
      // Shiki omits one terminal empty token row; retain an aligned empty run for that source line.
      return [line.no, highlighted[index] ?? []]
    }),
  )
}
function hunkHighlights(hunk: WorkspaceDiffHunk, highlighter: CodeHighlighter): HunkHighlights {
  const rows = hunkRows(hunk)
  return {
    old: highlightedSide(rows, 'old', highlighter),
    new: highlightedSide(rows, 'new', highlighter),
  }
}
/** Draw a line directly; thousands of stateless rows need no component instances. */
function diffText(props: { text: string; spans: readonly HighlightSpan[] | undefined }) {
  return h('span', {
    class: css.text,
    'data-diff-code': props.spans === undefined ? undefined : '',
  }, props.spans === undefined
    ? props.text
    : props.spans.map((span, index) => h('span', {
      key: index,
      style: span.style,
    }, [span.text])))
}
/**
 * Number a hunk's lines: context lines count on both sides, deletions on the
 * old side, additions on the new side.
 * @param hunk - a served hunk.
 * @returns the rows in order.
 */
export function hunkRows(hunk: WorkspaceDiffHunk): DiffRow[] {
  let oldNo = hunk.oldStart
  let newNo = hunk.newStart
  return hunk.lines.map((line) => {
    const text = line.slice(1)
    switch (line[0]) {
      case '+':
        return { kind: 'add', old: undefined, new: newNo++, text }
      case '-':
        return { kind: 'del', old: oldNo++, new: undefined, text }
      default:
        return { kind: 'context', old: oldNo++, new: newNo++, text }
    }
  })
}
/**
 * Pair a hunk's lines for the side-by-side view: each run of deletions is
 * aligned with the run of additions that follows it, row by row, and context
 * lines sit on both sides.
 * @param hunk - a served hunk.
 * @returns the rows in order.
 */
export function splitRows(hunk: WorkspaceDiffHunk): SplitRow[] {
  const rows: SplitRow[] = []
  let dels: NonNullable<SplitRow['left']>[] = []
  let adds: NonNullable<SplitRow['right']>[] = []
  const flush = (): void => {
    for (let at = 0; at < Math.max(dels.length, adds.length); at += 1) {
      const left = dels[at]
      const right = adds[at]
      rows.push({
        ...(left === undefined ? {} : { left }),
        ...(right === undefined ? {} : { right }),
      })
    }
    dels = []
    adds = []
  }
  for (const row of hunkRows(hunk)) {
    if (row.kind === 'del') dels.push({ no: row.old as number, text: row.text, kind: 'del' })
    else if (row.kind === 'add') adds.push({ no: row.new as number, text: row.text, kind: 'add' })
    else {
      flush()
      rows.push({
        left: { no: row.old as number, text: row.text, kind: 'context' },
        right: { no: row.new as number, text: row.text, kind: 'context' },
      })
    }
  }
  flush()
  return rows
}
/**
 * The hunks to draw, cut at {@link MAX_RENDERED_LINES} lines in total.
 * @param hunks - served hunks.
 * @returns the hunks with the last one shortened as needed, and whether anything was cut.
 */
export function renderedHunks(hunks: readonly WorkspaceDiffHunk[]): {
  hunks: WorkspaceDiffHunk[]
  truncated: boolean
} {
  let budget = MAX_RENDERED_LINES
  const kept: WorkspaceDiffHunk[] = []
  for (const hunk of hunks) {
    if (budget === 0) return { hunks: kept, truncated: true }
    kept.push(hunk.lines.length <= budget ? hunk : { ...hunk, lines: hunk.lines.slice(0, budget) })
    budget -= Math.min(budget, hunk.lines.length)
  }
  return { hunks: kept, truncated: hunks.some((hunk, at) => kept[at] !== hunk) }
}
/** The one-line fact about a text comparison worth stating above its hunks, if any. */
function noteOf(
  diff: Extract<
    ChangesDiff,
    {
      kind: 'text'
    }
  >,
): 'diff.created' | 'diff.deleted' | 'diff.unchanged' | undefined {
  if (!diff.before) return 'diff.created'
  if (!diff.after) return 'diff.deleted'
  if (diff.hunks.length === 0) return 'diff.unchanged'
  return undefined
}
export const FileDiff = defineComponent(
  (
    props: {
      state: ChangesDiffState | undefined
      split: boolean
      wrap: boolean
      retry: () => void
    } & PropsLocale<typeof NS>,
  ) => {
    const hasAdditions = computed(
      () =>
        typeof props.state === 'object' &&
        props.state.kind === 'text' &&
        props.state.hunks.some(hunk => hunk.lines.some(line => line.startsWith('+'))),
    )
    const hasDeletions = computed(
      () =>
        typeof props.state === 'object' &&
        props.state.kind === 'text' &&
        props.state.hunks.some(hunk => hunk.lines.some(line => line.startsWith('-'))),
    )
    const oneSided = computed(() => hasAdditions.value !== hasDeletions.value)
    return () => {
      if (props.state === undefined || props.state === 'loading')
        return h(
          'p',
          {
            class: css.status,
            role: 'status',
          },
          [props.t('diff.loading')],
        )
      if (props.state === 'missing')
        return h(
          'p',
          {
            class: css.status,
          },
          [props.t('diff.missing')],
        )
      if (props.state === 'error') {
        return h(
          'div',
          {
            class: css.status,
          },
          [
            h('span', {}, [props.t('diff.error')]),
            h(
              Button,
              {
                size: 'sm',
                onClick: props.retry,
              },
              { default: () => [props.t('presented.retry')] },
            ),
          ],
        )
      }
      if (props.state.kind === 'binary')
        return h(
          'p',
          {
            class: css.status,
          },
          [props.t('diff.binary')],
        )
      if (props.state.kind === 'oversized')
        return h(
          'p',
          {
            class: css.status,
          },
          [props.t('diff.oversized')],
        )
      return h(TextDiff, {
        diff: props.state,
        split: props.split && !oneSided.value,
        wrap: props.wrap,
        t: props.t,
      })
    }
  },
  { name: 'FileDiff', props: ['state', 'split', 'wrap', 'retry', 't'] as const },
)
/** The kind a paired row carries: a deletion or addition on either side, otherwise context. */
function splitRowKind(row: SplitRow): DiffRow['kind'] {
  return row.left?.kind === 'del' ? 'del' : row.right?.kind === 'add' ? 'add' : 'context'
}
function hunkHeader(hunk: WorkspaceDiffHunk): string {
  return `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`
}
const SplitColumns = defineComponent(
  (props: { hunks: readonly WorkspaceDiffHunk[]; highlights: readonly HunkHighlights[] }) => {
    const paired = computed(() =>
      props.hunks.map(hunk => ({ header: hunkHeader(hunk), rows: splitRows(hunk) })),
    )
    const columns = shallowRef<Record<'left' | 'right', HTMLDivElement | null>>({
      left: null,
      right: null,
    })
    const offsets = shallowRef({
      left: { scrollLeft: 0, scrollTop: 0 },
      right: { scrollLeft: 0, scrollTop: 0 },
    })
    const follow = computed(() => (side: 'left' | 'right') => (event: Event): void => {
      const peer = side === 'left' ? 'right' : 'left'
      const other = columns.value[peer]
      if (other === null) return
      for (const axis of ['scrollLeft', 'scrollTop'] as const) {
        const value = (event.currentTarget as HTMLDivElement)[axis]
        if (offsets.value[side][axis] === value) continue
        offsets.value[side][axis] = value
        other[axis] = value
        offsets.value[peer][axis] = other[axis]
      }
    })
    return () => {
      return h(
        'div',
        {
          class: css.columns,
        },
        [
          (['left', 'right'] as const).map(side =>
            h(
              'div',
              {
                key: side,
                class: css.column,
                'data-diff-side': side,
                ref: (element) => {
                  columns.value[side] = element instanceof HTMLDivElement ? element : null
                },
                onScroll: follow.value(side),
              },
              [
                paired.value.map((hunk, position) =>
                  h(
                    'section',
                    {
                      key: position,
                      class: css.hunk,
                    },
                    [
                      h(
                        'div',
                        {
                          class: css.hunkHeader,
                          'data-diff-hunk-header': true,
                        },
                        [hunk.header],
                      ),
                      hunk.rows.map((row, at) => {
                        const cell = row[side]
                        const spans =
                          cell === undefined
                            ? undefined
                            : props.highlights[position]?.[side === 'left' ? 'old' : 'new']?.get(
                              cell.no,
                            )
                        return h(
                          'div',
                          {
                            key: at,
                            class: `${css.sideLine} ${cell === undefined ? css.empty : css[cell.kind]}`,
                            'data-diff-line': splitRowKind(row),
                          },
                          [
                            h(
                              'span',
                              {
                                class: css.number,
                              },
                              [cell?.no ?? ''],
                            ),
                            diffText({
                              text: cell?.text ?? '',
                              spans: spans,
                            }),
                          ],
                        )
                      }),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      )
    }
  },
  { name: 'SplitColumns', props: ['hunks', 'highlights'] as const },
)
const TextDiff = defineComponent(
  (
    props: {
      diff: Extract<
        ChangesDiff,
        {
          kind: 'text'
        }
      >
      split: boolean
      wrap: boolean
    } & PropsLocale<typeof NS>,
  ) => {
    const note = computed(() => noteOf(props.diff))
    const bound1 = computed(() => renderedHunks(props.diff.hunks))
    const hunks = computed(() => bound1.value.hunks)
    const truncated = computed(() => bound1.value.truncated)
    const highlighter = useCodeHighlighter(() => languageForPath(props.diff.path))
    const highlights = computed(() => hunks.value.map(hunk => hunkHighlights(hunk, highlighter)))
    return () => {
      return h(
        'div',
        {
          class: css.body,
          'data-review-view': props.split ? 'split' : 'unified',
          'data-review-wrap': props.wrap || undefined,
        },
        [
          note.value !== undefined &&
            h(
              'p',
              {
                class: css.note,
                'data-diff-note': hunks.value.length === 0 ? 'empty' : 'metadata',
              },
              [props.t(note.value)],
            ),
          props.diff.coarse &&
            h(
              'p',
              {
                class: css.note,
                'data-diff-coarse': true,
              },
              [props.t('diff.coarse')],
            ),
          truncated.value &&
            h(
              'p',
              {
                class: css.note,
                'data-diff-truncated': true,
              },
              [props.t('diff.truncated', { count: String(MAX_RENDERED_LINES) })],
            ),
          props.split && !props.wrap
            ? h(SplitColumns, {
              hunks: hunks.value,
              highlights: highlights.value,
            })
            : hunks.value.map((hunk, position) => {
              const highlighted = highlights.value[position]
              return h(
                'section',
                {
                  key: position,
                  class: css.hunk,
                },
                [
                  h(
                    'div',
                    {
                      class: css.hunkHeader,
                      'data-diff-hunk-header': true,
                    },
                    [hunkHeader(hunk)],
                  ),
                  props.split
                    ? splitRows(hunk).map((row, at) =>
                      h(
                        'div',
                        {
                          key: at,
                          class: css.splitLine,
                          'data-diff-line': splitRowKind(row),
                        },
                        [
                          h(
                            'span',
                            {
                              class: `${css.cell} ${row.left === undefined ? css.empty : css[row.left.kind]}`,
                            },
                            [
                              h(
                                'span',
                                {
                                  class: css.number,
                                },
                                [row.left?.no ?? ''],
                              ),
                              diffText({
                                text: row.left?.text ?? '',
                                spans:
                                      row.left === undefined
                                        ? undefined
                                        : highlighted?.old?.get(row.left.no),
                              }),
                            ],
                          ),
                          h(
                            'span',
                            {
                              class: `${css.cell} ${row.right === undefined ? css.empty : css[row.right.kind]}`,
                            },
                            [
                              h(
                                'span',
                                {
                                  class: css.number,
                                },
                                [row.right?.no ?? ''],
                              ),
                              diffText({
                                text: row.right?.text ?? '',
                                spans:
                                      row.right === undefined
                                        ? undefined
                                        : highlighted?.new?.get(row.right.no),
                              }),
                            ],
                          ),
                        ],
                      ),
                    )
                    : hunkRows(hunk).map((row, at) =>
                      h(
                        'div',
                        {
                          key: at,
                          class: `${css.line} ${css[row.kind]}`,
                          'data-diff-line': row.kind,
                        },
                        [
                          h(
                            'span',
                            {
                              class: css.number,
                            },
                            [row.old ?? ''],
                          ),
                          h(
                            'span',
                            {
                              class: css.number,
                            },
                            [row.new ?? ''],
                          ),
                          h(
                            'span',
                            {
                              class: css.sign,
                            },
                            [row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : ' '],
                          ),
                          diffText({
                            text: row.text,
                            spans:
                                  row.kind === 'add'
                                    ? highlighted?.new?.get(row.new as number)
                                    : highlighted?.old?.get(row.old as number),
                          }),
                        ],
                      ),
                    ),
                ],
              )
            }),
        ],
      )
    }
  },
  { name: 'TextDiff', props: ['diff', 'split', 'wrap', 't'] as const },
)
