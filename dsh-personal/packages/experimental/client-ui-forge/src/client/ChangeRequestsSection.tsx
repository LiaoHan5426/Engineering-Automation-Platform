/** Session panel section listing the Session's change requests, and its title control. */

import { defineComponent, h, shallowRef, type VNodeChild } from 'vue'
import {
  Button, HoverCardGroup, IconWarningTriangleOutlineRegular, MarqueeText, useHoverMarquee,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HostObservable, InjectFace, PropsLocale, PropsRenderFactories, PropsRenderSlots, PropsRuntime, PropsStore,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { ForgeReadiness, MergeRequest } from '@deepseek-ai/dsh-experimental-forge/types'
import type { PanelDetailsProps } from '@deepseek-ai/dsh-client-ui-session-panel/client'
import type { ForgePanelChangeRequest, ForgePanelState } from '../types.ts'
import { ChangeRequestCard, type ChangeRequestActions } from './ChangeRequestCard.tsx'
import type { createChangeRequestsSectionStore } from './change-requests-store.ts'
import type { NS } from './locales.ts'
import { ReasonButton } from './ReasonButton.tsx'
import type {} from './slots.ts'
import type { PanelSnapshot } from './source.ts'
import { defaultExpanded } from './status.ts'
import css from './Forge.module.css'

/** Business face of the change requests section. */
export interface ChangeRequestsSectionInjected {
  /** Panel snapshot of the Session and the active language; bound as `usePanel` and `useLocale`. */
  readonly hooks: {
    readonly panel: HostObservable<PanelSnapshot>
    readonly locale: HostObservable<string>
  }
  /**
   * Reinspect the checkout, probe sign-in, and poll the change requests;
   * settles once the Host has inspected and probed, after reporting a failure.
   */
  readonly refresh: () => Promise<void>
  /** Remove a change request from the Session, offering to undo it. */
  readonly remove: (entry: ForgePanelChangeRequest) => void
  /** Mark a draft ready for review; settles once the outcome is reported. */
  readonly markReady: (entry: ForgePanelChangeRequest) => Promise<void>
  /** Merge a change request as `request` describes; settles once the outcome is reported. */
  readonly merge: (entry: ForgePanelChangeRequest, request: MergeRequest) => Promise<void>
  /** Read the complete checks of an opened change request. */
  readonly readChecks: NonNullable<ChangeRequestActions['readChecks']>
  /** Rerun the failed checks or one check; settles once the outcome is reported. */
  readonly rerunChecks: NonNullable<ChangeRequestActions['rerunChecks']>
  /** Request reviews from more reviewers; settles once the outcome is reported. */
  readonly requestReviews: NonNullable<ChangeRequestActions['requestReviews']>
  /** List accounts a review can be requested from. */
  readonly reviewerCandidates: NonNullable<ChangeRequestActions['reviewerCandidates']>
  /** Bring the base branch's new commits into the head branch; settles once the outcome is reported. */
  readonly updateBranch: NonNullable<ChangeRequestActions['updateBranch']>
  /** Open a URL outside the app. */
  readonly openLink: (url: string) => void
  /** Copy text to the clipboard and report the outcome. */
  readonly copyText: (text: string) => void
  /** Open the changes view of a bound change request in the right sidebar. */
  readonly viewChanges: (entry: ForgePanelChangeRequest) => void
}

/** Full props of the change requests section. */
export type ChangeRequestsSectionProps =
  PropsRuntime<'conversation.session.panel.section'>
  & Pick<PropsRenderSlots<'forge.change-request.card.actions'>, 'renderSlot'>
  & PropsRenderFactories
  & InjectFace<ChangeRequestsSectionInjected>
  & PropsStore<ReturnType<typeof createChangeRequestsSectionStore>>
  & PropsLocale<typeof NS>

/** Business face of the section's title control. */
export interface ChangeRequestsActionsInjected {
  /** Panel snapshot of the Session; bound as `usePanel`. */
  readonly hooks: { readonly panel: HostObservable<PanelSnapshot> }
}

/** Full props of the section's title control. */
export type ChangeRequestsActionsProps =
  PropsRuntime<'conversation.session.panel.section.actions'>
  & InjectFace<ChangeRequestsActionsInjected>
  & PropsLocale<typeof NS>

type Translate = PropsLocale<typeof NS>['t']

const FOLD_LIMIT = 3
interface SignInNeed { readonly host: string; readonly readiness: ForgeReadiness }
function signInNeedOf(state: ForgePanelState): SignInNeed | null {
  const { repository, readiness } = state
  return repository === null || readiness === null || readiness.state === 'ready' ? null : { host: repository.host, readiness }
}
const SignInRow = defineComponent((props: { readonly need: SignInNeed; readonly copyText: (text: string) => void; readonly t: Translate }) => {
  const titleRef = shallowRef<HTMLSpanElement | null>(null)
  const commandRef = shallowRef<HTMLSpanElement | null>(null)
  const titleMarquee = useHoverMarquee(titleRef)
  const commandMarquee = useHoverMarquee(commandRef)
  return () => {
    const { host, readiness } = props.need
    const unavailable = readiness.state === 'unavailable'
    const command = unavailable ? undefined : readiness.signIn?.command
    const marquee = command === undefined ? titleMarquee : commandMarquee
    const trailing = command !== undefined ? h(Button, { size: 'sm', variant: 'outline', 'aria-label': props.t('signin.copy'), onClick: () => props.copyText(command) }, { default: () => props.t('signin.copyShort') }) : readiness.message !== null && readiness.message !== '' ? h(ReasonButton, { reason: readiness.message, label: props.t('reason.show') }) : null
    const title = h('span', { 'data-row-part': 'content' }, [h(MarqueeText, { elementRef: (element: HTMLSpanElement | null) => { titleRef.value = element }, className: css.statusTitle ?? '' }, { default: () => props.t(unavailable ? 'signin.unavailable' : 'signin.title', { host }) })])
    return h('div', { role: 'status', 'data-session-panel-row': '', 'data-forge-signin': readiness.state, ...marquee }, [
      h('span', { 'data-row-part': 'body' }, [
        h('span', { 'data-row-part': 'icon', 'aria-hidden': 'true' }, [h(IconWarningTriangleOutlineRegular, { size: 16 })]),
        command === undefined ? title : h('span', { 'data-row-part': 'lines' }, [title, h('span', { 'data-row-part': 'detail' }, [h(MarqueeText, { elementRef: (element: HTMLSpanElement | null) => { commandRef.value = element }, className: css.signinCommand ?? '' }, { default: () => command })])]),
      ]),
      trailing !== null && h('span', { 'data-row-part': 'trailing' }, [trailing]),
    ])
  }
}, { props: ['need', 'copyText', 't'] })
export const ChangeRequestsSection = defineComponent((props: ChangeRequestsSectionProps) => {
  const snapshot = props.usePanel(value => value)
  const locale = props.useLocale(value => value)
  const selected = props.useStore(value => value)
  const renderDetails = (details: PanelDetailsProps): VNodeChild => props.renderFactorySlot('conversation.session.panel.details', details)
  return () => {
    const state = snapshot.value.state
    if (state === null) return null
    const signIn = signInNeedOf(state)
    if (signIn === null && state.changeRequests.length === 0) return null
    const actions: ChangeRequestActions = {
      openLink: props.openLink, copyLink: props.copyText, retry: () => { void props.refresh() }, remove: props.remove,
      markReady: props.markReady, merge: props.merge, readChecks: props.readChecks, rerunChecks: props.rerunChecks,
      requestReviews: props.requestReviews, reviewerCandidates: props.reviewerCandidates, updateBranch: props.updateBranch,
      viewChanges: entry => { props.viewChanges(entry); props.dismissOverlay() },
      renderActions: owner => props.renderSlot('forge.change-request.card.actions', owner), renderDetails,
    }
    const defaults = defaultExpanded(state.changeRequests)
    const expanded = (url: string): boolean => selected.value.expanded[url] ?? defaults.has(url)
    const unfolded = selected.value.unfolded
    const foldable = state.changeRequests.length > FOLD_LIMIT
    const shown = foldable && !unfolded ? state.changeRequests.slice(0, FOLD_LIMIT) : state.changeRequests
    const label = unfolded ? props.t('fold.less') : props.t('fold.more', { count: state.changeRequests.length - FOLD_LIMIT })
    return h('div', { class: css.cards, 'data-forge-panel': '' }, [signIn !== null && h(SignInRow, { need: signIn, copyText: props.copyText, t: props.t }), shown.length > 0 && h(HoverCardGroup, null, { default: () => h('ul', { class: css.list }, shown.map(entry => h(ChangeRequestCard, { key: entry.url, entry, expanded: expanded(entry.url), onToggle: () => props.actions.toggled(entry.url, !expanded(entry.url)), now: Date.now(), actions, locale: locale.value, t: props.t }))) }), foldable && props.renderFactorySlot('conversation.session.panel.fold', { expanded: unfolded, label, name: props.t('fold.name', { label }), onToggle: () => props.actions.unfoldedSet(!unfolded) })])
  }
}, { name: 'ChangeRequestsSection', props: ['usePanel', 'useLocale', 'dismissOverlay', 'refresh', 'remove', 'markReady', 'merge', 'readChecks', 'rerunChecks', 'requestReviews', 'reviewerCandidates', 'updateBranch', 'openLink', 'copyText', 'viewChanges', 'useStore', 'actions', 'renderSlot', 'renderFactorySlot', 't'] })
export const ChangeRequestsActions = defineComponent((props: ChangeRequestsActionsProps) => {
  const panel = props.usePanel(value => value)
  return () => { const count = panel.value.state?.changeRequests.length ?? 0; return count === 0 ? null : h('span', { class: css.count }, String(count)) }
}, { name: 'ChangeRequestsActions', props: ['usePanel', 't'] })
