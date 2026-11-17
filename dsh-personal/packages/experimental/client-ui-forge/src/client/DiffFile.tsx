import {
  defineComponent,
  h,
  Fragment,
  computed,
  shallowRef,
  watch,
  onMounted,
  type VNodeChild,
} from 'vue'
/**
 * One file of the changes view: a sticky header with the path, badges, line
 * counts, and file actions, then its hunks unified or side by side with the
 * unchanged lines between them collapsed into rows that expand them. A section
 * draws and highlights its lines once it comes within reach of the scrollport;
 * it redraws only when its own props change.
 */
import clsx from 'clsx'
import {
  FileTypeIcon,
  IconChevronDownOutlineRegular,
  IconChevronsUpDownOutlineRegular,
  IconEllipsisOutlineRegular,
  IconPlusOutlineRegular,
  Tag,
  Tooltip,
  languageForPath,
  Menu,
  MenuItemButton,
  useCodeHighlighter,
  type CodeHighlighter,
  type HighlightSpan,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ForgeDiffFile } from '../types.ts'
import {
  drawnLines,
  segmentsOf,
  splitRows,
  type DiffRow,
  type SplitCell,
  type SplitRow,
} from './diff-rows.ts'
import { codeSideAt, readCodeSelection } from './code-selection.ts'
import { reviewMatches, selectReviewLines, type ReviewSelection } from './review.ts'
import { ReviewThread, useFileReview } from './ReviewThread.tsx'
import {
  OutdatedThreads,
  ThreadCard,
  type FileThreads,
  type LineThread,
  type ThreadActions,
} from './ReviewThreads.tsx'
import { gapOf } from './review-threads.ts'
import type { FileReviewState } from './review-queue.ts'
import { ReviewComposer, type ReviewActions } from './ReviewComposer.tsx'
import reviewCss from './ReviewComposer.module.css'
import { FileLabel } from './FileLabel.tsx'
import type { ForgePanelKey, NS } from './locales.ts'
import type { ViewedState } from './viewed-files.ts'
import type { SectionReach } from './section-reach.ts'
import type { SourcedAnnotation } from './annotations.ts'
import css from './ChangesTab.module.css'
type Translate = PropsLocale<typeof NS>['t']
/** One action of a file's menu. */
export interface DiffFileAction {
  /** Dictionary key of the row label. */
  readonly label: ForgePanelKey
  /** Runs the action. */
  readonly run: () => void
}
/** New side of a file: its lines once read, `loading` while a read runs, or undefined before any. */
export type DiffFileText = readonly string[] | 'loading' | undefined
/**
 * What every file section of one changes view calls. The view passes the same
 * object on every render, so a section redraws only when its own values change.
 */
export interface DiffFileHandlers {
  /** Expand or collapse a file. */
  readonly toggle: (file: ForgeDiffFile) => void
  /** Show a large file anyway. */
  readonly reveal: (path: string) => void
  /** Expand one gap of a file. */
  readonly expand: (file: ForgeDiffFile, index: number) => void
  /** Mark a file viewed, which also collapses it, or clear the mark. */
  readonly view: (file: ForgeDiffFile, viewed: boolean) => void
  /** Rows of a file's menu, read whenever the menu draws. */
  readonly actions: (file: ForgeDiffFile) => readonly DiffFileAction[]
  /** Receive a file's section element, which scrolling to the file targets, or null once it unmounts. */
  readonly section: (path: string, element: HTMLElement | null) => void
  /** Show a file's next unresolved host thread in display order after the last one shown, or its first. */
  readonly nextThread: (path: string) => void
  /** Tells each expanded section when it comes within reach of the scrollport, which draws its lines. */
  readonly reach: SectionReach
  /** Draw the content of one line annotation through its source's `forge.diff.line.annotation` entry. */
  readonly annotation: (path: string, item: SourcedAnnotation) => VNodeChild
  /** Draw the plugin rows of a file's menu through `forge.changes.file.menu`. */
  readonly fileMenu: (file: ForgeDiffFile, dismiss: () => void) => VNodeChild
  /** Show the hunks the chosen lens folds in a file. */
  readonly unfold: (path: string) => void
}
/** Props of one file section. */
export interface DiffFileProps {
  /** Whether the owning tab is visible and may show temporary menus. */
  readonly visible: boolean
  /** Comment destinations and the source being reviewed. */
  readonly review?: ReviewActions | undefined
  /** The file and its hunks. */
  readonly file: ForgeDiffFile
  /** Whether the section shows its lines. */
  readonly expanded: boolean
  /** Whether the file shows the large-file notice instead of its lines until revealed. */
  readonly large: boolean
  /** Whether the user revealed a large file. */
  readonly revealed: boolean
  /** The file's new side, which supplies collapsed unchanged lines. */
  readonly text: DiffFileText
  /** Indexes of the expanded gaps. */
  readonly open: ReadonlySet<number>
  /** Whether deletions and additions show in two columns; a file with only additions or only deletions keeps one. */
  readonly split: boolean
  /** Whether long lines wrap. */
  readonly wrap: boolean
  /** Badge text after the path, or empty for none. */
  readonly badge: string
  /** Hover text of the path: both paths of a renamed file, else the path. */
  readonly tooltip: string
  /** Whether the reader marked this change viewed, or marked an earlier change of the file. */
  readonly viewed: ViewedState
  /** Tooltip of the viewed mark: where marks are kept, or why the mark cannot change now. */
  readonly viewedNote: string
  /** Whether the mark cannot change now, while its write is in flight or the host's marks could not be read. */
  readonly viewedDisabled: boolean
  /** Review threads of the file from the code host, or undefined while none are read; the view keeps their identity. */
  readonly threads?: FileThreads | undefined
  /** Whether the section draws its lines at once, as the target of a thread jump, whose card must exist to be centered. */
  readonly drawNow?: boolean | undefined
  /** Line annotations of the file in stacking order, or undefined for none; the view keeps their identity. */
  readonly annotations?: readonly SourcedAnnotation[] | undefined
  /** Most annotations the file shows, the rest counted below them, or undefined to show none while the limit is unknown. */
  readonly annotationLimit?: number | undefined
  /** Indexes of the hunks the chosen lens folds with the lens's title, or undefined for none; the view keeps their identity. */
  readonly folded?:
    | {
      readonly hunks: ReadonlySet<number>
      readonly lens: string
    }
    | undefined
  /** Actions shared by every section of the view. */
  readonly handlers: DiffFileHandlers
  /** Forge panel copy. */
  readonly t: Translate
}
export const Counts = defineComponent(
  (props: {
    readonly file: Pick<ForgeDiffFile, 'additions' | 'deletions' | 'binary'>
    readonly t: Translate
  }) => {
    return () => {
      if (props.file.binary) return h('span', {}, [props.t('diff.binaryLabel')])
      return h(
        'span',
        {
          class: css.counts,
        },
        [
          h(
            'span',
            {
              class: css.added,
            },
            [`+${props.file.additions.toLocaleString('en-US')}`],
          ),
          h(
            'span',
            {
              class: css.deleted,
            },
            [`−${props.file.deletions.toLocaleString('en-US')}`],
          ),
        ],
      )
    }
  },
  { name: 'Counts', props: ['file', 't'] as const },
)
const SIGN: Record<DiffRow['kind'], string> = { add: '+', del: '-', context: '' }
/** Highlighted tokens of one side's lines by line number, or undefined while the grammar is unavailable. */
type SideSpans = ReadonlyMap<number, readonly HighlightSpan[]> | undefined
/** A segment ready to draw: collapsed lines, or rows with the tokens of each side. */
type Prepared =
  | {
    readonly kind: 'gap'
    readonly index: number
    readonly count: number | null
  }
  | {
    readonly kind: 'folded'
    readonly hunks: readonly number[]
  }
  | {
    readonly kind: 'rows'
    readonly rows: readonly DiffRow[]
    readonly old: SideSpans
    readonly new: SideSpans
  }
/** Highlight one side of a run of rows as one fragment, so tokens spanning lines keep their state. */
function sideSpans(
  rows: readonly DiffRow[],
  side: 'old' | 'new',
  highlighter: CodeHighlighter,
): SideSpans {
  const numbered: {
    readonly no: number
    readonly text: string
  }[] = []
  for (const row of rows) {
    const no = row[side]
    if (no !== null) numbered.push({ no, text: row.text })
  }
  if (numbered.length === 0) return new Map()
  const highlighted = highlighter(numbered.map(line => line.text).join('\n'))
  if (highlighted === undefined) return undefined
  // Shiki omits a final empty token row, so a final empty line gets no tokens.
  return new Map(numbered.map((line, index) => [line.no, highlighted[index] ?? []]))
}
const Code = defineComponent(
  (props: {
    readonly text: string
    readonly spans: readonly HighlightSpan[] | undefined
    readonly old: number | null
    readonly next: number | null
  }) => {
    return () => {
      return h(
        'span',
        {
          class: css.text,
          'data-review-code': '',
          'data-old-line': props.old ?? undefined,
          'data-new-line': props.next ?? undefined,
          'data-diff-code': props.spans === undefined ? undefined : '',
        },
        [
          props.spans === undefined
            ? props.text
            : props.spans.map((span, index) =>
              h(
                'span',
                {
                  key: index,
                  style: span.style,
                },
                [span.text],
              ),
            ),
        ],
      )
    }
  },
  { name: 'Code', props: ['text', 'spans', 'old', 'next'] as const },
)
/** Whether a side-by-side row repeats an unchanged line or shows a change. */
/** Whether two comments cover the same lines of the same side. */
function sameRange(a: ReviewSelection['comment'], b: ReviewSelection['comment']): boolean {
  return a.side === b.side && a.startLine === b.startLine && a.endLine === b.endLine
}
/** Whether a selection covers one line of a side. */
function covers(item: ReviewSelection, side: 'L' | 'R', line: number): boolean {
  return (
    item.comment.side === side && line >= item.comment.startLine && line <= item.comment.endLine
  )
}
/** The editor key of a range, such as `R3-4`. */
function rangeKey(item: ReviewSelection): string {
  return `${item.comment.side}${item.comment.startLine}-${item.comment.endLine}`
}
/** A file's annotations as it shows them: on lines, on the whole file, written on an earlier change, and how many the limit leaves out. */
interface FileAnnotations {
  readonly lines: readonly SourcedAnnotation[]
  readonly file: readonly SourcedAnnotation[]
  readonly outdated: readonly SourcedAnnotation[]
  readonly hidden: number
}
const NO_ANNOTATIONS: FileAnnotations = { lines: [], file: [], outdated: [], hidden: 0 }
/** Group the first `limit` annotations of a file by where they show; none show while the limit is unknown. */
function groupAnnotations(
  file: ForgeDiffFile,
  items: readonly SourcedAnnotation[] | undefined,
  limit: number | undefined,
): FileAnnotations {
  if (items === undefined || items.length === 0 || limit === undefined) return NO_ANNOTATIONS
  const lines: SourcedAnnotation[] = []
  const whole: SourcedAnnotation[] = []
  const outdated: SourcedAnnotation[] = []
  for (const item of items.slice(0, limit)) {
    const { place, digest } = item.annotation
    if (digest !== undefined && digest !== file.digest) outdated.push(item)
    else if (place === 'file') whole.push(item)
    else lines.push(item)
  }
  return { lines, file: whole, outdated, hidden: Math.max(0, items.length - limit) }
}
/** Whether a line of one side falls in one of the hunks. */
function inHunks(
  file: ForgeDiffFile,
  hunks: readonly number[],
  side: 'L' | 'R',
  line: number,
): boolean {
  return hunks.some((index) => {
    const hunk = file.hunks[index]
    /* v8 ignore next -- folded indexes name hunks of the file */
    if (hunk === undefined) return false
    const start = side === 'L' ? hunk.oldStart : hunk.newStart
    return line >= start && line < start + (side === 'L' ? hunk.oldLines : hunk.newLines)
  })
}
/** The saved comments and plugin annotations the lines of a file place. */
interface LinesNotes {
  readonly comments: FileReviewState
  readonly annotations: readonly SourcedAnnotation[]
}
const Annotation = defineComponent(
  (props: {
    readonly path: string
    readonly item: SourcedAnnotation
    readonly handlers: DiffFileHandlers
  }) => {
    return () => {
      return h(
        'div',
        {
          class: css.annotation,
          'data-forge-annotation': `${props.item.source}/${props.item.annotation.key}`,
        },
        [props.handlers.annotation(props.path, props.item)],
      )
    }
  },
  { name: 'Annotation', props: ['path', 'item', 'handlers'] as const },
)
function pairKind(pair: SplitRow): 'context' | 'change' {
  return pair.left !== null && pair.left.kind === 'context' ? 'context' : 'change'
}
const Lines = defineComponent(
  (
    props: Pick<
      DiffFileProps,
      | 'file'
      | 'text'
      | 'open'
      | 'handlers'
      | 'split'
      | 'wrap'
      | 'review'
      | 'visible'
      | 'threads'
      | 'folded'
      | 't'
    > &
      LinesNotes,
  ) => {
    const lines = computed(() => (typeof props.text === 'object' ? props.text : undefined))
    const columns = computed(
      () => props.split && props.file.additions > 0 && props.file.deletions > 0,
    )
    const singleSide = computed(() =>
      props.file.status === 'added' ? 'R' : props.file.status === 'deleted' ? 'L' : null,
    )
    const highlighter = useCodeHighlighter(() => languageForPath(props.file.path))
    const foldLens = computed(() => (props.folded === undefined ? '' : props.folded.lens))
    const selection = shallowRef<ReviewSelection | null>(null)
    const chosen = shallowRef<ReviewSelection | null>(null)
    const select = (next: ReviewSelection | null): void => {
      chosen.value = next
      selection.value = next
    }
    const editors = shallowRef<readonly ReviewSelection[]>([])
    const root = shallowRef<HTMLDivElement | null>(null)
    const origin = shallowRef<{
      side: 'L' | 'R'
      line: number
    } | null>(null)
    const dragging = shallowRef<'gutter' | 'add' | 'text' | null>(null)
    const selecting = shallowRef(false)
    const nativeSide = shallowRef<'L' | 'R' | null>(null)
    const nativeSelection = (): void => {
      const capture0 = nativeSide.value
      if (capture0 === null || root.value === null || props.review === undefined) return
      const selected = readCodeSelection(root.value, capture0)
      if (selected === undefined) {
        chosen.value = null
        selection.value = null
        nativeSide.value = null
        return
      }
      const comment = selectReviewLines(props.file, selected.side, selected.from, selected.to)
      const previous = chosen.value
      const next =
        comment === undefined
          ? null
          : previous !== null && sameRange(previous.comment, comment)
            ? previous
            : { source: props.review.source, comment }
      chosen.value = next
      selection.value = next
    }
    onMounted(() => {
      watch(
        () => [nativeSide.value, nativeSelection],
        (_next, _previous, onCleanup) => {
          const capture1 = nativeSide.value
          const generation0 = capture1

          if (generation0 === null) return
          const changed = (): void => {
            if (dragging.value === null) nativeSelection()
          }
          document.addEventListener('selectionchange', changed)
          onCleanup(() => {
            document.removeEventListener('selectionchange', changed)
          })
        },
        { immediate: true, flush: 'post' },
      )
    })
    const compose = (target: ReviewSelection): void => {
      const capture2 = editors.value
      const open =
        root.value?.querySelector<HTMLTextAreaElement>(
          `[data-forge-comment="${rangeKey(target)}"] textarea`,
        ) ?? null
      if (open !== null) open.focus()
      else editors.value = (list => [...list, target])(capture2)
      const native = window.getSelection()
      if (root.value?.contains(native?.anchorNode ?? null) === true) native?.removeAllRanges()
      select(null)
      nativeSide.value = null
      origin.value = null
    }
    onMounted(() => {
      watch(
        () => [nativeSide.value],
        (_next, _previous, onCleanup) => {
          const capture3 = nativeSide.value
          const generation0 = capture3
          if (generation0 === null) return
          const copy = (event: ClipboardEvent): void => {
            if (
              root.value === null ||
              event.clipboardData === null ||
              (event.target instanceof Element &&
                event.target.closest('input, textarea, [contenteditable="true"]') !== null)
            )
              return
            const selected = readCodeSelection(root.value, generation0)
            if (selected === undefined) return
            event.preventDefault()
            event.clipboardData.setData('text/plain', selected.text)
          }
          document.addEventListener('copy', copy)
          onCleanup(() => {
            document.removeEventListener('copy', copy)
          })
        },
        { immediate: true, flush: 'post' },
      )
    })
    onMounted(() => {
      watch(
        () => [selecting.value, nativeSelection],
        (_next, _previous, onCleanup) => {
          const capture4 = selecting.value
          const generation0 = capture4

          if (!generation0) return
          const finish = (event: PointerEvent): void => {
            if (dragging.value === 'text') nativeSelection()
            const release =
              dragging.value === 'add' && event.type === 'pointerup' ? chosen.value : null
            dragging.value = null
            selecting.value = false
            if (release !== null) compose(release)
          }
          window.addEventListener('pointerup', finish)
          window.addEventListener('pointercancel', finish)
          onCleanup(() => {
            window.removeEventListener('pointerup', finish)
            window.removeEventListener('pointercancel', finish)
          })
        },
        { immediate: true, flush: 'post' },
      )
    })
    const foldHunks = computed(() => {
      if (props.folded === undefined) return undefined
      const currentReview = props.review
      const holds = (index: number): boolean =>
        editors.value.some(item =>
          inHunks(props.file, [index], item.comment.side, item.comment.endLine),
        ) ||
        (currentReview !== undefined &&
          props.comments.threads.some(
            thread =>
              reviewMatches(thread.selection, currentReview.source, props.file) &&
              inHunks(
                props.file,
                [index],
                thread.selection.comment.side,
                thread.selection.comment.endLine,
              ),
          ))
      return new Set([...props.folded.hunks].filter(index => !holds(index)))
    })
    const prepared = computed(() =>
      segmentsOf(props.file, lines.value, props.open, foldHunks.value).map((segment): Prepared =>
        segment.kind !== 'rows'
          ? segment
          : {
            ...segment,
            old: sideSpans(segment.rows, 'old', highlighter),
            new: sideSpans(segment.rows, 'new', highlighter),
          },
      ),
    )
    const choose = (side: 'L' | 'R', line: number, extend: boolean): boolean => {
      if (props.review === undefined) return false
      const from = extend && origin.value?.side === side ? origin.value.line : line
      const comment = selectReviewLines(props.file, side, from, line)
      if (comment === undefined) return false
      if (!extend || origin.value?.side !== side) origin.value = { side, line }
      select({ source: props.review.source, comment })
      return true
    }
    const extendAdd = (buttons: number, old: number | null, next: number | null): void => {
      const from = origin.value
      if (dragging.value !== 'add' || buttons !== 1 || from === null) return
      const line = from.side === 'L' ? old : next
      if (line !== null) choose(from.side, line, true)
    }
    const selected = (side: 'L' | 'R', line: number | null): boolean =>
      line !== null && selection.value !== null && covers(selection.value, side, line)
    const marked = (side: 'L' | 'R', line: number | null): boolean =>
      line !== null &&
      ((selected(side, line) && nativeSide.value === null) ||
        editors.value.some(item => covers(item, side, line)))
    const number = (side: 'L' | 'R', line: number | null, hover: boolean): VNodeChild => {
      const capture5 = selecting.value
      const capture6 = selection.value
      if (
        line === null ||
        props.review === undefined ||
        !props.file.hunks.some((hunk) => {
          const start = side === 'L' ? hunk.oldStart : hunk.newStart
          return line >= start && line < start + (side === 'L' ? hunk.oldLines : hunk.newLines)
        })
      ) {
        return h(
          'span',
          {
            class: css.number,
          },
          [line ?? ''],
        )
      }
      const plus =
        !capture5 &&
        capture6 !== null &&
        capture6.comment.side === side &&
        capture6.comment.endLine === line
          ? capture6
          : null
      return h(
        'span',
        {
          class: clsx(css.number, reviewCss.gutter),
          'data-review-side': side,
          onPointerenter: (event) => {
            if (dragging.value === 'gutter' && origin.value?.side === side && event.buttons === 1)
              choose(side, line, true)
          },
        },
        [
          h(
            'button',
            {
              type: 'button',
              class: reviewCss.line,
              'aria-label': props.t('review.selectLine', { line: `${side}${line}` }),
              'aria-pressed': selected(side, line),
              onPointerdown: (event) => {
                if (event.button !== 0) return
                event.preventDefault()
                window.getSelection()?.removeAllRanges()
                nativeSide.value = null
                dragging.value = 'gutter'
                selecting.value = true
                choose(side, line, event.shiftKey)
              },
              onClick: (event) => {
                if (event.detail !== 0) return
                window.getSelection()?.removeAllRanges()
                nativeSide.value = null
                choose(side, line, event.shiftKey)
              },
            },
            [line],
          ),
          plus !== null &&
            h(
              Tooltip,
              {
                label: props.t('review.addComment'),
                portal: true,
              },
              {
                default: () => [
                  h(
                    'button',
                    {
                      type: 'button',
                      class: reviewCss.add,
                      'aria-label': props.t('review.addComment'),
                      onPointerdown: (event) => {
                        event.preventDefault(
                          /** Whether a side-by-side row repeats an unchanged line or shows a change. */
                          /** Whether two comments cover the same lines of the same side. */
                        )
                      },
                      onClick: () => {
                        compose(plus)
                      },
                    },
                    [
                      h(IconPlusOutlineRegular, {
                        size: 14,
                      }),
                    ],
                  ),
                ],
              },
            ),
          hover &&
            plus === null &&
            h(
              'span',
              {
                class: reviewCss.hoverAdd,
                'aria-hidden': 'true',
                'data-review-add': `${side}${line}`,
                onPointerdown: (event) => {
                  if (event.button !== 0) return
                  event.preventDefault()
                  if (!choose(side, line, event.shiftKey)) return
                  window.getSelection()?.removeAllRanges()
                  nativeSide.value = null
                  dragging.value = 'add'
                  selecting.value = true
                },
              },
              [
                h(IconPlusOutlineRegular, {
                  size: 14,
                }),
              ],
            ),
        ],
      )
    }
    const cell = (value: SplitCell | null, spans: SideSpans, side: 'L' | 'R'): VNodeChild =>
      value === null
        ? h('span', {
          class: clsx(css.cell, css.empty),
          'data-diff-side': side,
        })
        : h(
          'span',
          {
            class: clsx(css.cell, css[value.kind], marked(side, value.no) && reviewCss.selected),
            'data-diff-side': side,
          },
          [
            number(side, value.no, true),
            h(Code, {
              text: value.text,
              spans: spans?.get(value.no),
              old: side === 'L' ? value.no : null,
              next: side === 'R' ? value.no : null,
            }),
          ],
        )
    const endsAt = (old: number | null, next: number | null): boolean =>
      selection.value !== null &&
      (selection.value.comment.side === 'L' ? old : next) === selection.value.comment.endLine
    return () => {
      const capture8 = editors.value
      const capture9 = lines.value
      const capture10 = columns.value
      const capture11 = singleSide.value
      const capture12 = foldLens.value
      const capture13 = selecting.value
      const capture14 = nativeSide.value
      const capture15 = prepared.value
      const currentThreads = props.threads
      const rows: VNodeChild[] = []
      const unplacedEditors = new Set(capture8)
      const remaining = new Set(props.comments.threads)
      const unplaced = new Set(
        currentThreads === undefined
          ? []
          : currentThreads.lines.map(item => ({ ...item, actions: currentThreads.actions })),
      )
      const threadCard = (
        item: LineThread & {
          readonly actions: ThreadActions
        },
      ): VNodeChild =>
        h(ThreadCard, {
          key: `thread-${item.thread.id}`,
          thread: item.thread,
          place: item.place,
          actions: item.actions,
          t: props.t,
        })
      const unplacedNotes = new Set(props.annotations)
      const annotationOf = (item: SourcedAnnotation): VNodeChild =>
        h(Annotation, {
          key: `annotation-${item.source}-${item.annotation.key}`,
          path: props.file.path,
          item: item,
          handlers: props.handlers,
        })
      const lastLine = (
        item: SourcedAnnotation,
      ): {
        readonly side: 'L' | 'R'
        readonly line: number
      } => {
        const place = item.annotation.place
        if (place === 'file') return { side: 'R', line: 0 }
        return { side: place.side, line: place.endLine }
      }
      const commentsAt = (side: 'L' | 'R', line: number | null): VNodeChild[] => {
        const nodes: VNodeChild[] = []
        if (line === null) return nodes
        if (props.review !== undefined) {
          for (const item of unplacedEditors) {
            if (item.comment.side !== side || item.comment.endLine !== line) continue
            nodes.push(editorOf(item, props.review))
            unplacedEditors.delete(item)
          }
          for (const thread of remaining) {
            const comment = thread.selection.comment
            if (
              comment.side !== side ||
              comment.endLine !== line ||
              !reviewMatches(thread.selection, props.review.source, props.file)
            )
              continue
            nodes.push(
              h(ReviewThread, {
                key: `record-${thread.key}`,
                thread: thread,
                actions: props.review,
                locked: props.comments.locked,
                outdated: false,
                t: props.t,
              }),
            )
            remaining.delete(thread)
          }
        }
        for (const item of unplaced) {
          if (item.place.side !== side || item.place.endLine !== line) continue
          nodes.push(threadCard(item))
          unplaced.delete(item)
        }
        for (const item of unplacedNotes) {
          const at = lastLine(item)
          if (at.side !== side || at.line !== line) continue
          nodes.push(annotationOf(item))
          unplacedNotes.delete(item)
        }
        return nodes
      }
      const editorOf = (item: ReviewSelection, actions: ReviewActions): VNodeChild =>
        h(ReviewComposer, {
          key: `comment-${rangeKey(item)}`,
          selection: item,
          visible: props.visible,
          actions: actions,
          close: () => {
            const capture7 = capture8
            editors.value = (list =>
              list.filter(open => !sameRange(open.comment, item.comment)))(capture7)
          },
          t: props.t,
        })
      const notes = (key: string, pair: SplitRow): void => {
        const left = commentsAt('L', pair.left?.no ?? null)
        const right = commentsAt('R', pair.right?.no ?? null)
        if (left.length === 0 && right.length === 0) return
        const side = (value: SplitCell | null, nodes: VNodeChild[]): VNodeChild =>
          h(
            'div',
            {
              class: clsx(css.noteCell, css[value?.kind ?? 'empty']),
            },
            [
              h('span', {
                class: css.number,
              }),
              h(
                'div',
                {
                  class: css.noteStack,
                  'data-forge-comments': '',
                },
                [nodes],
              ),
            ],
          )
        rows.push(
          h(
            'div',
            {
              key: key,
              class: css.notes,
              'data-forge-notes': '',
            },
            [side(pair.left, left), side(pair.right, right)],
          ),
        )
      }
      const renderLines = capture9
      const renderColumns = capture10
      const renderSingleSide = capture11
      const renderFoldLens = capture12
      const renderSelecting = capture13
      const renderNativeSide = capture14
      const renderPrepared = capture15
      const renderRows = rows
      const renderUnplacedEditors = unplacedEditors
      const renderRemaining = remaining
      const renderUnplaced = unplaced
      const renderUnplacedNotes = unplacedNotes
      let maximum = Math.max(
        1,
        renderLines?.length ?? 0,
        (renderLines?.length ?? 0) + props.file.deletions - props.file.additions,
      )
      for (const hunk of props.file.hunks)
        maximum = Math.max(
          maximum,
          hunk.oldStart + hunk.oldLines - 1,
          hunk.newStart + hunk.newLines - 1,
        )
      for (const [at, segment] of renderPrepared.entries()) {
        if (segment.kind === 'gap') {
          renderRows.push(
            h(
              'button',
              {
                key: `gap-${segment.index}`,
                type: 'button',
                class: css.gap,
                disabled: props.text === 'loading',
                'data-forge-diff-gap': segment.index,
                onClick: () => {
                  props.handlers.expand(props.file, segment.index)
                },
              },
              [
                h(IconChevronsUpDownOutlineRegular, {
                  size: 12,
                }),
                segment.count === null
                  ? props.t('diff.unchangedRest')
                  : props.t('diff.unchanged', { count: segment.count.toLocaleString('en-US') }),
              ],
            ),
          )
          for (const item of renderUnplaced) {
            if (gapOf(props.file, item.place.side, item.place.endLine) !== segment.index) continue
            renderRows.push(threadCard(item))
            renderUnplaced.delete(item)
          }
          for (const item of renderUnplacedNotes) {
            const at = lastLine(item)
            if (gapOf(props.file, at.side, at.line) !== segment.index) continue
            renderRows.push(annotationOf(item))
            renderUnplacedNotes.delete(item)
          }
        } else if (segment.kind === 'folded') {
          renderRows.push(
            h(
              'button',
              {
                key: `folded-${segment.hunks.join(',')}`,
                type: 'button',
                class: clsx(css.gap, css.lensFold),
                'data-forge-lens-fold': segment.hunks.join(','),
                onClick: () => {
                  props.handlers.unfold(props.file.path)
                },
              },
              [
                h(IconChevronsUpDownOutlineRegular, {
                  size: 12,
                }),
                h(
                  'span',
                  {
                    class: css.lensFoldText,
                  },
                  [
                    props.t('filterLens.folded', {
                      count: String(segment.hunks.length),
                      lens: renderFoldLens,
                    }),
                  ],
                ),
                h(
                  'span',
                  {
                    class: css.lensFoldAction,
                  },
                  [props.t('filterLens.unfold')],
                ),
              ],
            ),
          )
          for (const item of renderUnplaced) {
            if (!inHunks(props.file, segment.hunks, item.place.side, item.place.endLine)) continue
            renderRows.push(threadCard(item))
            renderUnplaced.delete(item)
          }
          for (const item of renderUnplacedNotes) {
            const place = lastLine(item)
            if (!inHunks(props.file, segment.hunks, place.side, place.line)) continue
            renderRows.push(annotationOf(item))
            renderUnplacedNotes.delete(item)
          }
        } else if (renderColumns) {
          for (const [index, pair] of splitRows(segment.rows).entries()) {
            renderRows.push(
              h(
                'div',
                {
                  key: `${at}-${index}`,
                  class: css.pair,
                  'data-diff-pair': pairKind(pair),
                  onPointerenter: (event) => {
                    extendAdd(event.buttons, pair.left?.no ?? null, pair.right?.no ?? null)
                  },
                },
                [cell(pair.left, segment.old, 'L'), cell(pair.right, segment.new, 'R')],
              ),
            )
            notes(`notes-${at}-${index}`, pair)
          }
        } else {
          for (const [index, row] of segment.rows.entries()) {
            const labeled = !renderSelecting && endsAt(row.old, row.new)
            renderRows.push(
              h(
                'div',
                {
                  key: `${at}-${index}`,
                  class: clsx(
                    css.line,
                    css[row.kind],
                    (marked('L', row.old) || marked('R', row.new)) && reviewCss.selected,
                  ),
                  'data-diff-line': row.kind,
                  onPointerenter: (event) => {
                    extendAdd(event.buttons, row.old, row.new)
                  },
                },
                [
                  renderSingleSide !== 'R' && number('L', row.old, row.kind === 'del' && !labeled),
                  renderSingleSide !== 'L' && number('R', row.new, row.kind !== 'del' && !labeled),
                  h(
                    'span',
                    {
                      class: css.sign,
                    },
                    [SIGN[row.kind]],
                  ),
                  h(Code, {
                    text: row.text,
                    old: row.old,
                    next: row.new,
                    spans:
                      row.kind === 'del' ? segment.old?.get(row.old) : segment.new?.get(row.new),
                  }),
                ],
              ),
            )
            renderRows.push(...commentsAt('L', row.old), ...commentsAt('R', row.new))
          }
        }
      }
      if (props.review !== undefined) {
        for (const item of renderUnplacedEditors) renderRows.push(editorOf(item, props.review))
        for (const thread of renderRemaining) {
          renderRows.push(
            h(ReviewThread, {
              key: `record-${thread.key}`,
              thread: thread,
              actions: props.review,
              locked: props.comments.locked,
              outdated: true,
              t: props.t,
            }),
          )
        }
      }
      for (const item of renderUnplaced) renderRows.push(threadCard(item))
      for (const item of renderUnplacedNotes) renderRows.push(annotationOf(item))
      return h(
        'div',
        {
          ref: root,
          class: css.code,
          style: {
            '--forge-number-width': `calc(${Math.max(2, String(maximum).length)}ch + 12px)`,
          },
          'data-single-side': renderSingleSide ?? undefined,
          'data-split': renderColumns ? '' : undefined,
          'data-wrap': props.wrap ? '' : undefined,
          'data-review': props.review === undefined ? undefined : '',
          'data-native-side': renderNativeSide ?? undefined,
          onPointerdownCapture: (event: PointerEvent) => {
            if (
              event.button !== 0 ||
              !(event.target instanceof Node) ||
              !(event.currentTarget instanceof HTMLElement)
            )
              return
            const side = codeSideAt(event.currentTarget, event.target)
            if (side === undefined) return
            if (!event.shiftKey || renderNativeSide !== side)
              window.getSelection()?.removeAllRanges()
            dragging.value = 'text';
            (() => {
              nativeSide.value = side
              if (root.value !== null) root.value.dataset.nativeSide = side
              select(null)
              selecting.value = true
            })()
          },
        },
        [renderRows],
      )
    }
  },
  {
    name: 'Lines',
    props: [
      'file',
      'text',
      'open',
      'handlers',
      'split',
      'wrap',
      'review',
      'visible',
      'threads',
      'folded',
      't',
      'comments',
      'annotations',
    ] as const,
  },
)
/** Whether a file's body draws its hunks line by line rather than a note or a collapsed strip. */
function drawsLines(file: ForgeDiffFile, large: boolean, revealed: boolean): boolean {
  return !file.binary && !file.oversized && file.hunks.length > 0 && (!large || revealed)
}
const Content = defineComponent(
  (
    props: DiffFileProps & {
      readonly notes: FileAnnotations
    },
  ) => {
    const bound0 = computed(() => props)
    const file = computed(() => bound0.value.file)
    const large = computed(() => bound0.value.large)
    const revealed = computed(() => bound0.value.revealed)
    const handlers = computed(() => bound0.value.handlers)
    const review = computed(() => bound0.value.review)
    const threads = computed(() => bound0.value.threads)
    const notes = computed(() => bound0.value.notes)
    const t = computed(() => bound0.value.t)
    const comments = useFileReview(
      () => review.value,
      () => file.value.path,
    )
    const records = computed(() => {
      const current = review.value
      return current === undefined
        ? null
        : comments.value.threads.map(thread =>
          h(ReviewThread, {
            key: thread.key,
            thread,
            actions: current,
            locked: comments.value.locked,
            outdated: !reviewMatches(thread.selection, current.source, file.value),
            t: t.value,
          }),
        )
    })
    const lineThreads = computed(() => {
      const current = threads.value
      return h(Fragment, null, [
        current?.lines.map(item =>
          h(ThreadCard, {
            key: item.thread.id,
            thread: item.thread,
            place: item.place,
            actions: current.actions,
            t: t.value,
          }),
        ),
        notes.value.lines.map(item =>
          h(Annotation, {
            key: `${item.source}-${item.annotation.key}`,
            path: file.value.path,
            item,
            handlers: handlers.value,
          }),
        ),
      ])
    })
    return () => {
      const capture16 = file.value
      const capture17 = large.value
      const capture18 = revealed.value
      const capture19 = handlers.value
      const capture20 = notes.value
      const capture21 = t.value
      const capture22 = records.value
      const capture23 = lineThreads.value
      const renderFile = capture16
      const renderLarge = capture17
      const renderRevealed = capture18
      const renderHandlers = capture19
      const renderNotes = capture20
      const renderT = capture21
      const renderComments = comments.value
      const renderRecords = capture22
      const renderLineThreads = capture23
      if (renderFile.binary)
        return h(Fragment, null, [
          h(
            'p',
            {
              class: css.fileNote,
            },
            [renderT('diff.binary')],
          ),
          renderRecords,
          renderLineThreads,
        ])
      if (renderFile.oversized)
        return h(Fragment, null, [
          h(
            'p',
            {
              class: css.fileNote,
            },
            [renderT('diff.fileTooLarge')],
          ),
          renderRecords,
          renderLineThreads,
        ])
      if (renderFile.hunks.length === 0)
        return h(Fragment, null, [renderRecords, renderLineThreads])
      if (renderLarge && !renderRevealed) {
        return h(Fragment, null, [
          h(
            'button',
            {
              type: 'button',
              class: css.gap,
              onClick: () => {
                renderHandlers.reveal(renderFile.path)
              },
            },
            [
              h(IconChevronsUpDownOutlineRegular, {
                size: 12,
              }),
              renderT('diff.largeCollapsed', {
                count: (renderFile.additions + renderFile.deletions).toLocaleString('en-US'),
              }),
            ],
          ),
          renderRecords,
          renderLineThreads,
        ])
      }
      return h(Lines, {
        ...props,
        comments: renderComments,
        annotations: renderNotes.lines,
      })
    }
  },
  {
    name: 'Content',
    props: [
      'visible',
      'review',
      'file',
      'expanded',
      'large',
      'revealed',
      'text',
      'open',
      'split',
      'wrap',
      'badge',
      'tooltip',
      'viewed',
      'viewedNote',
      'viewedDisabled',
      'threads',
      'drawNow',
      'annotations',
      'annotationLimit',
      'folded',
      'handlers',
      't',
      'notes',
    ] as const,
  },
)
const Body = defineComponent(
  (props: DiffFileProps) => {
    const bound0 = computed(() => props)
    const file = computed(() => bound0.value.file)
    const threads = computed(() => bound0.value.threads)
    const handlers = computed(() => bound0.value.handlers)
    const t = computed(() => bound0.value.t)
    const notes = computed(() =>
      groupAnnotations(file.value, props.annotations, props.annotationLimit),
    )
    const frame = (item: SourcedAnnotation): VNodeChild =>
      h(Annotation, {
        key: `${item.source}-${item.annotation.key}`,
        path: file.value.path,
        item: item,
        handlers: handlers.value,
      })
    return () => {
      const capture24 = threads.value
      const capture25 = t.value
      const capture26 = notes.value
      const renderThreads = capture24
      const renderT = capture25
      const renderNotes = capture26
      return h(Fragment, null, [
        renderThreads?.file.map(thread =>
          h(ThreadCard, {
            key: thread.id,
            thread: thread,
            place: { kind: 'file' },
            actions: renderThreads.actions,
            t: renderT,
          }),
        ),
        renderNotes.file.map(frame),
        h(Content, {
          ...props,
          notes: renderNotes,
        }),
        renderThreads !== undefined &&
          h(OutdatedThreads, {
            threads: renderThreads.outdated,
            actions: renderThreads.actions,
            t: renderT,
          }),
        renderNotes.outdated.length > 0 &&
          h(
            'div',
            {
              class: css.outdatedAnnotations,
              'data-forge-outdated-annotations': '',
            },
            [
              h(
                'div',
                {
                  class: css.outdatedAnnotationsTitle,
                },
                [renderT('annotation.outdated', { count: String(renderNotes.outdated.length) })],
              ),
              renderNotes.outdated.map(frame),
            ],
          ),
        renderNotes.hidden > 0 &&
          h(
            'p',
            {
              class: css.fileNote,
              'data-forge-hidden-annotations': '',
            },
            [renderT('annotation.hidden', { count: String(renderNotes.hidden) })],
          ),
      ])
    }
  },
  {
    name: 'Body',
    props: [
      'visible',
      'review',
      'file',
      'expanded',
      'large',
      'revealed',
      'text',
      'open',
      'split',
      'wrap',
      'badge',
      'tooltip',
      'viewed',
      'viewedNote',
      'viewedDisabled',
      'threads',
      'drawNow',
      'annotations',
      'annotationLimit',
      'folded',
      'handlers',
      't',
    ] as const,
  },
)
const FileMenu = defineComponent(
  (props: {
    readonly name: string
    readonly file: ForgeDiffFile
    readonly handlers: DiffFileHandlers
    readonly t: Translate
  }) => {
    const menuOpen = shallowRef(false)
    return () => {
      const capture27 = menuOpen.value
      const renderMenuOpen = capture27
      return h(
        Menu,
        {
          open: renderMenuOpen,
          portal: true,
          align: 'end',
          dense: true,
          autoFocus: true,
          onClose: () => {
            menuOpen.value = false
          },
        },
        {
          anchor: () =>
            h(
              'button',
              {
                type: 'button',
                class: css.tool,
                'aria-haspopup': 'menu',
                'aria-expanded': renderMenuOpen,
                'aria-label': props.t('diff.moreActions', { name: props.name }),
                onClick: () => {
                  menuOpen.value = (value => !value)(renderMenuOpen)
                },
              },
              [h(IconEllipsisOutlineRegular, {})],
            ),
          default: () => [
            props.handlers.actions(props.file).map(action =>
              h(
                MenuItemButton,
                {
                  key: action.label,
                  onSelect: () => {
                    menuOpen.value = false
                    action.run()
                  },
                },
                { default: () => [props.t(action.label)] },
              ),
            ),
            renderMenuOpen &&
              h(
                'div',
                {
                  class: css.menuPlugins,
                },
                [
                  props.handlers.fileMenu(props.file, () => {
                    menuOpen.value = false
                  }),
                ],
              ),
          ],
        },
      )
    }
  },
  { name: 'FileMenu', props: ['name', 'file', 'handlers', 't'] as const },
)
const DiffFileSection = defineComponent(
  (props: DiffFileProps) => {
    const bound0 = computed(() => props)
    const file = computed(() => bound0.value.file)
    const expanded = computed(() => bound0.value.expanded)
    const large = computed(() => bound0.value.large)
    const revealed = computed(() => bound0.value.revealed)
    const badge = computed(() => bound0.value.badge)
    const tooltip = computed(() => bound0.value.tooltip)
    const viewed = computed(() => bound0.value.viewed)
    const viewedNote = computed(() => bound0.value.viewedNote)
    const viewedDisabled = computed(() => bound0.value.viewedDisabled)
    const threads = computed(() => bound0.value.threads)
    const handlers = computed(() => bound0.value.handlers)
    const t = computed(() => bound0.value.t)
    const name = computed(() => file.value.path.slice(file.value.path.lastIndexOf('/') + 1))
    const element = shallowRef<HTMLElement | null>(null)
    const reached = shallowRef(false)
    const waiting = computed(
      () =>
        expanded.value &&
        !reached.value &&
        props.drawNow !== true &&
        drawsLines(file.value, large.value, revealed.value),
    )
    onMounted(() => {
      watch(
        () => [waiting.value, handlers.value.reach],
        (_next, _previous, onCleanup) => {
          const capture28 = waiting.value
          const capture29 = handlers.value
          const generation0 = capture28
          const generation1 = capture29.reach
          if (!generation0 || element.value === null) return
          onCleanup(
            generation1.observe(element.value, () => {
              reached.value = true
            }),
          )
        },
        { immediate: true, flush: 'post' },
      )
    })
    const sectionRef = (incoming: Element | import('vue').ComponentPublicInstance | null) => {
      const node = incoming instanceof HTMLElement ? incoming : null
      const capture30 = handlers.value
      const capture31 = file.value
      element.value = node
      capture30.section(capture31.path, node)
    }
    const placeholder = computed(() => ({ '--forge-rows': drawnLines(file.value) }))
    return () => {
      const capture32 = file.value
      const capture33 = expanded.value
      const capture34 = badge.value
      const capture35 = tooltip.value
      const capture36 = viewed.value
      const capture37 = viewedNote.value
      const capture38 = viewedDisabled.value
      const capture39 = threads.value
      const capture40 = handlers.value
      const capture41 = t.value
      const capture42 = name.value
      const capture43 = reached.value
      const capture44 = waiting.value
      const capture45 = placeholder.value
      const renderFile = capture32
      const renderExpanded = capture33
      const renderBadge = capture34
      const renderTooltip = capture35
      const renderViewed = capture36
      const renderViewedNote = capture37
      const renderViewedDisabled = capture38
      const renderThreads = capture39
      const renderHandlers = capture40
      const renderT = capture41
      const renderName = capture42
      const renderReached = capture43
      const renderWaiting = capture44
      const renderPlaceholder = capture45
      if (props.drawNow === true && !renderReached) reached.value = true
      return h(
        'section',
        {
          ref: sectionRef,
          class: css.file,
          'data-forge-diff-file': renderFile.path,
          'data-expanded': renderExpanded ? '' : undefined,
          'data-viewed': renderViewed,
        },
        [
          h(
            'div',
            {
              class: css.fileHeader,
            },
            [
              h(
                'button',
                {
                  type: 'button',
                  class: css.fileToggle,
                  'aria-expanded': renderExpanded,
                  'aria-label': renderT(renderExpanded ? 'change.collapse' : 'change.expand', {
                    name: renderName,
                  }),
                  onClick: () => {
                    renderHandlers.toggle(renderFile)
                  },
                },
                [
                  h(IconChevronDownOutlineRegular, {
                    size: 14,
                    className: css.chevron ?? '',
                  }),
                ],
              ),
              h(
                'span',
                {
                  class: css.fileTitle,
                },
                [
                  h(FileTypeIcon, {
                    path: renderFile.path,
                    size: 16,
                    className: css.fileIcon ?? '',
                  }),
                  h(
                    'span',
                    {
                      class: css.filePath,
                    },
                    [
                      h(FileLabel, {
                        path: renderFile.path,
                        tooltip: renderTooltip,
                      }),
                    ],
                  ),
                  renderViewed === 'changed' &&
                    h(
                      Tag,
                      {
                        tone: 'warning',
                        className: css.changedTag ?? '',
                      },
                      {
                        default: () => [
                          h(
                            'span',
                            {
                              class: css.changedText,
                            },
                            [renderT('viewed.changed')],
                          ),
                        ],
                      },
                    ),
                  renderThreads !== undefined &&
                    renderThreads.unresolved > 0 &&
                    h(
                      Tooltip,
                      {
                        label: renderT('thread.next'),
                        side: 'bottom',
                      },
                      {
                        default: () => [
                          h(
                            'button',
                            {
                              type: 'button',
                              class: css.threadCount,
                              'aria-label': renderT('thread.unresolvedAria', {
                                name: renderName,
                                count: renderThreads.unresolved,
                              }),
                              onClick: () => {
                                renderHandlers.nextThread(renderFile.path)
                              },
                            },
                            [
                              h(
                                'span',
                                {
                                  class: css.threadCountText,
                                },
                                [
                                  renderT('thread.unresolvedCount', {
                                    count: renderThreads.unresolved,
                                  }),
                                ],
                              ),
                              h(
                                'span',
                                {
                                  class: css.threadCountNumber,
                                },
                                [renderThreads.unresolved],
                              ),
                            ],
                          ),
                        ],
                      },
                    ),
                  h('span', {
                    class: css.fileSpacer,
                    'data-forge-path-spacer': '',
                  }),
                  renderBadge !== '' &&
                    h(
                      'span',
                      {
                        class: css.badge,
                      },
                      [renderBadge],
                    ),
                ],
              ),
              !renderFile.binary &&
                h(Counts, {
                  file: renderFile,
                  t: renderT,
                }),
              h(
                'label',
                {
                  class: css.viewed,
                  title: renderViewedNote,
                  'data-disabled': renderViewedDisabled ? '' : undefined,
                },
                [
                  h('input', {
                    type: 'checkbox',
                    checked: renderViewed === 'viewed',
                    'aria-label': renderT('viewed.aria', { name: renderName }),
                    disabled: renderViewedDisabled,
                    onInput: (event) => {
                      if (!(event.target instanceof HTMLInputElement)) return
                      renderHandlers.view(renderFile, event.target.checked)
                    },
                  }),
                  h(
                    'span',
                    {
                      class: css.viewedLabel,
                      'aria-hidden': 'true',
                    },
                    [renderT('viewed.label')],
                  ),
                ],
              ),
              props.visible &&
                h(FileMenu, {
                  name: renderName,
                  file: renderFile,
                  handlers: renderHandlers,
                  t: renderT,
                }),
            ],
          ),
          renderExpanded &&
            (renderWaiting
              ? h('div', {
                class: css.unreached,
                style: renderPlaceholder,
                'data-forge-diff-unreached': '',
              })
              : h(Body, {
                ...props,
              })),
        ],
      )
    }
  },
  {
    name: 'DiffFileSection',
    props: [
      'visible',
      'review',
      'file',
      'expanded',
      'large',
      'revealed',
      'text',
      'open',
      'split',
      'wrap',
      'badge',
      'tooltip',
      'viewed',
      'viewedNote',
      'viewedDisabled',
      'threads',
      'drawNow',
      'annotations',
      'annotationLimit',
      'folded',
      'handlers',
      't',
    ] as const,
  },
)
/** One file of a diff, redrawn only when its props change. */
export const DiffFile = DiffFileSection
