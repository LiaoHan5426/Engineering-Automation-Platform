import { computed, defineComponent, h, shallowRef } from 'vue'
import { Button, extractMarkdownPlainText, IconEditOutlineRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PendingQuestion, PlanReview, QuestionComposerProps } from './contract/slots.ts'
import css from './PlanReviewPanel.module.css'
/** The panel's own props: the question domain face, the narrowed review, and the locale seat. */
export type PlanReviewPanelProps = {
  pending: PendingQuestion
  review: PlanReview
} & Pick<QuestionComposerProps, 't' | 'renderSlot'>
/**
 * Optional-prop spread for a decision button's tooltip: `title` is optional on
 * the DOM props, and exactOptionalPropertyTypes rejects an explicit undefined.
 *
 * @param description - the asker's option description, when it carries one.
 * @returns The `title` prop to spread, or nothing.
 */
function tooltip(description: string | undefined): {
  title?: string
} {
  return description === undefined ? {} : { title: description }
}
/**
 * Render plan review controls; the submitted document opens in the sidebar.
 *
 * @param props - the question domain face, the narrowed plan review, and `t`.
 * @returns The plan-review takeover for this request.
 */
export const PlanReviewPanel = defineComponent((props: PlanReviewPanelProps) => {
  // Foreground decisions wait for the resolved frame; accepted Remote decisions
  // hide the panel. A failed send re-enables the buttons and shows the error.
  const busy = shallowRef(false)
  const setBusy = (next: boolean) => { busy.value = next }
  const error = shallowRef<string | null>(null)
  const setError = (next: string | null) => { error.value = next }
  const settle = (send: () => Promise<void>, remote = false): void => {
    setBusy(true)
    setError(null)
    void send()
      .then(() => {
        if (!remote)
          return
        setBusy(false)
        void props.pending.dismiss().catch(() => { setError(props.t('status.sent')) })
      })
      .catch((cause: unknown) => {
        setBusy(false)
        setError(cause instanceof Error ? cause.message : String(cause))
      })
  }
  const decide = (label: string): void => {
    settle(() => props.pending.answer({ answers: [{ id: props.review.id, selected: [label] }] }), props.pending.snapshot().channel === 'rpc')
  }
  const summary = computed(() => {
    const title = extractMarkdownPlainText(props.review.plan, { mode: 'first-line' })
    const description = extractMarkdownPlainText(props.review.plan, { mode: 'first-paragraph' })
    return { title, description: description === title ? '' : description }
  })
  return () => {
    const { pending, review, t, renderSlot } = props
    return (h('div', { 'class': css.frame, 'data-plan-review-key': pending.key }, [h('section', { 'class': css.card, 'aria-label': review.question, 'aria-busy': busy.value }, [h('div', { 'class': css.strip }, [h(StateDot, { 'state': busy.value ? 'ongoing' : 'warning' }, undefined), t('plan.header'), h('div', { 'class': css.previewActions }, [renderSlot('conversation.plan-review.actions', { review, requestKey: pending.key })])]), h('div', { 'class': css.summary }, [h('h3', { 'class': css.title }, [summary.value.title]), summary.value.description !== '' && h('p', { 'class': css.description }, [summary.value.description])]), h('div', { 'class': css.footer }, [h('div', { 'class': css.feedback, 'role': 'status' }, [error.value]), h('div', { 'class': css.actions }, [h(Button, { 'variant': 'outline', 'className': css.discuss ?? '', 'disabled': busy.value, 'onClick': () => { settle(() => pending.dismiss()) } }, { icon: () => h(IconEditOutlineRegular, { size: 14 }), default: () => [t('plan.discuss')] }), h(Button, { 'variant': 'primary', ...tooltip(review.approve.description), 'disabled': busy.value, 'onClick': () => { decide(review.approve.label) } }, { default: () => [t('plan.approve')] })])])])]))
  }
}, { name: 'PlanReviewPanel', inheritAttrs: false, props: ['pending', 'review', 't', 'renderSlot'] })
