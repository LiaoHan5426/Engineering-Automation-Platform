import { defineComponent, h, Fragment, computed, shallowRef, watch, onMounted } from 'vue'
/**
 * The thread list of a change request beside its changes: every thread grouped by file in file tree order, narrowed
 * by whether it is resolved, each opening the place it shows at. A wide changes view docks the list beside the files;
 * a narrower one floats it over them, and the narrowest gives it their whole width.
 */
import {
  IconChevronLeftOutlineRegular,
  IconCloseOutlineRegular,
  IconRightUpOutlineRegular,
  Tag,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ForgeReviewThread } from '@deepseek-ai/dsh-experimental-forge/types'
import type { ForgeDiffFile } from '../types.ts'
import { FileLabel } from './FileLabel.tsx'
import { SegmentedChoice } from './ReviewControls.tsx'
import { Avatar } from './ReviewThreads.tsx'
import {
  anchorRange,
  inFileOrder,
  passesFilter,
  THREAD_FILTERS,
  type ThreadFilter,
  type ThreadPlace,
} from './review-threads.ts'
import type { NS } from './locales.ts'
import type { PlacedThread } from './thread-state.ts'
import css from './ThreadList.module.css'
type Translate = PropsLocale<typeof NS>['t']
/** Props of the thread list. */
export interface ThreadListProps extends PropsLocale<typeof NS> {
  /** Every thread read, in host order, with where the current changes show it. */
  readonly entries: readonly PlacedThread[]
  /** Changed files in file tree order; threads on other paths follow them. */
  readonly files: readonly ForgeDiffFile[]
  /** Whether the host has more threads than were read. */
  readonly truncated: boolean
  /** Web page of the change request. */
  readonly url: string
  /** The active filter. */
  readonly filter: ThreadFilter
  /** Choose a filter. */
  readonly choose: (filter: ThreadFilter) => void
  /** Whether the reader just opened the list, so a list that covers the files takes the focus. */
  readonly claim: boolean
  /** Report that the list handled `claim`. */
  readonly claimed: () => void
  /** Open the place of a thread; `covering` says the list covers the files, so the owner closes it first. */
  readonly open: (entry: PlacedThread, covering: boolean) => void
  /** Open a URL outside the app. */
  readonly openLink: (url: string) => void
  /** Close the list at the reader's request. */
  readonly close: () => void
}
function meta(thread: ForgeReviewThread, place: ThreadPlace, t: Translate): string {
  const replies = thread.comments.length - 1
  const parts: string[] = []
  if (thread.subject === 'file') parts.push(t('thread.fileLevel'))
  else if (place.kind === 'line') parts.push(anchorRange(place.side, place))
  else if (thread.original !== null) {
    parts.push(
      t('thread.originally', { range: anchorRange(thread.side, thread.original) }),
      t('thread.onCommit', { commit: thread.original.commit.slice(0, 7) }),
    )
  }
  if (replies > 0) parts.push(t('thread.replies', { count: replies }))
  return parts.join(' · ')
}
/** Whether the list floats over the files or takes their width, which its narrow-view styles decide. */
function covers(pane: HTMLElement | null): pane is HTMLElement {
  return pane !== null && getComputedStyle(pane).position === 'absolute'
}
/**
 * The first comment as one line of plain text: without raw HTML, strong, strikethrough, and code marks, quote or
 * heading marks, and link targets.
 */
function plainExcerpt(body: string): string {
  return body
    .replace(/<[^>]*>/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:#{1,6}|>)\s*/gm, '')
    .replace(/\*\*|__|~~|`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
const Item = defineComponent(
  (props: {
    readonly entry: PlacedThread
    readonly open: (entry: PlacedThread) => void
    readonly t: Translate
  }) => {
    const bound0 = computed(() => props.entry)
    const thread = computed(() => bound0.value.thread)
    const place = computed(() => bound0.value.place)
    const first = computed(() => thread.value.comments[0])
    return () => {
      const capture0 = thread.value
      const capture1 = place.value
      const capture2 = first.value
      const renderThread = capture0
      const renderPlace = capture1
      const renderFirst = capture2
      return h(
        'button',
        {
          type: 'button',
          class: css.item,
          'data-forge-thread-item': renderThread.id,
          onClick: () => {
            props.open(props.entry)
          },
        },
        [
          h(Avatar, {
            author: renderFirst?.author ?? null,
            size: 22,
          }),
          h(
            'span',
            {
              class: css.itemMain,
            },
            [
              h(
                'span',
                {
                  class: css.meta,
                },
                [meta(renderThread, renderPlace, props.t)],
              ),
              h(
                'span',
                {
                  class: css.excerpt,
                },
                [plainExcerpt(renderFirst?.body ?? '')],
              ),
              h(
                'span',
                {
                  class: css.tags,
                },
                [
                  renderPlace.kind === 'outdated' &&
                    h(
                      Tag,
                      {
                        tone: 'warning',
                      },
                      { default: () => [props.t('thread.outdatedTag')] },
                    ),
                  renderPlace.kind === 'elsewhere' &&
                    h(
                      Tag,
                      {
                        tone: 'neutral',
                      },
                      { default: () => [props.t('thread.elsewhereTag')] },
                    ),
                  renderThread.resolved &&
                    h(
                      Tag,
                      {
                        tone: 'success',
                      },
                      { default: () => [props.t('thread.filter.resolved')] },
                    ),
                  renderFirst?.author?.bot === true &&
                    h(
                      Tag,
                      {
                        tone: 'outline',
                      },
                      { default: () => [props.t('thread.bot')] },
                    ),
                ],
              ),
            ],
          ),
        ],
      )
    }
  },
  { name: 'Item', props: ['entry', 'open', 't'] as const },
)
export const ThreadList = defineComponent(
  (props: ThreadListProps) => {
    const bound0 = computed(() => props)
    const entries = computed(() => bound0.value.entries)
    const files = computed(() => bound0.value.files)
    const filter = computed(() => bound0.value.filter)
    const t = computed(() => bound0.value.t)
    const threads = computed(() => entries.value.map(entry => entry.thread))
    const counts = computed(
      () =>
        Object.fromEntries(
          THREAD_FILTERS.map(item => [
            item,
            threads.value.filter(thread => passesFilter(thread, item)).length,
          ]),
        ) as Record<ThreadFilter, number>,
    )
    const groups = computed(() => {
      const capture3 = files.value
      const capture4 = entries.value
      const capture5 = filter.value
      const known = new Map(capture3.map((file, index) => [file.path, { file, index }]))
      const byPath = new Map<string, PlacedThread[]>()
      for (const entry of capture4) {
        if (!passesFilter(entry.thread, capture5)) continue
        const list = byPath.get(entry.thread.path)
        if (list === undefined) byPath.set(entry.thread.path, [entry])
        else list.push(entry)
      }
      const position = (path: string): number => known.get(path)?.index ?? capture3.length
      return [...byPath]
        .sort(([a], [b]) => position(a) - position(b) || a.localeCompare(b))
        .map(([path, list]) => [path, inFileOrder(list, known.get(path)?.file)] as const)
    })
    const pane = shallowRef<HTMLElement | null>(null)
    onMounted(() => {
      watch(
        () => [props.claim],
        (_next, _previous, _onCleanup) => {
          const generation0 = props.claim
          if (!generation0) return
          props.claimed()
          if (covers(pane.value)) pane.value.focus({ preventScroll: true })
        },
        { immediate: true, flush: 'post' },
      )
    })
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      props.close()
    }
    const open = (entry: PlacedThread): void => {
      props.open(entry, covers(pane.value))
    }
    return () => {
      const capture6 = filter.value
      const capture7 = t.value
      const capture8 = threads.value
      const capture9 = counts.value
      const capture10 = groups.value
      const renderFilter = capture6
      const renderT = capture7
      const renderThreads = capture8
      const renderCounts = capture9
      const renderGroups = capture10
      return h(Fragment, null, [
        h('div', {
          class: css.scrim,
          'aria-hidden': 'true',
          onClick: props.close,
        }),
        h(
          'aside',
          {
            ref: pane,
            class: css.pane,
            tabindex: -1,
            'aria-label': renderT('thread.listAria', { count: renderThreads.length }),
            'data-forge-thread-list': '',
            onKeydown: escape,
          },
          [
            h(
              'div',
              {
                class: css.header,
              },
              [
                h(
                  'button',
                  {
                    type: 'button',
                    class: css.back,
                    onClick: props.close,
                  },
                  [
                    h(IconChevronLeftOutlineRegular, {
                      size: 14,
                    }),
                    renderT('thread.back'),
                  ],
                ),
                h(
                  'span',
                  {
                    class: css.title,
                  },
                  [renderT('thread.list')],
                ),
                h(
                  'span',
                  {
                    class: css.total,
                  },
                  [renderThreads.length],
                ),
                h('span', {
                  class: css.spacer,
                }),
                h(
                  Tooltip,
                  {
                    label: renderT('thread.close'), delayMs: 500,
                    side: 'bottom',
                  },
                  {
                    default: () => [
                      h(
                        'button',
                        {
                          type: 'button',
                          class: css.close,
                          'aria-label': renderT('thread.close'),
                          onClick: props.close,
                        },
                        [
                          h(IconCloseOutlineRegular, {
                            size: 14,
                          }),
                        ],
                      ),
                    ],
                  },
                ),
              ],
            ),
            h(
              'div',
              {
                class: css.filters,
              },
              [
                h(SegmentedChoice<ThreadFilter>, {
                  label: renderT('thread.filterAria'),
                  value: renderFilter,
                  choose: props.choose,
                  segments: THREAD_FILTERS.map(item => ({
                    value: item,
                    label: renderT(`thread.filter.${item}`),
                    count: renderCounts[item],
                    disabledTip: null,
                  })),
                }),
              ],
            ),
            h(
              'div',
              {
                class: css.rows,
              },
              [
                renderThreads.length === 0
                  ? h(
                    'div',
                    {
                      class: css.note,
                    },
                    [renderT('thread.empty')],
                  )
                  : renderGroups.length === 0
                    ? h(
                      'div',
                      {
                        class: css.note,
                      },
                      [renderT('thread.none')],
                    )
                    : renderGroups.map(([path, list]) =>
                      h(
                        'section',
                        {
                          key: path,
                          class: css.group,
                          'data-forge-thread-group': path,
                        },
                        [
                          h(
                            'h3',
                            {
                              class: css.path,
                            },
                            [
                              h(FileLabel, {
                                path: path,
                              }),
                            ],
                          ),
                          list.map(entry =>
                            h(Item, {
                              key: entry.thread.id,
                              entry: entry,
                              open: open,
                              t: renderT,
                            }),
                          ),
                        ],
                      ),
                    ),
              ],
            ),
            h(
              'div',
              {
                class: css.footer,
              },
              [
                props.truncated &&
                  h(Fragment, null, [
                    renderT('thread.truncated', { count: renderThreads.length }),
                    ' \u00B7 ',
                  ]),
                h(
                  'button',
                  {
                    type: 'button',
                    class: css.link,
                    onClick: () => {
                      props.openLink(props.url)
                    },
                  },
                  [
                    h(IconRightUpOutlineRegular, {
                      size: 14,
                    }),
                    renderT('thread.openAll'),
                  ],
                ),
              ],
            ),
          ],
        ),
      ])
    }
  },
  {
    name: 'ThreadList',
    props: [
      'entries',
      'files',
      'truncated',
      'url',
      'filter',
      'choose',
      'claim',
      'claimed',
      'open',
      'openLink',
      'close',
      't',
    ] as const,
  },
)
