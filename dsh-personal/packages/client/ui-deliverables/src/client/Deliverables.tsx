import { defineComponent, h, Fragment, computed, ref, watchEffect } from 'vue'
/** The changed-files card, shown only while the Host serves the turn's summary, and explicitly declared files for a closing turn. */
import type { TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client'
import {
  Button,
  IconChevronDownOutlineRegular,
  IconChevronUpOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  GlobalStandardProps,
  InjectFace,
  PropsLocale,
  PropsRenderSlots,
  PropsRuntime,
  SessionStandardProps,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { PresentedOpenController } from './present-open.ts'
import type { ChangesDiffStore } from './changes-diff.ts'
import type { ChangesSummaryStore } from './changes-summary.ts'
import { ChangedFiles } from './ChangedFiles.tsx'
import {
  changesForClosing,
  presentedForClosing,
  type ChangesTurnData,
  type PresentedPath,
} from './turn-deliverables.ts'
import type { NS } from './locales.ts'
import { changesSummaryUrl, type ChangesReviewCoordinates } from '../changes.ts'
import { presentedFileUrl } from '../presented.ts'
import { PresentedFileCard } from './PresentedFileCard.tsx'
import css from './Deliverables.module.css'
interface DeliverablesMatch {
  changes: ChangesTurnData | null
  presented: readonly PresentedPath[]
}
const COLLAPSED_PRESENTED_COUNT = 4
/** Summary reads, native-open callbacks, and shared gesture status supplied by the plugin. */
export interface DeliverablesInjected {
  hooks: {
    changesDiff: ObservableSnapshot<ReturnType<ChangesDiffStore['state']['getSnapshot']>>
    showCodeDiff: ObservableSnapshot<boolean>
    presentedOpen: ObservableSnapshot<ReturnType<PresentedOpenController['state']['getSnapshot']>>
    presentedHost: ObservableSnapshot<ReturnType<PresentedOpenController['host']['getSnapshot']>>
    changesSummary: ObservableSnapshot<ReturnType<ChangesSummaryStore['state']['getSnapshot']>>
  }
  reloadPresentedHost: PresentedOpenController['loadHost']
  loadChangesDiff: ChangesDiffStore['load']
  loadChangesSummary: ChangesSummaryStore['load']
  openPresented: PresentedOpenController['open']
  openChanged: PresentedOpenController['openChanged']
  /** Open one turn's review in the right Sidebar on the file at an index. */
  openChangesReview: (coordinates: ChangesReviewCoordinates, index: number) => void
}
/**
 * Claim turns with a change announcement or declared files.
 * @param owner - closing turn.
 * @returns matched announcement and deliveries, or null for a turn with neither.
 */
export function selectDeliverables(owner: TurnTailOwnerProps): DeliverablesMatch | null {
  const changes = changesForClosing(owner)
  const presented = presentedForClosing(owner)
  return changes === null && presented.length === 0 ? null : { changes, presented }
}
export const DeliverablesTail = defineComponent(
  (
    props: PropsRuntime<'conversation.chat.turnTail'> &
      PropsLocale<typeof NS> &
      InjectFace<DeliverablesInjected> &
      PropsRenderSlots<'deliverables.file.actions'>,
  ) => {
    const matched = computed(() => selectDeliverables(props))
    return () => {
      return matched.value === null
        ? null
        : h(Deliverables, {
          ...props,
          matched: matched.value,
        })
    }
  },
  {
    name: 'DeliverablesTail',
    props: [
      'turn',
      'seq',
      'openFile',
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
      't',
      'reloadPresentedHost',
      'loadChangesDiff',
      'loadChangesSummary',
      'openPresented',
      'openChanged',
      'openChangesReview',
      'useChangesDiff',
      'useShowCodeDiff',
      'usePresentedOpen',
      'usePresentedHost',
      'useChangesSummary',
      'renderSlot',
      '__renders',
      'SessionProvider',
    ] as const,
  },
)
export const Deliverables = defineComponent(
  (
    props: Pick<TurnTailOwnerProps, 'openFile'> & {
      matched: DeliverablesMatch
    } & PropsLocale<typeof NS> &
      Pick<SessionStandardProps, 'sessionId'> &
      Pick<GlobalStandardProps, 'useSessions' | 'useContextMenu'> &
      InjectFace<DeliverablesInjected> &
      PropsRenderSlots<'deliverables.file.actions'>,
  ) => {
    const bound0 = computed(() => props.useContextMenu())
    const getTriggerProps = computed(() => bound0.value.getTriggerProps)
    const expanded = ref(false)
    const showCodeDiff = props.useShowCodeDiff(value => value)
    const cwd = props.useSessions(state => state.byId[props.sessionId]?.cwd)
    const states = props.usePresentedOpen(value => value)
    const host = props.usePresentedHost(value => value)
    const announced = computed(() => (showCodeDiff.value ? props.matched.changes : null))
    const summary = props.useChangesSummary(value =>
      announced.value === null
        ? undefined
        : value[changesSummaryUrl(props.sessionId, announced.value.seq)],
    )
    watchEffect(() => {
      if (announced.value !== null && summary.value === undefined)
        void props.loadChangesSummary(props.sessionId, announced.value.seq)
    })
    const changes = computed(() =>
      announced.value !== null &&
      typeof summary.value === 'object' &&
      summary.value.files.length > 0
        ? { seq: announced.value.seq, ...summary.value }
        : null,
    )
    const collapsible = computed(() => props.matched.presented.length > COLLAPSED_PRESENTED_COUNT)
    const presented = computed(() =>
      collapsible.value && !expanded.value
        ? props.matched.presented.slice(0, COLLAPSED_PRESENTED_COUNT)
        : props.matched.presented,
    )
    watchEffect(() => {
      if (host.value === null) void props.reloadPresentedHost()
    })
    return () => {
      const currentChanges = changes.value
      return h(Fragment, null, [
        currentChanges !== null &&
          h(ChangedFiles, {
            changes: currentChanges,
            cwd: cwd.value,
            t: props.t,
            sessionId: props.sessionId,
            useChangesDiff: props.useChangesDiff,
            loadChangesDiff: props.loadChangesDiff,
            openReview: (index) => {
              props.openChangesReview(
                { sessionId: props.sessionId, seq: currentChanges.seq, turn: currentChanges.turn },
                index,
              )
            },
          }),
        props.matched.presented.length > 0 &&
          h(
            'div',
            {
              class: css.root,
              'data-after-changes': currentChanges !== null || undefined,
            },
            [
              host.value === 'error' &&
                h(
                  'div',
                  {
                    class: css.hostStatus,
                  },
                  [
                    h('span', {}, [props.t('presented.hostError')]),
                    h(
                      Button,
                      {
                        size: 'sm',
                        onClick: () => {
                          void props.reloadPresentedHost()
                        },
                      },
                      { default: () => [props.t('presented.retry')] },
                    ),
                  ],
                ),
              host.value !== null &&
                host.value !== 'error' &&
                !host.value.available &&
                h(
                  'span',
                  {
                    class: css.hostStatus,
                  },
                  [props.t('presented.unavailable')],
                ),
              h(
                'div',
                {
                  class: css.presented,
                  'data-presented-files-row': true,
                  'data-single': props.matched.presented.length === 1 ? true : undefined,
                },
                [
                  presented.value.map(file =>
                    h(PresentedFileCard, {
                      key: `${file.seq}:${file.index}`,
                      file: file,
                      cwd: cwd.value,
                      phase: states.value[presentedFileUrl(props.sessionId, file.seq, file.index)],
                      host: host.value === 'error' ? null : host.value,
                      t: props.t,
                      onPreview: () => {
                        props.openFile(file.path)
                      },
                      contextMenuProps: getTriggerProps.value({
                        kind: 'file',
                        value: { sessionId: props.sessionId, path: file.path },
                      }),
                      actions: props.renderSlot('deliverables.file.actions', {
                        actionUrl: presentedFileUrl(props.sessionId, file.seq, file.index),
                        available:
                          host.value !== null && host.value !== 'error' && host.value.available,
                        pending:
                          states.value[presentedFileUrl(props.sessionId, file.seq, file.index)] ===
                            'opening' ||
                          states.value[presentedFileUrl(props.sessionId, file.seq, file.index)] ===
                            'revealing',
                        onAction: (action, application) =>
                          props.openPresented(
                            props.sessionId,
                            file.seq,
                            file.index,
                            action,
                            application,
                          ),
                      }),
                    }),
                  ),
                ],
              ),
              collapsible.value &&
                h(
                  'button',
                  {
                    type: 'button',
                    class: css.toggle,
                    'aria-expanded': expanded.value,
                    'aria-label': props.t(
                      expanded.value ? 'presented.collapseAria' : 'presented.expandAria',
                      { count: props.matched.presented.length },
                    ),
                    onClick: () => {
                      expanded.value = (value => !value)(expanded.value)
                    },
                  },
                  [
                    h('span', {}, [
                      props.t(expanded.value ? 'presented.collapse' : 'presented.all', {
                        count: props.matched.presented.length,
                      }),
                    ]),
                    expanded.value
                      ? h(IconChevronUpOutlineRegular, {})
                      : h(IconChevronDownOutlineRegular, {}),
                  ],
                ),
            ],
          ),
      ])
    }
  },
  {
    name: 'Deliverables',
    props: [
      'openFile',
      'matched',
      't',
      'sessionId',
      'useSessions',
      'useContextMenu',
      'reloadPresentedHost',
      'loadChangesDiff',
      'loadChangesSummary',
      'openPresented',
      'openChanged',
      'openChangesReview',
      'useChangesDiff',
      'useShowCodeDiff',
      'usePresentedOpen',
      'usePresentedHost',
      'useChangesSummary',
      'renderSlot',
      '__renders',
      'SessionProvider',
    ] as const,
  },
)
