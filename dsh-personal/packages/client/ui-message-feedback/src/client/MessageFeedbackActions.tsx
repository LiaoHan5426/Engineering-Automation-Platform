/** Per-message rating controls backed by the Session's feedback controller. */
import { defineComponent, Fragment, h, onScopeDispose, ref } from 'vue'
import {
  IconDislikeFillRegular, IconDislikeOutlineRegular, IconLikeFillRegular, IconLikeOutlineRegular, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { MessageFeedbackRating } from '@deepseek-ai/dsh-message-feedback/types'
import type { MessageFeedbackActionProps } from './slots.ts'
import css from './MessageFeedbackActions.module.css'

/** Render controls only while this Peer may record feedback in the Session. */
export const MessageFeedbackActions = defineComponent((props: MessageFeedbackActionProps) => {
  const allowed = props.useAccess('messageFeedback/put')
  return () => allowed.value ? h(FeedbackRatingButtons, { ...props }) : null
}, { name: 'MessageFeedbackActions', inheritAttrs: false, props: ['messageId', 'ensure', 'current', 'retract', 'openDialog', 'useFeedback', 'useAccess', 't'] })

const FeedbackRatingButtons = defineComponent((props: MessageFeedbackActionProps) => {
  const item = props.useFeedback(view => view.items.get(props.messageId))
  const loadFailed = props.useFeedback(view => view.status === 'error')
  const pending = ref(false)
  const failure = ref<string | null>(null)
  let seeded = false
  let alive = true
  onScopeDispose(() => { alive = false })
  // Settled messages share one read, initiated on first hover or focus.
  const seed = () => {
    if (seeded) return
    seeded = true
    void props.ensure()
  }
  const choose = (rating: MessageFeedbackRating) => {
    if (pending.value) return
    pending.value = true
    failure.value = null
    const messageId = props.messageId
    void props.ensure().then(loaded => {
      if (!alive) return
      if (!loaded.ok || props.current(messageId)?.rating !== rating) {
        pending.value = false
        props.openDialog(messageId, rating)
        return
      }
      void props.retract(messageId, rating).then(result => {
        if (!alive) return
        pending.value = false
        if (!result.ok) failure.value = props.t(result.error.code === 'version-conflict' ? 'error.conflict' : 'error.generic')
      })
    })
  }
  return () => {
    const rating = item.value?.rating
    const likeLabel = props.t(rating === 'positive' ? 'action.likeActive' : 'action.like')
    const dislikeLabel = props.t(rating === 'negative' ? 'action.dislikeActive' : 'action.dislike')
    return h(Fragment, null, [
      h(Tooltip, { label: likeLabel, side: 'bottom' }, { default: () => h('button', {
        type: 'button', class: css.action, 'aria-label': likeLabel, 'aria-pressed': rating === 'positive',
        'data-active': rating === 'positive' || undefined, disabled: pending.value,
        onFocus: seed, onPointerenter: seed, onClick: () => { choose('positive') },
      }, [h(rating === 'positive' ? IconLikeFillRegular : IconLikeOutlineRegular)]) }),
      h(Tooltip, { label: dislikeLabel, side: 'bottom' }, { default: () => h('button', {
        type: 'button', class: css.action, 'aria-label': dislikeLabel, 'aria-pressed': rating === 'negative',
        'data-active': rating === 'negative' || undefined, disabled: pending.value,
        onFocus: seed, onPointerenter: seed, onClick: () => { choose('negative') },
      }, [h(rating === 'negative' ? IconDislikeFillRegular : IconDislikeOutlineRegular)]) }),
      failure.value === null && loadFailed.value ? h('span', { class: css.failure, role: 'status' }, props.t('error.load')) : null,
      failure.value !== null ? h('span', { class: css.failure, role: 'status' }, failure.value) : null,
    ])
  }
}, { name: 'FeedbackRatingButtons', inheritAttrs: false, props: ['messageId', 'ensure', 'current', 'retract', 'openDialog', 'useFeedback', 't'] })
