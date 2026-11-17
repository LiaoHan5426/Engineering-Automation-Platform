import { defineComponent, computed, shallowRef, watch, h, Fragment, onMounted } from 'vue'
import clsx from 'clsx'
import {
  Button,
  IconEllipsisOutlineRegular,
  Menu,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  SessionListState,
  SessionSummary,
} from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {
  ConversationSessionHeaderSlotProps,
  ConversationSessionSlotProps,
  ConversationViewActionsOwnerProps,
} from '../contract/slots.ts'
import { resolveActiveView } from '../view-selection.ts'
import { FIXED_VIEW_ID } from '../view-pins.ts'
import { DefaultConversationViews } from './DefaultConversationViews.tsx'
import css from './ConversationRoot.module.css'
/** Full props composed from the strict session body contract. */
export type ConversationSessionProps = ConversationSessionSlotProps
/** Full props composed from the strict session header contract. */
export type ConversationSessionHeaderProps = ConversationSessionHeaderSlotProps
type ViewsMoreMenuProps = Omit<ConversationViewActionsOwnerProps, 'onDismiss'> &
  Pick<ConversationSessionHeaderSlotProps, 'renderSlot'> & {
    readonly label: string
    readonly current: boolean
  }
const ViewsMoreMenu = defineComponent(
  (props: ViewsMoreMenuProps) => {
    const label = computed(() => props.label)
    const current = computed(() => props.current)
    const entries = computed(() => props.entries)
    const onOpen = computed(() => props.onOpen)
    const onPinnedChange = computed(() => props.onPinnedChange)
    const renderSlot = computed(() => props.renderSlot)
    const open = shallowRef(false)
    const setOpen = (
      next: typeof open.value | ((previous: typeof open.value) => typeof open.value),
    ) => {
      open.value = typeof next === 'function' ? next(open.value) : next
    }
    const onDismiss = (): void => {
      setOpen(false)
    }
    return () =>
      h(
        Menu,
        {
          open: open.value,
          onClose: onDismiss,
          portal: true,
          autoFocus: true,
          className: css.viewsMoreAnchor ?? '',
          listClassName: css.viewsMoreMenu ?? '',
        },
        {
          default: () => [
            renderSlot.value('conversation.session.header.views.actions', {
              entries: entries.value,
              onOpen: onOpen.value,
              onPinnedChange: onPinnedChange.value,
              onDismiss,
            }),
          ],
          anchor: () =>
            h(
              Tooltip,
              {
                label: label.value,
                portal: true,
              },
              {
                default: () => [
                  h(
                    Button,
                    {
                      size: 'sm',
                      className: clsx(css.viewsMore, current.value && css.viewsMoreActive),
                      'aria-label': label.value,
                      'aria-haspopup': 'menu',
                      'aria-expanded': open.value,
                      onClick: () => {
                        setOpen(value => !value)
                      },
                    },
                    {
                      default: () => [
                        h(IconEllipsisOutlineRegular, {
                          size: 13,
                        }),
                      ],
                    },
                  ),
                ],
              },
            ),
        },
      )
  },
  {
    props: ['label', 'current', 'entries', 'onOpen', 'onPinnedChange', 'renderSlot'],
    inheritAttrs: false,
  },
)
/** Approximate 13px text advance: full-width glyphs take one em, other glyphs about half. */
const WIDE_GLYPH =
  /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/u
const WIDE_GLYPH_WIDTH = 13
const NARROW_GLYPH_WIDTH = 7
/** Mirrors the `.tabLabel` max-width in `ConversationRoot.module.css`. */
const TAB_LABEL_MAX_WIDTH = 88
/** Estimate whether a View tab label exceeds its 88px cell. */
function labelNeedsTooltip(label: string): boolean {
  let width = 0
  for (const glyph of label)
    width += WIDE_GLYPH.test(glyph) ? WIDE_GLYPH_WIDTH : NARROW_GLYPH_WIDTH
  return width > TAB_LABEL_MAX_WIDTH
}
/** One View tab label; its full-name tooltip is offered only when the text is expected to overflow. */
function ViewTabLabel({ label }: { readonly label: string }) {
  return h(
    Tooltip,
    {
      label: label,
      portal: true,
      disabled: !labelNeedsTooltip(label),
    },
    {
      default: () => [
        h(
          'span',
          {
            class: css.tabLabel,
          },
          [label],
        ),
      ],
    },
  )
}
interface Breadcrumb {
  readonly id: SessionId
  readonly displayTitle: string
  readonly subagent: boolean
}
function deriveAncestry(list: SessionListState, id: SessionId): readonly Breadcrumb[] {
  const chain: Breadcrumb[] = []
  const seen = new Set<SessionId>()
  let cursor: SessionId | undefined = id
  while (cursor !== undefined) {
    if (seen.has(cursor)) break
    seen.add(cursor)
    const summary: SessionSummary | undefined = list.byId[cursor]
    if (summary === undefined) break
    chain.unshift({
      id: summary.id,
      displayTitle: summary.displayTitle,
      subagent: summary.origin === 'subagent',
    })
    if (summary.origin !== 'subagent') break
    cursor = summary.parentId
  }
  return chain
}
function equalBreadcrumbs(left: readonly Breadcrumb[], right: readonly Breadcrumb[]): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => {
      const other = right.at(index)
      return (
        other !== undefined && item.id === other.id && item.displayTitle === other.displayTitle
      )
    })
  )
}
/**
 * Renders Session header chrome above the resident conversation scrollport.
 * @param props - Strict Session store, view ledger, navigation, render, and locale shares.
 * @returns Session navigation controls, with title and tabs after conversation starts.
 */
export const ConversationSessionHeader = defineComponent(
  (props: ConversationSessionHeaderProps) => {
    const sessionId = computed(() => props.sessionId)
    const hideChrome = computed(() => props.hideChrome)
    const useSessions = computed(() => props.useSessions)
    const useConversationViews = computed(() => props.useConversationViews)
    const useStore = computed(() => props.useStore)
    const renderSlot = computed(() => props.renderSlot)
    const renderFactorySlot = computed(() => props.renderFactorySlot)
    const open = computed(() => props.open)
    const useContextMenu = computed(() => props.useContextMenu)
    const selectView = computed(() => props.selectView)
    const setPinned = computed(() => props.setPinned)
    const t = computed(() => props.t)
    const useEntryPins = computed(() => props.useEntryPins)
    const useEntryActions = computed(() => props.useEntryActions)
    const { getTriggerProps } = useContextMenu.value()
    const tabs = useConversationViews.value(value => value)
    const selectedId = useStore.value(s => s.view)
    const active = computed(() => resolveActiveView(tabs.value, selectedId.value))
    const ancestry = useSessions.value(s => deriveAncestry(s, sessionId.value), equalBreadcrumbs)
    const unpinned = useEntryPins.value(ids => ids)
    const hasEntryActions = useEntryActions.value(registered => registered)
    const showTabs = computed(() => !hideChrome.value && tabs.value.length > 1)
    const tabRow = shallowRef<HTMLDivElement | null>(null)
    const visibleViewLimit = shallowRef(1)
    const setVisibleViewLimit = (
      next:
        | typeof visibleViewLimit.value
        | ((previous: typeof visibleViewLimit.value) => typeof visibleViewLimit.value),
    ) => {
      visibleViewLimit.value = typeof next === 'function' ? next(visibleViewLimit.value) : next
    }
    const derived1 = computed(() => {
      const preferred = [
        ...tabs.value.filter(tab => tab.id === FIXED_VIEW_ID),
        ...tabs.value.filter(tab => tab.id !== FIXED_VIEW_ID && !unpinned.value.includes(tab.id)),
      ]
      const visibleTabs = hasEntryActions.value
        ? preferred.slice(0, visibleViewLimit.value)
        : preferred
      const visibleIds = new Set(visibleTabs.map(tab => tab.id))
      return { visibleTabs, moreTabs: tabs.value.filter(tab => !visibleIds.has(tab.id)) }
    })
    const visibleTabs = computed(() => derived1.value.visibleTabs)
    const moreTabs = computed(() => derived1.value.moreTabs)
    const currentInMore = computed(() => moreTabs.value.some(tab => tab.id === active.value?.id))
    onMounted(() =>
      watch(
        [() => showTabs.value, () => hasEntryActions.value],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            const row = tabRow.value
            if (row === null || !hasEntryActions.value) return
            const updateLimit = (): void => {
              setVisibleViewLimit(Math.max(1, Math.floor((row.clientWidth - 48) / 120)))
            }
            updateLimit()
            if (typeof ResizeObserver === 'undefined') return
            const observer = new ResizeObserver(updateLimit)
            observer.observe(row)
            return () => {
              observer.disconnect()
            }
          })()
          if (typeof cleanup === 'function') onCleanup(cleanup)
        },
        { immediate: true, flush: 'post' },
      ),
    )
    return () =>
      h(Fragment, null, [
        h(
          'div',
          {
            class: css.titleRow,
          },
          [
            !hideChrome.value &&
              h(Fragment, null, [
                h(
                  'div',
                  {
                    class: css.titleCluster,
                  },
                  [
                    h(
                      'nav',
                      {
                        class: css.crumbs,
                        'aria-label': t.value('session.hierarchy'),
                      },
                      [
                        ancestry.value.map((summary, index) => {
                          const last = index === ancestry.value.length - 1
                          // The current crumb has no navigation, so it is plain text
                          // rather than a disabled button: on darwin desktop a button
                          // would subtract itself from the header's drag row (ui-web
                          // base.css) and leave the title inert for dragging too.
                          const title = last
                            ? h(
                              'span',
                              {
                                class: clsx(css.crumb, css.crumbCurrent),
                              },
                              [summary.displayTitle],
                            )
                            : h(
                              'button',
                              {
                                type: 'button',
                                class: css.crumb,
                                onClick: () => {
                                  open.value(summary.id)
                                },
                              },
                              [summary.displayTitle],
                            )
                          const lineage = last || summary.subagent
                          const lineageOwner = {
                            lineageSessionId: summary.id,
                            displayTitle: summary.displayTitle,
                            ...(last
                              ? {}
                              : {
                                openTitle: () => {
                                  open.value(summary.id)
                                },
                              }),
                          }
                          return h(
                            'span',
                            {
                              key: summary.id,
                              class: css.crumbSeg,
                              ...getTriggerProps({
                                kind: 'session',
                                value: {
                                  sessionId: summary.id,
                                  displayTitle: summary.displayTitle,
                                },
                              }),
                            },
                            [
                              index > 0 &&
                                h(
                                  'span',
                                  {
                                    class: css.crumbSep,
                                  },
                                  ['/'],
                                ),
                              lineage
                                ? summary.subagent
                                  ? renderSlot.value(
                                    'conversation.session.header.lineage',
                                    lineageOwner,
                                    { fallback: title },
                                  )
                                  : h(Fragment, null, [
                                    title,
                                    renderSlot.value(
                                      'conversation.session.header.lineage',
                                      lineageOwner,
                                      { fallback: null },
                                    ),
                                  ])
                                : title,
                            ],
                          )
                        }),
                        ancestry.value.length === 0 &&
                          h(
                            'span',
                            {
                              class: css.crumbCurrent,
                            },
                            [sessionId.value],
                          ),
                      ],
                    ),
                    h(
                      'div',
                      {
                        class: css.headerActions,
                      },
                      [renderSlot.value('conversation.session.header.actions', {})],
                    ),
                  ],
                ),
                h(
                  'div',
                  {
                    class: css.headerUtilities,
                  },
                  [
                    renderSlot.value('conversation.session.header.utilities', {}),
                    renderFactorySlot.value('contextMenu.button', {
                      target: { kind: 'sessionHeader', value: { sessionId: sessionId.value } },
                      label: t.value('header.more'),
                      className: css.headerMenuButton,
                      size: 'sm',
                    }),
                  ],
                ),
              ]),
            h(
              'div',
              {
                class: css.headerCorner,
                'data-conversation-header-corner': '',
              },
              [renderSlot.value('conversation.session.header.corner', {})],
            ),
          ],
        ),
        showTabs.value &&
          h(
            'div',
            {
              ref: tabRow,
              class: css.tabs,
            },
            [
              h(
                'div',
                {
                  class: css.viewTabs,
                  role: 'tablist',
                  'data-conversation-tabs': '',
                },
                [
                  visibleTabs.value.map(viewTab =>
                    h(
                      'button',
                      {
                        key: viewTab.id,
                        type: 'button',
                        role: 'tab',
                        'aria-selected': viewTab.id === active.value?.id,
                        class: clsx(css.tab, viewTab.id === active.value?.id && css.tabActive),
                        onClick: () => {
                          selectView.value(viewTab.id)
                        },
                      },
                      [
                        h(ViewTabLabel, {
                          label: viewTab.label,
                        }),
                      ],
                    ),
                  ),
                ],
              ),
              hasEntryActions.value &&
                h(ViewsMoreMenu, {
                  label: t.value('session.moreViews'),
                  current: currentInMore.value,
                  entries: moreTabs.value.map(viewTab => ({
                    id: viewTab.id,
                    label: viewTab.label,
                    pinned: !unpinned.value.includes(viewTab.id),
                    active: viewTab.id === active.value?.id,
                  })),
                  onOpen: selectView.value,
                  onPinnedChange: setPinned.value,
                  renderSlot: renderSlot.value,
                }),
            ],
          ),
      ])
  },
  {
    props: [
      'sessionId',
      'hideChrome',
      'useSessions',
      'useConversationViews',
      'useStore',
      'renderSlot',
      'renderFactorySlot',
      'open',
      'useContextMenu',
      'selectView',
      'setPinned',
      't',
      'useEntryPins',
      'useEntryActions',
    ],
    inheritAttrs: false,
  },
)
/**
 * Renders the active Session view inside the resident scrollport and keeps
 * the input draft mirrored while blank Hero chrome is visible.
 * @param props - Strict Session input/store, view ledger, and render shares.
 * @returns the active view area, or null while the Session remains blank.
 */
export function ConversationSession(props: ConversationSessionProps) {
  return h(DefaultConversationViews, {
    ...props,
  })
}
