import { computed, defineComponent, Fragment, h, shallowRef, watch, type VNodeChild } from 'vue'
import {
  DisclosureRow, IconChevronRightOutlineRegular, StateDot,
  type DisclosureRowProps, type StateDotState,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionListState, SessionTarget } from '@deepseek-ai/dsh-api-session-controller/client'
import { shallowEqual } from '@deepseek-ai/dsh-client-store'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session-status/client'
import type { WorkflowRunKey } from './locales.ts'
import type {
  WorkflowRunMemberData, WorkflowRunPhaseData, WorkflowRunStatus,
} from './workflow-definition.ts'
import css from './WorkflowRunPanel.module.css'

/** Navigation action injected from the plugin's own Session Controller access. */
export interface WorkflowRunInjected {
  readonly openSession: (target: SessionTarget) => void
}

/** Complete keyed Chat renderer props. */
export type WorkflowRunPanelProps =
  PropsRuntime<'conversation.chat.node', 'workflow-run'>
  & PropsLocale<'workflowRun'>
  & WorkflowRunInjected

const STATUS_KEYS = {
  running: 'status.running',
  completed: 'status.completed',
  failed: 'status.failed',
  cancelled: 'status.cancelled',
  interrupted: 'status.interrupted',
} as const satisfies Record<WorkflowRunStatus, WorkflowRunKey>

function dotState(status: WorkflowRunStatus): StateDotState {
  switch (status) {
    case 'running': return 'ongoing'
    case 'completed': return 'done'
    case 'failed': return 'error'
    case 'cancelled':
    case 'interrupted': return 'warning'
    /* v8 ignore next -- WorkflowRunStatus is closed and every variant is handled above. */
    default: return status satisfies never
  }
}

function readablePhase(phase: string | null, t: WorkflowRunPanelProps['t']): string {
  if (phase === null) return t('phase.unassigned')
  return phase === '' ? t('phase.empty') : phase
}

function readableMember(label: string, t: WorkflowRunPanelProps['t']): string {
  return label === '' ? t('member.empty') : label
}

function statusCount(
  status: WorkflowRunStatus,
  count: number,
  t: WorkflowRunPanelProps['t'],
): string {
  return t(`statusCount.${status}`, { count })
}

function memberCount(count: number, t: WorkflowRunPanelProps['t']): string {
  return t(count === 1 ? 'run.members.one' : 'run.members.other', { count })
}

type DisclosureMode = 'clean' | 'running' | 'abnormal'

interface DisclosureFacts {
  readonly mode: DisclosureMode
  readonly activityCount: number
}

interface DisclosureState extends DisclosureFacts {
  readonly open: boolean
  readonly pendingCleanCollapse: boolean
}

interface WorkflowDisclosureState {
  readonly run: DisclosureState
  readonly phases: ReadonlyMap<string, DisclosureState>
}

type StatusDisclosureProps = Omit<DisclosureRowProps, 'expandable'>


function abnormal(status: WorkflowRunStatus): boolean {
  return status === 'failed' || status === 'cancelled' || status === 'interrupted'
}

function phaseDisclosureFacts(phase: WorkflowRunPhaseData): DisclosureFacts {
  const mode = phase.members.some(member => abnormal(member.status))
    ? 'abnormal'
    : phase.members.some(member => member.status === 'running') ? 'running' : 'clean'
  return { mode, activityCount: phase.members.length }
}

function runDisclosureFacts(
  status: WorkflowRunStatus,
  phases: readonly (readonly [string, DisclosureFacts])[],
): DisclosureFacts {
  const mode = abnormal(status) || phases.some(([, facts]) => facts.mode === 'abnormal')
    ? 'abnormal'
    : status === 'running' || phases.some(([, facts]) => facts.mode === 'running')
      ? 'running'
      : 'clean'
  const activityCount = phases.reduce((count, [, facts]) => count + facts.activityCount, 0)
  return { mode, activityCount }
}

function initialDisclosureState(facts: DisclosureFacts): DisclosureState {
  return { ...facts, open: facts.mode !== 'clean', pendingCleanCollapse: false }
}

function advanceDisclosureState(
  current: DisclosureState,
  facts: DisclosureFacts,
  focusWithin: boolean,
): DisclosureState {
  const sameFacts = current.mode === facts.mode && current.activityCount === facts.activityCount
  if (sameFacts) {
    if (!current.pendingCleanCollapse || focusWithin) return current
    return { ...current, open: false, pendingCleanCollapse: false }
  }
  if (facts.mode === 'clean') {
    const deferCollapse = current.open && focusWithin
    return { ...facts, open: deferCollapse, pendingCleanCollapse: deferCollapse }
  }
  if (current.mode === 'clean' || (facts.mode === 'abnormal' && current.mode !== 'abnormal')) {
    return { ...facts, open: true, pendingCleanCollapse: false }
  }
  return { ...facts, open: current.open, pendingCleanCollapse: false }
}

function focusIsWithin(element: HTMLElement | null | undefined): boolean {
  if (element === null || element === undefined) return false
  return element.contains(element.ownerDocument.activeElement)
}

function collapsePending(state: DisclosureState): DisclosureState {
  if (!state.pendingCleanCollapse) return state
  return { ...state, open: false, pendingCleanCollapse: false }
}

function existingPhaseState(
  phases: ReadonlyMap<string, DisclosureState>,
  key: string,
): DisclosureState {
  const phase = phases.get(key)
  /* v8 ignore next -- mounted phase callbacks are created from this owner map. */
  if (phase === undefined) throw new Error(`Missing disclosure state for phase ${key}`)
  return phase
}

function preventPendingHeaderFocus(event: MouseEvent): void {
  if (!(event.currentTarget instanceof HTMLElement)) return
  const header = event.currentTarget.querySelector('[data-disclosure-row]')
  /* v8 ignore next -- DisclosureRow always renders its header before the content. */
  if (header === null) throw new Error('Missing disclosure header')
  if (event.target instanceof Node && header.contains(event.target)) event.preventDefault()
}

function phaseStatusSummary(members: readonly WorkflowRunMemberData[], t: WorkflowRunPanelProps['t']): string {
  const counts = new Map<WorkflowRunStatus, number>()
  for (const member of members) counts.set(member.status, (counts.get(member.status) ?? 0) + 1)
  const count = (status: WorkflowRunStatus): number => counts.get(status) ?? 0
  const active = (['running', 'failed', 'cancelled', 'interrupted'] as const)
    .filter(status => count(status) > 0)
  if (active.length === 0) return statusCount('completed', count('completed'), t)
  const visible = active.includes('interrupted') && count('completed') > 0
    ? ['completed' as const, ...active]
    : active
  return visible.map(status => statusCount(status, count(status), t)).join(' · ')
}

type ChildMode = Exclude<SessionTarget, SessionId>['mode']

function navigableMembers(
  sessions: SessionListState,
  phases: readonly WorkflowRunPhaseData[],
  parentId: SessionId,
  statuses: SessionStatusSnapshot,
): ReadonlyMap<SessionId, ChildMode> {
  const result = new Map<SessionId, ChildMode>()
  for (const phase of phases) {
    for (const member of phase.members) {
      const child = sessions.byId[member.childId]
      const identity = sessions.projectionsBySession[member.childId]?.values.subagent
      if (member.status === 'running'
        && child?.parentId === parentId && identity !== undefined && identity !== null
        && (statuses.get(child.id)?.running ?? child.running)) {
        result.set(member.childId, identity.mode)
      }
    }
  }
  return result
}

function disclosure(props: StatusDisclosureProps, children: VNodeChild) {
  return h(DisclosureRow, { ...props, expandable: true }, { default: () => children })
}

function runHeader(props: { count: number; name: string; onToggle: () => void; open: boolean; status: WorkflowRunStatus; t: WorkflowRunPanelProps['t'] }, children: VNodeChild) {
  return disclosure({
    icon: h(IconChevronRightOutlineRegular), title: props.t('run.title', { name: props.name }),
    open: props.open, onToggle: props.onToggle, expandOnRowClick: true, previewChevron: false, keepContentWhenOpen: true,
    rowClassName: css.runHeader ?? '', contentClassName: css.headerContent ?? '', contentLayoutClassName: css.headerContentLayout ?? '',
    leadingClassName: css.runLeading ?? '', titleClassName: css.runTitle ?? '',
    collapsedContent: h(Fragment, null, [h('span', { class: css.separator, 'aria-hidden': true }),
      h('span', { class: css.runSummary }, memberCount(props.count, props.t)),
      h('span', { class: css.statusTail, 'data-status': props.status }, [h(StateDot, { state: dotState(props.status) }), h('span', props.t(STATUS_KEYS[props.status]))])]),
  }, children)
}

const MemberRow = defineComponent((props: {
  member: WorkflowRunMemberData; mode: ChildMode | undefined; openSession: WorkflowRunInjected['openSession']; parentSessionId: SessionId; t: WorkflowRunPanelProps['t']
}) => {
  const focused = shallowRef(false)
  return () => {
    const { member, mode, t } = props
    const navigable = mode !== undefined
    const name = readableMember(member.label, t)
    const content = [h('span', { class: css.dotSlot }, [h(StateDot, { state: dotState(member.status) })]),
      h('span', { class: css.memberLabelWrap, 'data-member-label-wrap': '' }, [h('span', { class: css.memberLabel, 'data-member-label': '' }, name)]),
      h('span', { class: css.memberStatus, 'data-member-status-text': '' }, t(STATUS_KEYS[member.status]))]
    if (!navigable && !focused.value) return h('div', { class: css.memberRow, 'data-member-status': member.status }, content)
    return h('button', { type: 'button', class: navigable ? css.memberButton : css.memberRow, 'data-member-status': member.status,
      ...(navigable ? {} : { 'aria-disabled': true, tabindex: -1 }), 'aria-label': navigable ? t('member.open', { name }) : name,
      onFocus: () => { focused.value = true }, onBlur: () => { focused.value = false },
      onClick: () => { if (props.mode !== undefined) props.openSession({ parentSessionId: props.parentSessionId, childSessionId: props.member.childId, mode: props.mode }) },
    }, content)
  }
}, { name: 'WorkflowMemberRow', inheritAttrs: false, props: ['member', 'mode', 'openSession', 'parentSessionId', 't'] })

/** Render one durable workflow run with status-driven run and phase disclosure. */
export const WorkflowRunPanel = defineComponent((props: WorkflowRunPanelProps) => {
  const phaseFacts = computed(() => props.node.data.phases.map(phase => [phase.key, phaseDisclosureFacts(phase)] as const))
  const runFacts = computed(() => runDisclosureFacts(props.node.data.status, phaseFacts.value))
  const disclosures = shallowRef<WorkflowDisclosureState>({ run: initialDisclosureState(runFacts.value),
    phases: new Map(phaseFacts.value.map(([key, facts]) => [key, initialDisclosureState(facts)])) })
  const runContentRef = shallowRef<HTMLDivElement | null>(null)
  const phaseContentRefs = new Map<string, HTMLDivElement>()
  const statuses = props.useSessionStatus(value => value)
  const navigable = props.useSessions(sessions => navigableMembers(sessions, props.node.data.phases, props.sessionId, statuses.value), shallowEqual)
  // Apply changed facts after the previous DOM focus boundary has committed.
  watch([phaseFacts, runFacts, () => disclosures.value.run.open], () => {
    const current = disclosures.value
    const phases = new Map<string, DisclosureState>()
    let phasesChanged = current.phases.size !== phaseFacts.value.length
    let phaseStartedCycle = false
    for (const [key, facts] of phaseFacts.value) {
      const previous = current.phases.get(key)
      const next = previous === undefined ? initialDisclosureState(facts) : advanceDisclosureState(previous, facts, focusIsWithin(phaseContentRefs.get(key)))
      phases.set(key, next)
      if (next !== previous) phasesChanged = true
      if (previous?.mode === 'clean' && (facts.mode !== 'clean' || facts.activityCount !== previous.activityCount)) phaseStartedCycle = true
    }
    const facts = runFacts.value
    const advancedRun = advanceDisclosureState(current.run, facts, focusIsWithin(runContentRef.value))
    const run = phaseStartedCycle && facts.mode !== 'clean' && !advancedRun.open ? { ...advancedRun, open: true, pendingCleanCollapse: false } : advancedRun
    if (run !== current.run || phasesChanged) disclosures.value = { run, phases }
  }, { flush: 'post' })
  const toggleRun = () => {
    const current = disclosures.value
    disclosures.value = { ...current, run: { ...current.run, open: !current.run.open, pendingCleanCollapse: false } }
  }
  const togglePhase = (key: string) => {
    const current = disclosures.value
    const phases = new Map(current.phases)
    const phase = existingPhaseState(phases, key)
    phases.set(key, { ...phase, open: !phase.open, pendingCleanCollapse: false })
    disclosures.value = { ...current, phases }
  }
  const remainsWithin = (event: FocusEvent) => event.currentTarget instanceof HTMLElement && event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)
  const settleRunBlur = (event: FocusEvent) => {
    if (remainsWithin(event)) return
    const current = disclosures.value
    const run = collapsePending(current.run)
    if (run !== current.run) disclosures.value = { ...current, run }
  }
  const settlePhaseBlur = (key: string, event: FocusEvent) => {
    if (remainsWithin(event)) return
    const current = disclosures.value
    const phase = existingPhaseState(current.phases, key)
    const next = collapsePending(phase)
    if (next !== phase) {
      const phases = new Map(current.phases)
      phases.set(key, next)
      disclosures.value = { ...current, phases }
    }
  }
  return () => {
    const { node, t, sessionId, openSession } = props
    const state = disclosures.value
    return h('section', { class: css.root, 'data-workflow-run': '', 'data-run-status': node.data.status,
      onMousedownCapture: state.run.pendingCleanCollapse ? preventPendingHeaderFocus : undefined }, [
      runHeader({ count: runFacts.value.activityCount, name: node.data.name, open: state.run.open, onToggle: toggleRun, status: node.data.status, t },
        h('div', { ref: runContentRef, class: css.phaseList, onFocusout: settleRunBlur }, node.data.phases.length === 0
          ? [h('span', { class: css.empty }, t('run.empty'))]
          : node.data.phases.map(phase => {
            const phaseState = state.phases.get(phase.key) ?? initialDisclosureState(phaseDisclosureFacts(phase))
            return h('div', { key: phase.key, class: css.phase, onMousedownCapture: phaseState.pendingCleanCollapse ? preventPendingHeaderFocus : undefined }, [
              disclosure({ icon: h(IconChevronRightOutlineRegular), title: readablePhase(phase.phase, t), open: phaseState.open, onToggle: () => { togglePhase(phase.key) },
                expandOnRowClick: true, previewChevron: false, keepContentWhenOpen: true, rowClassName: css.phaseHeader ?? '',
                contentClassName: css.headerContent ?? '', contentLayoutClassName: css.headerContentLayout ?? '', leadingClassName: css.phaseLeading ?? '', titleClassName: css.phaseTitle ?? '',
                collapsedContent: h(Fragment, null, [h('span', { class: css.separator, 'aria-hidden': true }),
                  h('span', { class: css.phaseCount, 'data-phase-count': '' }, memberCount(phase.members.length, t)),
                  h('span', { class: css.phaseStatus, 'data-phase-status-text': '' }, phaseStatusSummary(phase.members, t))]),
              }, h('div', { ref: (element: unknown) => { if (element instanceof HTMLDivElement) phaseContentRefs.set(phase.key, element); else phaseContentRefs.delete(phase.key) },
                class: css.members, onFocusout: (event: FocusEvent) => { settlePhaseBlur(phase.key, event) } },
              phase.members.map(member => h(MemberRow, { key: member.seq, member, mode: navigable.value.get(member.childId), openSession, parentSessionId: sessionId, t })))),
            ])
          }))),
    ])
  }
}, { name: 'WorkflowRunPanel', inheritAttrs: false, props: ['node', 'sessionId', 'useSessions', 'useSessionStatus', 'openSession', 't'] })
