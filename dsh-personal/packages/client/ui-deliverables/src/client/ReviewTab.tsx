import { defineComponent, h, Fragment, computed, ref, watchEffect } from 'vue'
/**
 * The review tab: one turn's changed files behind a file selector, with the
 * selected file's turn-start and turn-end comparison drawn unified or side by
 * side, wrapped or scrolling, and controls to open the file itself.
 */
import {
  IconChevronDownOutlineRegular,
  IconCompareSplitOutlineRegular,
  IconInspectOutlineRegular,
  IconNowrapFillRegular,
  IconWrapFillRegular,
  Menu,
  PathLabel,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace,
  PropsLocale,
  PropsRenderSlots,
  PropsRuntime,
  PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import { fileAddressFor } from '@deepseek-ai/dsh-util-workspace-path'
import type { WorkspaceChangedFile } from '@deepseek-ai/dsh-workspace-changes/types'
import {
  changedFileUrl,
  changesDiffUrl,
  changesSummaryUrl,
  parseChangesReviewAddress,
} from '../changes.ts'
import type { ChangesDiffStore } from './changes-diff.ts'
import type { ChangesSummaryStore } from './changes-summary.ts'
import type { PresentedOpenController } from './present-open.ts'
import type { ChangesReviewParams } from './review-definition.ts'
import type { createReviewStore } from './review-store.ts'
import type { NS } from './locales.ts'
import { FileDiff } from './FileDiff.tsx'
import diffCss from './FileDiff.module.css'
import css from './ReviewTab.module.css'
const GROUPED = new Intl.NumberFormat('en-US')
/** Summary and comparison reads, desktop metadata, and the native open supplied by the plugin. */
export interface ReviewInjected {
  hooks: {
    changesSummary: ObservableSnapshot<ReturnType<ChangesSummaryStore['state']['getSnapshot']>>
    changesDiff: ObservableSnapshot<ReturnType<ChangesDiffStore['state']['getSnapshot']>>
    presentedOpen: ObservableSnapshot<ReturnType<PresentedOpenController['state']['getSnapshot']>>
    presentedHost: ObservableSnapshot<ReturnType<PresentedOpenController['host']['getSnapshot']>>
  }
  loadChangesSummary: ChangesSummaryStore['load']
  loadChangesDiff: ChangesDiffStore['load']
  reloadPresentedHost: PresentedOpenController['loadHost']
  openChanged: PresentedOpenController['openChanged']
}
/** The body's composed props: the tab it draws, its store, its injected face, and its copy. */
export type ReviewTabProps = PropsRuntime<'sidebar.right.pane.tab'> &
  PropsStore<ReturnType<typeof createReviewStore>> &
  InjectFace<ReviewInjected> &
  PropsLocale<typeof NS> &
  PropsRenderSlots<'deliverables.review.file.actions'>
/** The file index a navigation names, when it names one. */
function navigatedIndex(params: unknown): number | undefined {
  const index = (params as ChangesReviewParams | undefined)?.index
  return typeof index === 'number' && Number.isSafeInteger(index) && index >= 0 ? index : undefined
}
const Counts = defineComponent(
  (
    props: {
      file: WorkspaceChangedFile
    } & PropsLocale<typeof NS>,
  ) => {
    return () => {
      if (props.file.binary === true)
        return h(
          'span',
          {
            class: css.label,
          },
          [props.t('changes.binary')],
        )
      if (props.file.oversized === true)
        return h(
          'span',
          {
            class: css.label,
          },
          [props.t('changes.oversized')],
        )
      return h(Fragment, null, [
        h(
          'span',
          {
            class: css.added,
          },
          [props.t('changes.added', { count: GROUPED.format(props.file.added) })],
        ),
        h(
          'span',
          {
            class: css.deleted,
          },
          [props.t('changes.deleted', { count: GROUPED.format(props.file.deleted) })],
        ),
      ])
    }
  },
  { name: 'Counts', props: ['file', 't'] as const },
)
export const ReviewTab = defineComponent(
  (props: ReviewTabProps) => {
    const bound0 = props.useTabInfo()
    const tab = computed(() => bound0.value.tab)
    const bound2 = computed(() => tab.value)
    const navigation = computed(() => bound2.value.navigation)
    const signal = computed(() => bound2.value.signal)
    const coordinates = computed(() => parseChangesReviewAddress(tab.value.contentId))
    const bound6 = computed(() => coordinates.value)
    const seq = computed(() => {
      if (bound6.value === undefined)
        throw new Error(`ui-deliverables: not a review address "${tab.value.contentId}"`)
      return bound6.value.seq
    })
    const cwd = props.useSessions(sessions => sessions.byId[props.sessionId]?.cwd)
    const summary = props.useChangesSummary(
      value => value[changesSummaryUrl(props.sessionId, seq.value)],
    )
    const state = props.useStore(store => store.byTab[tab.value.id])
    const host = props.usePresentedHost(value => value)
    watchEffect(() => {
      if (state.value?.navigated === navigation.value.revision) return
      props.actions.navigated(
        tab.value.id,
        navigation.value.revision,
        navigatedIndex(navigation.value.params) ?? state.value?.index ?? 0,
      )
    })
    watchEffect((onCleanup) => {
      const currentSignal = signal.value
      const tabId = tab.value.id
      const forget = (): void => {
        props.actions.forget(tabId)
      }
      currentSignal.addEventListener('abort', forget, { once: true })
      onCleanup(() => {
        currentSignal.removeEventListener('abort', forget)
      })
    })
    watchEffect(() => {
      if (summary.value === undefined) void props.loadChangesSummary(props.sessionId, seq.value)
    })
    watchEffect(() => {
      if (host.value === null) void props.reloadPresentedHost()
    })
    const files = computed(() => (typeof summary.value === 'object' ? summary.value.files : []))
    const index = computed(() =>
      state.value !== undefined && files.value[state.value.index] !== undefined
        ? state.value.index
        : 0,
    )
    const file = computed(() => files.value[index.value])
    const diffState = props.useChangesDiff(value =>
      file.value === undefined
        ? undefined
        : value[changesDiffUrl(props.sessionId, seq.value, index.value)],
    )
    watchEffect(() => {
      if (file.value !== undefined && diffState.value === undefined)
        void props.loadChangesDiff(props.sessionId, seq.value, index.value)
    })
    const phase = props.usePresentedOpen(value =>
      file.value === undefined
        ? undefined
        : value[changedFileUrl(props.sessionId, seq.value, index.value)],
    )
    const menuOpen = ref(false)
    const split = computed(() => state.value?.split === true)
    const wrap = computed(() => state.value?.wrap === true)
    const native = computed(
      () =>
        host.value !== null &&
        host.value !== 'error' &&
        host.value.available &&
        phase.value !== 'nativeUnavailable',
    )
    const summaryState = computed(() =>
      summary.value === undefined || summary.value === 'loading'
        ? 'loading'
        : summary.value === 'missing'
          ? 'missing'
          : 'ready',
    )
    return () => {
      const currentFile = file.value
      if (coordinates.value === undefined)
        throw new Error(`ui-deliverables: not a review address "${tab.value.contentId}"`)
      return h(
        'div',
        {
          class: `${diffCss.root} ${css.root}`,
          'data-changes-review': true,
          'data-review-state': summaryState.value,
        },
        [
          h(
            'div',
            {
              class: diffCss.header,
            },
            [
              currentFile === undefined
                ? h(
                  'span',
                  {
                    class: css.selectorLabel,
                  },
                  [props.t('review.title', { turn: String(coordinates.value.turn) })],
                )
                : h(
                  Menu,
                  {
                    className: css.selector ?? '',
                    open: menuOpen.value,
                    autoFocus: true,
                    portal: true,
                    align: 'start',
                    dense: true,
                    onClose: () => {
                      menuOpen.value = false
                    },
                    items: files.value.map((entry, at) => ({
                      id: String(at),
                      label: h(
                        'span',
                        {
                          class: css.item,
                        },
                        [
                          h(
                            'span',
                            {
                              class: css.itemPath,
                            },
                            [entry.display],
                          ),
                          h(
                            'span',
                            {
                              class: css.itemCounts,
                            },
                            [
                              h(Counts, {
                                file: entry,
                                t: props.t,
                              }),
                            ],
                          ),
                        ],
                      ),
                    })),
                    selectedId: String(index.value),
                    onSelect: (id) => {
                      props.actions.selected(tab.value.id, Number(id))
                      menuOpen.value = false
                    },
                  },
                  {
                    anchor: () =>
                      h(
                        'button',
                        {
                          type: 'button',
                          class: css.selectorButton,
                          'aria-haspopup': 'menu',
                          'aria-expanded': menuOpen.value,
                          'aria-label': props.t('review.selectFile'),
                          title: currentFile.display,
                          'data-review-file': currentFile.path,
                          onClick: () => {
                            menuOpen.value = (value => !value)(menuOpen.value)
                          },
                        },
                        [
                          h(PathLabel, {
                            path: currentFile.display,
                          }),
                          h(IconChevronDownOutlineRegular, {
                            size: 12,
                          }),
                        ],
                      ),
                  },
                ),
              currentFile !== undefined &&
                h(
                  'span',
                  {
                    class: css.counts,
                  },
                  [
                    h(Counts, {
                      file: currentFile,
                      t: props.t,
                    }),
                  ],
                ),
              h(
                'span',
                {
                  class: css.tools,
                },
                [
                  h(
                    Tooltip,
                    {
                      label: props.t(split.value ? 'review.unified' : 'review.split'),
                      side: 'bottom',
                      delayMs: 500,
                    },
                    {
                      default: () => [
                        h(
                          'button',
                          {
                            type: 'button',
                            class: css.tool,
                            'aria-pressed': split.value,
                            'aria-label': props.t('review.splitAria'),
                            'data-review-tool': 'split',
                            onClick: () => {
                              props.actions.toggledSplit(tab.value.id)
                            },
                          },
                          [
                            h(IconCompareSplitOutlineRegular, {
                              class: css.compareIcon,
                            }),
                          ],
                        ),
                      ],
                    },
                  ),
                  h(
                    Tooltip,
                    {
                      label: props.t(wrap.value ? 'review.nowrap' : 'review.wrap'),
                      side: 'bottom',
                      delayMs: 500,
                    },
                    {
                      default: () => [
                        h(
                          'button',
                          {
                            type: 'button',
                            class: css.tool,
                            'aria-pressed': wrap.value,
                            'aria-label': props.t('review.wrapAria'),
                            'data-review-tool': 'wrap',
                            onClick: () => {
                              props.actions.toggledWrap(tab.value.id)
                            },
                          },
                          [wrap.value ? h(IconNowrapFillRegular, {}) : h(IconWrapFillRegular, {})],
                        ),
                      ],
                    },
                  ),
                  currentFile !== undefined &&
                    h(
                      Tooltip,
                      {
                        label: props.t('review.openFile'),
                        side: 'bottom',
                        delayMs: 500,
                      },
                      {
                        default: () => [
                          h(
                            'button',
                            {
                              type: 'button',
                              class: css.tool,
                              'aria-label': props.t('review.openFileAria', {
                                name: currentFile.display,
                              }),
                              'data-review-tool': 'open-file',
                              onClick: () => {
                                tab.value.actions.openResource(
                                  fileAddressFor(props.sessionId, cwd.value, currentFile.path),
                                )
                              },
                            },
                            [h(IconInspectOutlineRegular, {})],
                          ),
                        ],
                      },
                    ),
                  currentFile !== undefined &&
                    props.renderSlot('deliverables.review.file.actions', {
                      actionUrl: changedFileUrl(props.sessionId, seq.value, index.value),
                      available: native.value,
                      pending: phase.value === 'opening' || phase.value === 'revealing',
                      onAction: (action, application) =>
                        props.openChanged(
                          props.sessionId,
                          seq.value,
                          index.value,
                          action,
                          application,
                        ),
                    }),
                ],
              ),
            ],
          ),
          summaryState.value === 'loading' &&
            h(
              'p',
              {
                class: diffCss.status,
                role: 'status',
              },
              [props.t('diff.loading')],
            ),
          summaryState.value === 'missing' &&
            h(
              'p',
              {
                class: diffCss.status,
              },
              [props.t('diff.missing')],
            ),
          currentFile !== undefined &&
            h(FileDiff, {
              state: diffState.value,
              split: split.value,
              wrap: wrap.value,
              t: props.t,
              retry: () => {
                void props.loadChangesDiff(props.sessionId, seq.value, index.value)
              },
            }),
        ],
      )
    }
  },
  {
    name: 'ReviewTab',
    props: [
      'useTabInfo',
      'useSession',
      'sessionId',
      'useProjection',
      'useAccess',
      'useConversation',
      'useInput',
      'inputActions',
      'useChat',
      'useRemoteAccess',
      'useSessions',
      'useSessionRetainInfo',
      'useSessionAccess',
      'usePanelInfo',
      'useContextMenu',
      'useWorkspaces',
      'useStore',
      'actions',
      'reloadPresentedHost',
      'loadChangesDiff',
      'loadChangesSummary',
      'openChanged',
      'useChangesDiff',
      'usePresentedOpen',
      'usePresentedHost',
      'useChangesSummary',
      't',
      'renderSlot',
      '__renders',
      'SessionProvider',
    ] as const,
  },
)
