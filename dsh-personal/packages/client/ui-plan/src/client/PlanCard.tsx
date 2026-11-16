/** Persistent transcript cards and pending-review sidebar navigation. */
import { computed, defineComponent, h, watchEffect, type DefineSetupFnComponent } from 'vue'
import { FileTypeIcon, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { SubmittedPlan } from './plan.ts'
import type {} from './plan-definition.ts'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallId } from '@deepseek-ai/dsh-llm/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type {} from '@deepseek-ai/dsh-client-ui-user-questions/client'
import type { createPlanReviewStore } from './review-store.ts'
import css from './PlanPreview.module.css'

/** Session-bound navigation for logged plans. */
export interface PlanOpenInjected {
  /** Open or focus the exact submitted plan. */
  openPlan: (callId: ToolCallId) => void
}

/** Turn-keyed submitted plans and Session-bound navigation. */
export interface PlanCardsInjected extends PlanOpenInjected {
  keyedHooks: {
    /** Resolve only this Turn's submitted plans, in invocation order. */
    plans: (turn: string) => ObservableSnapshot<readonly SubmittedPlan[]>
  }
}

/** Session-bound preview navigation for one pending review. */
export interface PlanReviewOpenInjected {
  /** Open the logged plan, or the request's temporary document when no invocation exists. */
  openReview: (review: PropsRuntime<'conversation.plan-review.actions'>['review'], requestKey: string) => void
  readonly hooks: {
    /** The Session on screen, whose right Sidebar the opens land in; `undefined` while none is. */
    readonly sidebarMounted: HostObservable<SessionId | undefined>
  }
}

/**
 * Render the completed Turn's submitted plans in invocation order.
 * @param props - Logged plan, localized copy, and Session-bound navigation.
 * @returns keyboard-accessible plan cards, or null for a Turn without plans.
 */
export const PlanCards = defineComponent((props: { turn: Pick<PropsRuntime<'conversation.chat.turnTail'>['turn'], 'turn'> } & InjectFace<PlanCardsInjected> & PropsLocale<'plan'>) => {
  const turnKey = computed(() => String(props.turn.turn))
  const plans = props.usePlans(turnKey)
  return () => plans.value === undefined || plans.value.length === 0 ? null : h('div', { class: css.cards, 'data-plan-artifacts': '' }, plans.value.map(plan => h('button', {
    key: plan.callId, type: 'button', class: css.card, 'data-plan-card': plan.callId,
    'aria-label': props.t('preview.openNamed', { title: plan.title }), onClick: () => { props.openPlan(plan.callId) },
  }, [
    h('span', { class: css.cardIcon }, [h(FileTypeIcon, { kind: 'markdown', size: 20 })]),
    h('span', { class: css.cardDetails }, [h('span', { class: css.cardTitle }, plan.title), h('span', { class: css.cardDescription }, props.t('preview.document'))]),
    h('span', { class: css.cardOpen }, props.t('preview.action')),
  ])))
}, { name: 'PlanCards', inheritAttrs: false, props: ['turn', 'usePlans', 'openPlan', 't'] })

/**
 * Open each pending plan automatically and retain a manual opener without answering it.
 *
 * The automatic open waits for a Session on screen. `ctx.sidebarRight` names
 * the Session before the commit that brings its Conversation back renders, so
 * a review that arrived while the Conversation was off screen opens from the
 * effect of the commit that mounts it.
 * @param props - Review identity, Session store, localized copy, and navigation.
 * @returns an opener for either logged or temporary plan text.
 */
type PlanReviewOpenProps = PropsRuntime<'conversation.plan-review.actions'> & InjectFace<PlanReviewOpenInjected> & PropsLocale<'plan'> & PropsStore<ReturnType<typeof createPlanReviewStore>>
export const PlanReviewOpen: DefineSetupFnComponent<PlanReviewOpenProps> = defineComponent((props: PlanReviewOpenProps) => {
  const identity = computed(() => props.review.callId === undefined ? `review:${props.requestKey}` : `call:${props.review.callId}`)
  const opened = props.useStore(state => state.opened[identity.value] === true)
  const mounted = props.useSidebarMounted(session => session !== undefined)
  watchEffect(() => {
    if (opened.value || !mounted.value) return
    props.openReview(props.review, props.requestKey)
    props.actions.markOpened(identity.value)
  }, { flush: 'post' })
  return () => h('button', { type: 'button', class: css.reviewLink, title: props.t('preview.open'), 'aria-label': props.t('preview.open'), onClick: () => { props.openReview(props.review, props.requestKey) } }, [props.t('preview.full'), h(IconChevronRightOutlineRegular, { size: 14 })])
}, { name: 'PlanReviewOpen', inheritAttrs: false, props: ['review', 'requestKey', 'openReview', 'useSidebarMounted', 't', 'useStore', 'actions'] })
