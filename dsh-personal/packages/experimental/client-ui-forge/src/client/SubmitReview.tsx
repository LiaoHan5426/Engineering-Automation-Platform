import { defineComponent, h, Fragment, computed, shallowRef, useId } from 'vue'
import { useObservableSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
/** Centered review submission with a summary, decision, and pending-comment count, and the discarding of a pending review. */
import clsx from 'clsx'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ForgePendingReview, ForgeReviewEvent } from '@deepseek-ai/dsh-experimental-forge/types'
import type { ReviewQueue } from './review-queue.ts'
import type { NS } from './locales.ts'
import css from './SubmitReview.module.css'
import reviewCss from './ReviewComposer.module.css'
export const SubmitReview = defineComponent(
  (
    props: PropsLocale<typeof NS> & {
      readonly queue: ReviewQueue
      readonly url: string
      readonly headSha: string
      readonly pending: ForgePendingReview | null
      readonly events: readonly ForgeReviewEvent[] | null
      readonly busy: boolean
      readonly error: string | null
      readonly submit: () => void
      readonly discard: (() => void) | undefined
      readonly close: () => void
      readonly check: () => void
      readonly reconcile: () => void
    },
  ) => {
    const selected = useObservableSelector(
      () => props.queue,
      () => value => value,
    )
    const state = computed(() => selected.value ?? props.queue.getSnapshot())
    const confirming = shallowRef(false)
    const name = useId()
    const summaryHint = computed(() => `${name}-summary-hint`)
    const requiresSummary = computed(() => state.value.event === 'request-changes')
    const locked = computed(() => props.busy || state.value.uncertain !== null)
    const allowed = (event: ForgeReviewEvent): boolean => props.events === null || props.events.includes(event)
    const refused = computed(() => !allowed(state.value.event))
    const commentOnly = computed(() => props.events !== null && props.events.length === 1 && props.events[0] === 'comment')
    const count = computed(() => props.pending?.comments ?? state.value.comments.length)
    const blocked = computed(() => props.pending !== null && state.value.comments.length > 0)
    const stale = computed(
      () =>
        props.pending === null &&
        state.value.comments.some(
          item =>
            item.source.kind !== 'change' ||
            item.source.url !== props.url ||
            item.source.headSha !== props.headSha,
        ),
    )
    const empty = computed(
      () =>
        (props.pending === null &&
          state.value.comments.some(item => item.comment.body.trim() === '')) ||
        (requiresSummary.value && state.value.body.trim() === '') ||
        (state.value.event === 'comment' && state.value.body.trim() === '' && count.value === 0),
    )
    const notice = computed(() =>
      state.value.error !== null
        ? props.t(state.value.error === 'load' ? 'review.loadFailed' : 'review.saveFailed')
        : blocked.value
          ? props.t('review.browserDrafts', { count: state.value.comments.length })
          : stale.value
            ? props.t('review.stale')
            : props.error,
    )
    return () => {
      const capture0 = state.value
      const capture1 = confirming.value
      const capture2 = summaryHint.value
      const capture3 = requiresSummary.value
      const capture4 = locked.value
      const capture5 = refused.value
      const capture6 = count.value
      const capture7 = blocked.value
      const capture8 = stale.value
      const capture9 = empty.value
      const capture10 = notice.value
      const renderState = capture0
      const renderConfirming = capture1
      const renderSummaryHint = capture2
      const renderRequiresSummary = capture3
      const renderLocked = capture4
      const renderRefused = capture5
      const renderCount = capture6
      const renderBlocked = capture7
      const renderStale = capture8
      const renderEmpty = capture9
      const renderNotice = capture10
      return h(
        Modal,
        {
          open: true,
          onClose: props.close,
          title: props.t('review.submit'),
          closeLabel: props.t('review.close'),
          className: clsx(css.modal),
          contentClassName: clsx(css.content),
        },
        {
          default: () => [
            h(
              'div',
              {
                class: css.form,
              },
              [
                h(
                  'div',
                  {
                    class: css.count,
                  },
                  [props.t('review.drafts', { count: renderCount })],
                ),
                props.discard !== undefined &&
                  renderConfirming &&
                  h(
                    'div',
                    {
                      class: css.confirm,
                      role: 'group',
                      'aria-label': props.t('review.discard'),
                    },
                    [
                      h(
                        'span',
                        {
                          class: css.confirmText,
                        },
                        [props.t('review.discardConfirm', { count: renderCount })],
                      ),
                      h(
                        Button,
                        {
                          size: 'sm',
                          variant: 'outline',
                          disabled: props.busy,
                          onClick: () => {
                            confirming.value = false
                          },
                        },
                        { default: () => [props.t('review.cancel')] },
                      ),
                      h(
                        Button,
                        {
                          size: 'sm',
                          variant: 'primary',
                          disabled: props.busy,
                          onClick: props.discard,
                        },
                        {
                          default: () => [
                            props.t(props.busy ? 'review.discarding' : 'review.discard'),
                          ],
                        },
                      ),
                    ],
                  ),
                h(
                  'div',
                  {
                    class: css.summary,
                  },
                  [
                    h('textarea', {
                      'data-modal-autofocus': true,
                      class: clsx(reviewCss.input, css.input),
                      rows: 4,
                      disabled: renderLocked,
                      value: renderState.body,
                      'aria-label': props.t('review.summary'),
                      placeholder: props.t('review.summary'),
                      required: renderRequiresSummary,
                      'aria-describedby': renderRequiresSummary ? renderSummaryHint : undefined,
                      onInput: (event) => {
                        if (
                          !(
                            event.target instanceof HTMLInputElement ||
                            event.target instanceof HTMLTextAreaElement
                          )
                        )
                          return
                        props.queue.summarize(event.target.value, renderState.event)
                      },
                    }),
                    h(
                      'div',
                      {
                        id: renderSummaryHint,
                        class: css.hint,
                        role: 'status',
                      },
                      [renderRequiresSummary ? props.t('review.summaryRequired') : ''],
                    ),
                  ],
                ),
                h(
                  'div',
                  {
                    class: css.decisions,
                  },
                  [
                    (['comment', 'approve', 'request-changes'] as const).map(value =>
                      h(
                        'label',
                        {
                          key: value,
                        },
                        [
                          h('input', {
                            type: 'radio',
                            name: name,
                            value: value,
                            checked: renderState.event === value,
                            disabled: renderLocked || !allowed(value),
                            onInput: () => {
                              props.queue.summarize(renderState.body, value)
                            },
                          }),
                          props.t(
                            value === 'comment'
                              ? 'review.commentOnly'
                              : value === 'approve'
                                ? 'review.approve'
                                : 'review.requestChanges',
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
                commentOnly.value &&
                  h(
                    'div',
                    {
                      class: css.hint,
                    },
                    [props.t('review.decisionsLimited')],
                  ),
                renderNotice !== null &&
                  h(
                    'div',
                    {
                      class: css.error,
                      role: 'alert',
                    },
                    [renderNotice],
                  ),
                renderState.uncertain !== null &&
                  !props.busy &&
                  h(
                    'div',
                    {
                      class: css.reconcile,
                    },
                    [
                      h(
                        Button,
                        {
                          size: 'sm',
                          variant: 'outline',
                          onClick: props.check,
                        },
                        { default: () => [props.t('review.recheck')] },
                      ),
                      h(
                        Button,
                        {
                          size: 'sm',
                          variant: 'outline',
                          onClick: props.reconcile,
                        },
                        { default: () => [props.t('review.confirmRetry')] },
                      ),
                    ],
                  ),
              ],
            ),
          ],
          footer: () =>
            h(Fragment, null, [
              props.discard !== undefined &&
                h(
                  Button,
                  {
                    variant: 'outline',
                    className: clsx(css.discard),
                    disabled: renderLocked || renderConfirming,
                    onClick: () => {
                      confirming.value = true
                    },
                  },
                  { default: () => [props.t('review.discard')] },
                ),
              h(
                Button,
                {
                  variant: 'outline',
                  onClick: props.close,
                },
                { default: () => [props.t('review.cancel')] },
              ),
              h(
                Button,
                {
                  variant: 'primary',
                  disabled:
                    renderLocked ||
                    renderConfirming ||
                    renderBlocked ||
                    renderStale ||
                    renderEmpty ||
                    renderRefused ||
                    renderState.error !== null,
                  onClick: props.submit,
                },
                {
                  default: () => [
                    props.t(
                      props.busy && !renderConfirming ? 'review.submitting' : 'review.submit',
                    ),
                  ],
                },
              ),
            ]),
        },
      )
    }
  },
  {
    name: 'SubmitReview',
    props: [
      't',
      'queue',
      'url',
      'headSha',
      'pending',
      'events',
      'busy',
      'error',
      'submit',
      'discard',
      'close',
      'check',
      'reconcile',
    ] as const,
  },
)
