/** Stable process container; display policy changes visibility, never member parents. */
import { computed, defineComponent, h, ref, shallowRef, useId, watch, watchEffect, type VNodeChild } from 'vue'
import {
  IconAgentPresetOutlineRegular, IconApiOutlineRegular, IconBrowseOutlineRegular, IconChevronDownOutlineRegular,
  IconChevronUpOutlineRegular, IconCodeOutlineRegular, IconContextInjectionOutlineRegular, IconEditOutlineRegular,
  IconGlobeOutlineRegular, IconPlanOutlineRegular, IconQuestionOutlineRegular, IconSearchOutlineRegular, IconSparkleRegular,
  IconThinkOutlineRegular, TextShimmer,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { GroupKey, NodeReference } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { ProcessActivity, RunningProcessActivity } from '../contract/process-groups.ts'
import type { ChatFlowSlotProps } from '../contract/slots.ts'
import { turnProcessOpen } from '../stores.ts'
import { ChatNodeSeat } from './ChatNodeSeat.tsx'
import { hiddenOrCollapsing } from './flow-motion.ts'
import { chatRenderKey } from './render-entry.ts'
import { processTitle } from './step-process.ts'
import { useDisclosure } from './use-disclosure.ts'
import { useProcessScroll } from './use-process-scroll.ts'
import css from './ChatGroupSeat.module.css'

type SeatProps = Omit<InstanceType<typeof ChatNodeSeat>['$props'], 'nodeKey' | 'groupPart'>
type ChatGroupSeatProps = SeatProps & {
  readonly groupKey: GroupKey
  readonly useChatGroup: ChatFlowSlotProps['useChatGroup']
  readonly useGroupHeaderAction: ChatFlowSlotProps['useGroupHeaderAction']
}
const PROCESS_TITLE_MINIMUM_MS = 150

type ProcessTitleActivity = ProcessActivity | 'thinking'

interface LiveProcessTitle {
  readonly activity: RunningProcessActivity | 'thinking'
  readonly detail: string
  readonly preparing: boolean
}

const PROCESS_ICONS: Record<ProcessTitleActivity, VNodeChild> = {
  thinking: h(IconThinkOutlineRegular),
  read: h(IconBrowseOutlineRegular, { size: 14 }),
  readImage: h(IconBrowseOutlineRegular, { size: 14 }),
  search: h(IconSearchOutlineRegular, { size: 14 }),
  edit: h(IconEditOutlineRegular, { size: 14 }),
  write: h(IconEditOutlineRegular, { size: 14 }),
  commands: h(IconApiOutlineRegular),
  code: h(IconCodeOutlineRegular, { size: 14 }),
  webSearch: h(IconGlobeOutlineRegular),
  webFetch: h(IconBrowseOutlineRegular, { size: 14 }),
  subagents: h(IconAgentPresetOutlineRegular, { size: 14 }),
  plan: h(IconPlanOutlineRegular),
  questions: h(IconQuestionOutlineRegular),
  tools: h(IconSparkleRegular, { size: 14 }),
  context: h(IconContextInjectionOutlineRegular, { size: 14 }),
}

function sameLiveProcessTitle(left: LiveProcessTitle, right: LiveProcessTitle): boolean {
  return left.activity === right.activity && left.detail === right.detail && left.preparing === right.preparing
}

function useStableLiveProcessTitle(desired: () => LiveProcessTitle, active: () => boolean) {
  const displayed = shallowRef(desired())
  let displayedAt = Date.now()
  watchEffect((onCleanup) => {
    const next = desired()
    if (!active() || sameLiveProcessTitle(displayed.value, next)) return
    const remaining = PROCESS_TITLE_MINIMUM_MS - (Date.now() - displayedAt)
    const commit = (): void => { displayed.value = desired(); displayedAt = Date.now() }
    if (remaining <= 0) { commit(); return }
    const timer = setTimeout(commit, remaining)
    onCleanup(() => { clearTimeout(timer) })
  })
  return computed(() => active() ? displayed.value : desired())
}

const seatPropNames = [
  'nodeStore', 'useChatNode', 'useChatNodeBottom', 'useChatNodeProcess', 'usePresentation',
  'useStore', 'actions', 'renderSlot', 't', 'useGroupAction', 'deferCollapse',
  'cwd', 'openFile', 'inspectCall', 'forkAt', 'loadImage',
] as const

const GroupMembers = defineComponent((props: SeatProps & { readonly members: readonly NodeReference[] }) => () => {
  const { members, ...seat } = props
  return members.map(member => h(ChatNodeSeat, {
    ...seat, key: chatRenderKey(member), nodeKey: member.key,
    ...member.groupPart === undefined ? {} : { groupPart: member.groupPart },
  }))
}, { name: 'GroupMembers', inheritAttrs: false, props: [...seatPropNames, 'members'] })

type ProcessGroupHeaderProps = {
  readonly groupKey: GroupKey
  readonly useChatGroup: ChatFlowSlotProps['useChatGroup']
  readonly usePresentation: ChatFlowSlotProps['usePresentation']
  readonly t: ChatFlowSlotProps['t']
  readonly open: boolean
  readonly bodyId: string
  readonly toggle: () => void
}
const ProcessGroupHeader = defineComponent((props: ProcessGroupHeaderProps) => {
  const key = computed(() => props.groupKey)
  const data = props.useChatGroup(key, group => group?.data)
  const detailed = props.usePresentation(policy => data.value?.closed === false && policy.liveProcessDetail)
  const live = useStableLiveProcessTitle(() => ({
    activity: data.value?.summary.running ?? 'thinking',
    detail: data.value?.summary.runningDetail ?? '', preparing: data.value?.summary.preparing === true,
  }), () => data.value !== undefined && !data.value.closed)
  return () => {
    const current = data.value
    if (current === undefined) return null
    const label = current.closed ? processTitle(current.summary, props.t)
      : live.value.preparing ? props.t(`message.stepProcess.prepare.${live.value.activity === 'thinking' ? 'tools' : live.value.activity}`)
        : props.t(`message.stepProcess.${live.value.activity}`)
    const detail = detailed.value && !current.closed ? live.value.detail : ''
    const title = detail === '' ? label : `${label}${props.t('message.turnProcess.separator')}${detail}`
    const activity = current.closed ? current.summary.counts[0]?.kind ?? 'thinking' : live.value.activity
    return h('button', {
      type: 'button', class: css.title, 'aria-expanded': props.open, 'aria-controls': props.bodyId,
      'data-process-activity': activity,
      onClick: (event: MouseEvent) => { if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus(); props.toggle() },
    }, [
      h('span', { class: css.leading, 'aria-hidden': true }, [
        h('span', { class: css.activityIcon, 'data-step-process-icon': '' }, [PROCESS_ICONS[activity]]),
        h('span', { class: css.chevron, 'data-step-process-chevron': '' }, [
          h(props.open ? IconChevronUpOutlineRegular : IconChevronDownOutlineRegular),
        ]),
      ]),
      h(TextShimmer, { active: !current.closed }, { default: () => h(TextShimmer, { className: css.label ?? '' }, { default: () => title }) }),
    ])
  }
}, { name: 'ProcessGroupHeader', inheritAttrs: false, props: ['groupKey', 'useChatGroup', 'usePresentation', 't', 'open', 'bodyId', 'toggle'] })

/** Render a process group with local disclosure and outer-Turn visibility. */
export const ChatGroupSeat = defineComponent((props: ChatGroupSeatProps) => {
  const key = computed(() => props.groupKey)
  const members = props.useChatGroup(key, group => group?.members)
  const turn = props.useChatGroup(key, group => group?.data.turn)
  const closed = props.useChatGroup(key, group => group?.data.closed)
  const foldCompleted = props.usePresentation(policy => policy.foldCompletedTurns)
  const disclosure = useDisclosure()
  const firstKey = computed(() => members.value?.[0]?.key ?? '')
  const bottom = props.useChatNodeBottom(firstKey)
  const deferCollapse = computed(() => bottom.value === true && props.deferCollapse)
  const presentation = props.useChatNodeProcess(firstKey)
  const turnLocation = props.useChatNode(firstKey, (node) => {
    const location = node?.location
    return location?.kind === 'turn' || location?.kind === 'step' ? location.turn : undefined
  })
  const grouped = props.usePresentation(policy => policy.stepGrouping === 'collapsed'
    || (policy.stepGrouping === 'history' && turnLocation.value?.status !== 'open' && !deferCollapse.value))
  const alwaysOpen = computed(() => {
    const reason = turnLocation.value?.end?.data.reason.kind
    return presentation.value?.turnClosed === false || presentation.value?.hasInterleavedInput === true
      || reason === 'aborted' || reason === 'interrupted' || reason === 'error'
  })
  const spec = computed(() => presentation.value?.spec)
  const storedOpen = props.useStore(state => spec.value !== undefined && turnProcessOpen(state, spec.value, deferCollapse.value))
  const outerHidden = computed(() => foldCompleted.value && presentation.value?.turnClosed === true
    && spec.value !== undefined && !alwaysOpen.value && !storedOpen.value)
  const revealOuter = (): void => {
    const current = spec.value
    if (current !== undefined && !alwaysOpen.value) props.actions.setTurnProcessOpen(current.turn, current.answerStep ?? 0, true)
  }
  const rootRef = props.useGroupAction(outerHidden, revealOuter)
  const headerRef = shallowRef<HTMLDivElement | null>(null)
  const deferCompletedTurns = props.usePresentation(policy => policy.collapseTiming === 'next-input')
  props.useGroupHeaderAction(headerRef, () => !grouped.value || (deferCompletedTurns.value && outerHidden.value))
  watch([outerHidden, rootRef], () => {
    if (outerHidden.value && rootRef.value !== null && hiddenOrCollapsing(rootRef.value)) disclosure.value.setExpanded(false)
  }, { flush: 'post', immediate: true })
  const bodyRef = props.useGroupAction(() => grouped.value && !disclosure.value.expanded, () => { disclosure.value.setExpanded(true) })
  const contentRef = shallowRef<HTMLDivElement | null>(null)
  const bodyId = useId()
  const { edges, events, initialize } = useProcessScroll(bodyRef, contentRef, () => disclosure.value.expanded, grouped)
  const toggle = (): void => {
    if (!disclosure.value.expanded) initialize(closed.value === false ? 'bottom' : 'top')
    disclosure.value.toggle()
  }
  const shownCap = computed(() => !grouped.value ? false : disclosure.value.expanded ? true : undefined)
  const closingCap = ref(shownCap.value ?? true)
  watch(shownCap, (next) => { if (next !== undefined) closingCap.value = next }, { flush: 'sync' })
  return () => {
    if (members.value === undefined) return null
    const capped = grouped.value && (!deferCompletedTurns.value || (shownCap.value ?? closingCap.value))
    const classes = [css.body, !capped ? css.expandedBody : '',
      capped && edges.value.canScrollUp ? css.fadeTop : '', capped && edges.value.canScrollDown ? css.fadeBottom : '']
    const { groupKey, useChatGroup, useGroupHeaderAction: _headerAction, ...seat } = props
    return h('div', {
      ref: rootRef, class: css.root, 'data-chat-group-key': groupKey, 'data-chat-flow-key': groupKey,
      'data-chat-anchor-key': `group:${groupKey}`, 'data-chat-turn': turn.value,
      'data-chat-paging-anchor': grouped.value && !disclosure.value.expanded || undefined,
      'data-step-process': '', 'data-group-expanded-mode': !grouped.value || undefined,
    }, [
      h('div', { ref: headerRef }, [h(ProcessGroupHeader, {
        groupKey, useChatGroup, usePresentation: props.usePresentation, t: props.t,
        open: disclosure.value.expanded, bodyId, toggle,
      })]),
      h('div', { ref: bodyRef, id: bodyId, class: classes.join(' '), 'data-step-process-body': '',
        'data-scroll-up': edges.value.canScrollUp || undefined, 'data-scroll-down': edges.value.canScrollDown || undefined, ...events }, [
        h('div', { ref: contentRef, class: css.content, 'data-step-process-content': '', 'data-chat-flow': '' }, [
          h(GroupMembers, { ...seat, members: members.value }),
        ]),
      ]),
    ])
  }
}, { name: 'ChatGroupSeat', inheritAttrs: false, props: [...seatPropNames, 'groupKey', 'useChatGroup', 'useGroupHeaderAction'] })
