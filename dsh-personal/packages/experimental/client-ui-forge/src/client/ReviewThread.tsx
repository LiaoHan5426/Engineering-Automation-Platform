import { defineComponent, h, Fragment, computed, shallowRef } from 'vue'
/** Inline comment records and the editing of comment drafts kept in the browser at their captured code location. */
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ReviewActions } from './ReviewComposer.tsx'
import {
  EMPTY_FILE_REVIEW,
  type FileReviewState,
  type ReviewThread as Thread,
} from './review-queue.ts'
import { reviewRange } from './review.ts'
import type { NS } from './locales.ts'
import css from './ReviewComposer.module.css'
import { useObservableSelector } from '@deepseek-ai/dsh-client-ui-renderer/client'
/**
 * Subscribe only to comments that belong to the displayed file and source.
 * @param actions - review actions and their browser store.
 * @param path - displayed file path.
 * @returns stable file-scoped comments and write availability.
 */
export function useFileReview(actions: () => ReviewActions | undefined, path: () => string) {
  const selected = useObservableSelector(
    () => actions()?.records,
    () => () => {
      const current = actions()
      return current?.records?.fileComments(path(), current.source) ?? EMPTY_FILE_REVIEW
    },
  )
  return computed((): FileReviewState => selected.value ?? EMPTY_FILE_REVIEW)
}
export const ReviewThread = defineComponent(
  (
    props: PropsLocale<typeof NS> & {
      readonly thread: Thread
      readonly actions: ReviewActions
      readonly locked: boolean
      readonly outdated: boolean
    },
  ) => {
    const editing = shallowRef(false)
    const body = shallowRef(props.thread.selection.comment.body)
    const error = shallowRef<string | null>(null)
    const moving = shallowRef(false)
    const comment = computed(() => props.thread.selection.comment)
    const quoted = computed(() =>
      editing.value && props.thread.kind === 'pending'
        ? { ...props.thread.selection, comment: { ...comment.value, body: body.value } }
        : props.thread.selection,
    )
    const range = computed(() => reviewRange(comment.value))
    const status = computed(() =>
      props.thread.kind === 'pending'
        ? 'review.browserDraft'
        : props.thread.kind === 'published'
          ? 'review.published'
          : 'review.quoted',
    )
    const save = (): boolean =>
      props.actions.records?.editThread(props.thread.key, body.value) === true
    const queue = computed(() => props.actions.queue)
    const move = async (add: NonNullable<ReviewActions['queue']>): Promise<void> => {
      moving.value = true
      error.value = null
      try {
        const failure = await add(props.thread.selection)
        if (failure !== undefined) error.value = failure
        else if (props.actions.records?.editThread(props.thread.key, null) !== true)
          error.value = props.t('review.saveFailed')
      } catch (_error) {
        error.value = props.t('review.unknown')
      } finally {
        moving.value = false
      }
    }
    return () => {
      const capture0 = editing.value
      const capture1 = body.value
      const capture2 = error.value
      const capture3 = moving.value
      const capture4 = comment.value
      const capture5 = quoted.value
      const capture6 = range.value
      const capture7 = status.value
      const capture8 = queue.value
      const renderEditing = capture0
      const renderBody = capture1
      const renderError = capture2
      const renderMoving = capture3
      const renderComment = capture4
      const renderQuoted = capture5
      const renderRange = capture6
      const renderStatus = capture7
      const renderQueue = capture8
      return h(
        'section',
        {
          class: css.thread,
          'data-forge-review-thread': props.thread.kind,
          'data-side': renderComment.side,
          'aria-label': props.t('review.range', { range: renderRange }),
        },
        [
          h(
            'div',
            {
              class: css.threadHeader,
            },
            [
              h(
                'span',
                {
                  class: css.author,
                },
                [props.t('review.yourComment')],
              ),
              h(
                'span',
                {
                  class: css.range,
                },
                [renderRange],
              ),
              h(
                Tag,
                {
                  tone: 'neutral',
                },
                { default: () => [props.t(props.outdated ? 'review.outdated' : renderStatus)] },
              ),
            ],
          ),
          renderEditing && props.thread.kind === 'pending'
            ? h('textarea', {
              autoFocus: true,
              class: css.input,
              rows: 3,
              value: renderBody,
              disabled: props.locked,
              'aria-label': props.t('review.comment'),
              onInput: (event) => {
                if (
                  !(
                    event.target instanceof HTMLInputElement ||
                      event.target instanceof HTMLTextAreaElement
                  )
                )
                  return
                body.value = event.target.value
                if (
                  props.actions.records?.editThread(props.thread.key, event.target.value) === true
                )
                  error.value = null
                else error.value = props.t('review.saveFailed')
              },
            })
            : h(
              'div',
              {
                class: css.commentBody,
              },
              [renderComment.body],
            ),
          renderError !== null &&
            h(
              'div',
              {
                class: css.error,
                role: 'alert',
              },
              [renderError],
            ),
          h(
            'div',
            {
              class: css.threadActions,
            },
            [
              h(
                Button,
                {
                  size: 'sm',
                  disabled: renderQuoted.comment.body.trim() === '',
                  onClick: () => {
                    if (!props.actions.addToInput(renderQuoted))
                      error.value = props.t('review.inputFailed')
                  },
                },
                { default: () => [props.t('review.addToInput')] },
              ),
              props.thread.kind === 'pending' &&
                h(Fragment, null, [
                  renderEditing
                    ? h(
                      Button,
                      {
                        size: 'sm',
                        disabled: props.locked || renderMoving || renderBody.trim() === '',
                        onClick: () => {
                          if (save()) {
                            editing.value = false
                            error.value = null
                          } else error.value = props.t('review.saveFailed')
                        },
                      },
                      { default: () => [props.t('review.done')] },
                    )
                    : h(
                      Button,
                      {
                        size: 'sm',
                        disabled: props.locked || renderMoving,
                        onClick: () => {
                          body.value = renderComment.body
                          editing.value = true
                        },
                      },
                      { default: () => [props.t('review.edit')] },
                    ),
                  h(
                    Button,
                    {
                      size: 'sm',
                      disabled: props.locked || renderMoving,
                      onClick: () => {
                        if (props.actions.records?.editThread(props.thread.key, null) !== true)
                          error.value = props.t('review.saveFailed')
                      },
                    },
                    { default: () => [props.t('review.remove')] },
                  ),
                  renderQueue !== undefined &&
                    !renderEditing &&
                    !props.outdated &&
                    h(
                      Button,
                      {
                        size: 'sm',
                        disabled: props.locked || renderMoving,
                        onClick: () => {
                          void move(renderQueue)
                        },
                      },
                      {
                        default: () => [
                          props.t(renderMoving ? 'review.publishing' : 'review.queue'),
                        ],
                      },
                    ),
                ]),
              props.thread.kind === 'published' &&
                props.actions.openLink !== undefined &&
                h(
                  Button,
                  {
                    size: 'sm',
                    onClick: () => {
                      if (props.thread.kind === 'published')
                        props.actions.openLink?.(props.thread.url)
                    },
                  },
                  { default: () => [props.t('review.recheck')] },
                ),
            ],
          ),
        ],
      )
    }
  },
  { name: 'ReviewThread', props: ['t', 'thread', 'actions', 'locked', 'outdated'] as const },
)
