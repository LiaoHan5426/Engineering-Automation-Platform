import clsx from 'clsx'
import { h, Fragment, useId, defineComponent, computed, shallowRef, watch } from 'vue'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  Button,
  IconChevronDownOutlineRegular,
  IconChevronUpOutlineRegular,
  IconClockOutlineRegular,
  IconInfoOutlineRegular,
  IconWarningOutlineRegular,
  StateDot,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  ScheduleDeliveryHistoryRequest,
  ScheduleDeliveryHistoryResult,
} from '@deepseek-ai/dsh-schedule/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { formatScheduleNextRun } from './schedule-format.ts'
import css from './TaskManagerPage.module.css'
/** Read saved records without opening or activating the original Session. */
export interface DeliveryHistoryInjected {
  /**
   * Read a newest-first page of one task's saved deliveries.
   * @param request - Task, required page size, and optional older-page cursor.
   * @returns Remote success or failure; transport exceptions may reject the promise.
   */
  readonly loadHistory: (
    request: ScheduleDeliveryHistoryRequest,
  ) => Promise<RemoteResult<ScheduleDeliveryHistoryResult>>
}
type Page = Extract<
  ScheduleDeliveryHistoryResult,
  {
    records: unknown
  }
>
type Cursor = ScheduleDeliveryHistoryRequest['before']
type Failure = {
  key: 'delivery.error' | 'delivery.notFound' | 'delivery.cursorError'
  before: Cursor
}
type Props = DeliveryHistoryInjected &
  PropsLocale<'schedule.manager'> & {
    id: ScheduleDeliveryHistoryRequest['id']
    /** Open the Session that accepted one delivery. */
    onOpenSession: (id: SessionId) => void
    /** Display titles of known Sessions, by id. */
    sessionTitles: Readonly<Record<string, string>>
    /** Sessions that a delivery's open button may open. */
    availableSessionIds: readonly string[]
    latestMessageId: Cursor
    /** IANA zone of the task's own wall-clock rule; undefined for a one-shot or interval task. */
    timeZone?: string | undefined
  }
const SavedPrompt = defineComponent(
  (
    props: {
      prompt: string
    } & PropsLocale<'schedule.manager'>,
  ) => {
    const ref = shallowRef<HTMLParagraphElement | null>(null)
    const id = useId()
    const expanded = shallowRef(false)
    const clamped = shallowRef(false)
    watch(
      [() => expanded.value, () => props.prompt, () => ref.value],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          if (expanded.value || ref.value === null) return
          const paragraph = ref.value
          const measure = () => {
            clamped.value = paragraph.scrollHeight > paragraph.clientHeight
          }
          measure()
          const observer = new ResizeObserver(measure)
          observer.observe(paragraph)
          return () => {
            observer.disconnect()
          }
        })()
        if (typeof cleanup === 'function') onCleanup(cleanup)
      },
      { immediate: true, flush: 'post' },
    )
    return () => {
      return h(Fragment, {}, [
        h(
          'p',
          {
            ref: ref,
            id: id,
            class: css.savedPrompt,
            'data-expanded': expanded.value || undefined,
          },
          [props.prompt],
        ),
        clamped.value &&
          h(
            'button',
            {
              type: 'button',
              class: css.savedPromptToggle,
              'aria-expanded': expanded.value,
              'aria-controls': id,
              onClick: () => {
                expanded.value = (open => !open)(expanded.value)
              },
            },
            [
              props.t(expanded.value ? 'delivery.collapse' : 'delivery.expand'),
              expanded.value
                ? h(IconChevronUpOutlineRegular, { size: 14 })
                : h(IconChevronDownOutlineRegular, { size: 14 }),
            ],
          ),
      ])
    }
  },
  { props: ['prompt', 't'] },
)
/**
 * Render immutable saved deliveries; the parent keys this view by task.
 * Refreshes supersede pending older pages, and unmount ignores both late outcomes.
 * @param props - Task, latest receipt identity, Remote callback, Session links, task zone, and locale.
 * @returns Saved records and explicit loading, failure, and pagination actions.
 */
export const DeliveryHistory = defineComponent(
  (props: Props) => {
    const page = shallowRef<Page | undefined>(undefined)
    const loading = shallowRef(true)
    const failure = shallowRef<Failure | undefined>(undefined)
    const retentionOpen = shallowRef(false)
    const retentionId = useId()
    const request = shallowRef({ epoch: 0, pending: false })
    const load = async (before?: Cursor): Promise<void> => {
      if (request.value.pending) return
      request.value.pending = true
      const epoch = ++request.value.epoch
      loading.value = true
      failure.value = undefined
      let result: RemoteResult<ScheduleDeliveryHistoryResult>
      try {
        result = await props.loadHistory({
          id: props.id,
          limit: 20,
          ...(before === undefined ? {} : { before }),
        })
      } catch (_error: unknown) {
        // Transport exceptions use the same localized retry as Remote failures.
        if (epoch !== request.value.epoch) return
        request.value.pending = false
        loading.value = false
        failure.value = { key: 'delivery.error', before }
        return
      }
      if (epoch !== request.value.epoch) return
      request.value.pending = false
      loading.value = false
      if (!result.ok) {
        failure.value = { key: 'delivery.error', before }
      } else if ('code' in result.value) {
        failure.value = {
          key:
            result.value.code === 'schedule_not_found'
              ? 'delivery.notFound'
              : 'delivery.cursorError',
          before: undefined,
        }
      } else {
        const next = result.value
        page.value = ((previous) => {
          if (before === undefined || previous === undefined) return next
          const seen = new Set(previous.records.map(record => record.messageId))
          const records = [...previous.records]
          for (const record of next.records) {
            if (!seen.has(record.messageId)) {
              seen.add(record.messageId)
              records.push(record)
            }
          }
          return { ...next, records }
        })(page.value)
      }
    }
    watch(
      [() => load, () => props.latestMessageId],
      (_value, _previous, onCleanup) => {
        const cleanup: void | (() => void) = (() => {
          void load()
          return () => {
            request.value.epoch++
            request.value.pending = false
          }
        })()
        if (typeof cleanup === 'function') onCleanup(cleanup)
      },
      { immediate: true, flush: 'post' },
    )
    const formatOccurrence = (value: string): string =>
      formatScheduleNextRun(value, props.t('time.locale'), props.timeZone)
    const hasRecords = computed(() => page.value !== undefined && page.value.records.length > 0)
    return () => {
      const currentPage = page.value
      const currentFailure = failure.value
      return h('div', { class: css.deliveryHistory, 'aria-busy': loading.value }, [
        h('div', { class: css.detailScroll }, [
          loading.value &&
            !hasRecords.value &&
            h(
              'div',
              { class: css.empty, role: 'status', 'aria-label': props.t('delivery.loading') },
              [h(StateDot, { state: 'ongoing' })],
            ),
          currentFailure !== undefined &&
            (hasRecords.value
              ? h('div', { class: css.notice }, [
                h('p', { role: 'alert' }, [props.t(currentFailure.key)]),
                h(
                  Button,
                  {
                    variant: 'outline',
                    size: 'sm',
                    onClick: () => {
                      const current = failure.value
                      if (current === undefined) return
                      void load(current.before)
                    },
                  },
                  {
                    default: () => [
                      props.t(
                        currentFailure.key === 'delivery.cursorError'
                          ? 'delivery.refresh'
                          : 'delivery.retry',
                      ),
                    ],
                  },
                ),
              ])
              : h('div', { class: css.empty }, [
                h(IconWarningOutlineRegular, { size: 24, className: clsx(css.emptyGlyph) }),
                h('p', { role: 'alert', class: css.emptyTitle }, [props.t(currentFailure.key)]),
                h(
                  Button,
                  {
                    variant: 'outline',
                    className: clsx(css.emptyAction),
                    onClick: () => {
                      const current = failure.value
                      if (current === undefined) return
                      void load(current.before)
                    },
                  },
                  {
                    default: () => [
                      props.t(
                        currentFailure.key === 'delivery.cursorError'
                          ? 'delivery.refresh'
                          : 'delivery.retry',
                      ),
                    ],
                  },
                ),
              ])),
          !loading.value &&
            failure.value === undefined &&
            page.value?.records.length === 0 &&
            h('div', { class: css.empty, role: 'status' }, [
              h(IconClockOutlineRegular, { size: 24, className: clsx(css.emptyGlyph) }),
              h('h3', {}, [props.t('delivery.empty')]),
            ]),
          page.value?.records.map(record =>
            h(
              'section',
              {
                key: record.messageId,
                class: css.delivery,
                'aria-label': props.t('delivery.label'),
              },
              [
                h(IconClockOutlineRegular, { className: clsx(css.deliveryGlyph) }),
                h('div', { class: css.deliveryBody }, [
                  h('div', { class: css.deliveryHead }, [
                    h('time', { class: css.deliveryTime, dateTime: record.scheduledAt }, [
                      formatOccurrence(record.scheduledAt),
                    ]),
                    h(
                      Button,
                      {
                        size: 'sm',
                        disabled: !props.availableSessionIds.includes(record.targetSessionId),
                        onClick: () => {
                          props.onOpenSession(record.targetSessionId)
                        },
                      },
                      {
                        default: () => [
                          props.sessionTitles[record.targetSessionId] ??
                            props.t('host.openDeliverySession'),
                        ],
                      },
                    ),
                  ]),
                  record.prompt !== undefined &&
                    h(SavedPrompt, { prompt: record.prompt, t: props.t }),
                ]),
              ],
            ),
          ),
          page.value?.nextBefore !== undefined &&
            failure.value === undefined &&
            h(
              Button,
              {
                variant: 'outline',
                disabled: loading.value,
                onClick: () => {
                  const cursor = page.value?.nextBefore
                  if (cursor === undefined) return
                  void load(cursor)
                },
              },
              { default: () => [props.t('delivery.loadMore')] },
            ),
        ]),
        hasRecords.value &&
          currentPage !== undefined &&
          currentPage.earlierRecordsPruned &&
          currentPage.nextBefore === undefined &&
          !loading.value &&
          failure.value === undefined &&
          h('footer', { class: css.retentionEnd }, [
            h('div', { class: css.retentionLine }, [
              h('span', {}, [props.t('delivery.pruned')]),
              h(
                Tooltip,
                { label: props.t('delivery.retention'), side: 'top', portal: true },
                {
                  default: () => [
                    h(
                      'button',
                      {
                        type: 'button',
                        class: css.retentionInfo,
                        'aria-label': props.t('delivery.retention'),
                        'aria-expanded': retentionOpen.value,
                        'aria-controls': retentionId,
                        onClick: () => {
                          retentionOpen.value = (open => !open)(retentionOpen.value)
                        },
                      },
                      [h(IconInfoOutlineRegular, { size: 14 })],
                    ),
                  ],
                },
              ),
            ]),
            retentionOpen.value &&
              h('div', { id: retentionId, class: css.retentionRule }, [
                h('p', {}, [
                  props.t('delivery.retentionBounds', {
                    days: currentPage.retention.days,
                    records: currentPage.retention.records,
                  }),
                ]),
                h('p', {}, [props.t('delivery.retentionExplanation')]),
              ]),
          ]),
      ])
    }
  },
  {
    props: [
      'loadHistory',
      'id',
      'onOpenSession',
      'sessionTitles',
      'availableSessionIds',
      'latestMessageId',
      'timeZone',
      't',
    ],
  },
)
