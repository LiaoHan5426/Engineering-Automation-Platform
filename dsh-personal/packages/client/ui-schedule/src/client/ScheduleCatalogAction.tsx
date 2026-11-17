import { h, Teleport, useId, defineComponent, computed, shallowRef, watch } from 'vue'
import {
  IconClockOutlineRegular,
  IconTrashOutlineRegular,
  useDismissOnOutsidePointer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ScheduleId, ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule/client'
import type { CatalogInjected } from './catalog-source.ts'
import { NS } from './locales.ts'
import { taskNextRunAt } from './task-record.ts'
import { selectSessionScheduleFacts } from './session-schedule-state.ts'
import {
  formatScheduleFrequency,
  nextRunParts,
  orderScheduleRecords,
  taskName,
} from './schedule-format.ts'
import css from './ScheduleCatalogAction.module.css'
/** Full props for the Session-header Schedule catalog action. */
export type ScheduleCatalogActionProps = PropsRuntime<'conversation.session.header.utilities'> &
  PropsLocale<typeof NS> &
  InjectFace<
    CatalogInjected<ScheduleCatalogEntry> & {
      /**
       * Show one task's detail in the right Sidebar for this entry's Session.
       * @param id - Task chosen by the Session entry.
       */
      readonly openTaskDetail: (id: ScheduleId) => void
    }
  >
const SECOND_MS = 1000
/**
 * Current-Session reminder catalog with durable deletion, rendered only while
 * the current Peer may list this Session's reminders.
 * @param props - the Session seats, the injected catalog and verbs, and localized copy.
 * @returns the reminder catalog action, or nothing without access.
 */
export const ScheduleCatalogAction = defineComponent(
  (props: ScheduleCatalogActionProps) => {
    const allowed = props.useAccess('schedule/list')
    return () => {
      return allowed.value ? h(SessionScheduleCatalog, { ...props }) : null
    }
  },
  {
    props: [
      'children',
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
      'onDelete',
      'onRetry',
      'openTaskDetail',
      'useCatalog',
      't',
    ],
  },
)
const SessionScheduleCatalog = defineComponent(
  (props: ScheduleCatalogActionProps) => {
    const openState = props.useSession(snapshot => snapshot.openState)
    const catalogState = props.useCatalog(value => value)
    const status = computed(() => catalogState.value.status),
      deleting = computed(() => catalogState.value.deleting)
    const _projection0 = computed(() =>
      selectSessionScheduleFacts(catalogState.value, props.sessionId),
    )
    const records = computed(() => _projection0.value.records)
    const visible = computed(() => openState.value === 'open')
    const open = shallowRef(false)
    const now = shallowRef((() => Date.now())())
    const rootRef = shallowRef<HTMLDivElement | null>(null)
    const triggerRef = shallowRef<HTMLButtonElement | null>(null)
    const catalogRef = shallowRef<HTMLUListElement | null>(null)
    const anchorName = `--dsh-schedule-catalog-${useId().replaceAll(':', '')}`
    useDismissOnOutsidePointer(
      rootRef,
      () => open.value,
      () => {
        open.value = false
      },
      catalogRef,
    )
    watch(
      [() => open.value],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (!open.value) return
          now.value = Date.now()
          const timer = setInterval(() => {
            now.value = Date.now()
          }, SECOND_MS)
          return () => {
            clearInterval(timer)
          }
        })()
        if (typeof cleanup === 'function') onCleanup(cleanup)
      },
      { immediate: true, flush: 'post' },
    )
    watch(
      [() => visible.value, () => open.value],
      (_value, _previous) => {
        (() => {
          if (visible.value || !open.value) return
          open.value = false
        })()

      },
      { immediate: true, flush: 'post' },
    )
    const rows = computed(() => orderScheduleRecords(records.value, now.value))
    const known = computed(() => records.value.length)
    const triggerLabel = computed(() =>
      known.value === 0
        ? props.t('trigger.label')
        : props.t(known.value === 1 ? 'trigger.one' : 'trigger.other', { count: known.value }),
    )
    const soleTask = computed(() =>
      status.value === 'ready' && records.value.length === 1 ? records.value[0] : undefined,
    )
    const expandable = computed(() => soleTask.value === undefined || open.value)
    const toggleCatalog = (): void => {
      now.value = Date.now()
      open.value = (current => !current)(open.value)
    }
    const openTask = (id: ScheduleId): void => {
      open.value = false
      props.openTaskDetail(id)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !open.value) return
      event.preventDefault()
      open.value = false
      triggerRef.value?.focus()
    }
    const renderTrigger = () =>
      h(
        'button',
        {
          ref: triggerRef,
          style: { anchorName: anchorName },
          type: 'button',
          class: css.trigger,
          'data-schedule-reminder-entry': '',
          'aria-expanded': expandable.value ? open.value : undefined,
          'aria-label': triggerLabel.value,
          onClick: () => {
            if (expandable.value) {
              toggleCatalog()
              return
            }
            now.value = Date.now()
            const current = soleTask.value
            if (current !== undefined) openTask(current.id)
          },
        },
        [h(IconClockOutlineRegular, { size: 16 })],
      )
    const renderCatalog = () =>
      open.value
        ? h(Teleport, { to: document.body }, [
          h(
            'ul',
            {
              ref: catalogRef,
              class: css.menu,
              style: { positionAnchor: anchorName },
              'aria-label': props.t('list.aria'),
              onKeydown: onKeyDown,
            },
            [
              status.value === 'loading' &&
                  h('li', { class: css.row, role: 'status' }, [props.t('list.loading')]),
              status.value === 'error' &&
                  h('li', { class: css.row }, [
                    h('span', { role: 'alert' }, [props.t('list.error')]),
                    h(
                      'button',
                      {
                        type: 'button',
                        onClick: () => {
                          void props.onRetry()
                        },
                      },
                      [props.t('list.retry')],
                    ),
                  ]),
              rows.value.map((record) => {
                const nextRunAt = taskNextRunAt(record)
                const overdue = Date.parse(nextRunAt) <= now.value
                // One pair per row: both halves come from this one call.
                const nextRun = nextRunParts(
                  nextRunAt,
                  props.t('time.locale'),
                  now.value,
                  props.t,
                )
                return h(
                  'li',
                  {
                    key: record.id,
                    class: overdue
                      ? `${css.row} ${css.rowTask} ${css.rowOverdue}`
                      : `${css.row} ${css.rowTask}`,
                  },
                  [
                    h('span', { class: css.body }, [
                      h(
                        'button',
                        {
                          type: 'button',
                          class: css.openButton,
                          'aria-label': props.t('list.open', { title: taskName(record) }),
                          onClick: () => {
                            openTask(record.id)
                          },
                        },
                        [h('span', { class: css.title }, [taskName(record)])],
                      ),
                      h(
                        'span',
                        {
                          class: overdue
                            ? `${css.metadata} ${css.metadataOverdue}`
                            : css.metadata,
                        },
                        [h('span', {}, [formatScheduleFrequency(record, props.t)])],
                      ),
                      h(
                        'span',
                        {
                          class: overdue ? `${css.nextRun} ${css.metadataOverdue}` : css.nextRun,
                        },
                        [
                          h('span', {}, [`${props.t('list.nextRun')} `]),
                          h('time', { dateTime: nextRunAt }, [nextRun.absolute]),
                          h('span', { class: css.nextRunRelative }, [nextRun.relative]),
                        ],
                      ),
                    ]),
                    h(
                      'button',
                      {
                        type: 'button',
                        class: css.deleteButton,
                        'aria-label': props.t('delete.label', { title: taskName(record) }),
                        title: props.t(
                          deleting.value.includes(record.id) ? 'delete.pending' : 'delete.action',
                        ),
                        disabled: deleting.value.includes(record.id),
                        onClick: () => {
                          void props.onDelete(record.id)
                        },
                      },
                      [h(IconTrashOutlineRegular, { size: 14 })],
                    ),
                  ],
                )
              }),
            ],
          ),
        ])
        : null
    return () => {
      if (!visible.value) return null
      // Show the entry only once it has something to open, or a failed read to
      // retry. An empty first read must not mount a chip that the authoritative
      // answer then removes, which reads as a flash in the header.
      if (records.value.length === 0 && status.value !== 'error') return null
      return h('div', { ref: rootRef, class: css.root, onKeydown: onKeyDown }, [
        renderTrigger(),
        renderCatalog(),
      ])
    }
  },
  {
    props: [
      'children',
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
      'onDelete',
      'onRetry',
      'openTaskDetail',
      'useCatalog',
      't',
    ],
  },
)
