/** Shared task section of the Session panel. */
import { computed, defineComponent, h, ref } from 'vue'
import type { TeamTaskView, TeamTaskId } from '@deepseek-ai/dsh-agent-team/client'
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import { HoverCard, HoverCardGroup, IconChevronDownOutlineRegular, StateDot, Tooltip, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRenderFactories, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session-panel/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { NS, type TeamKey } from './locales.ts'
import type { createTeamBoardStore } from './team-board-store.ts'
import css from './TeamBoard.module.css'
/** Full props of the task section body. */
export type TeamBoardProps = PropsRuntime<'conversation.session.panel.section'> & PropsRenderFactories & PropsStore<ReturnType<typeof createTeamBoardStore>> & PropsLocale<typeof NS>
/** Full props of progress beside the section title. */
export type TeamProgressProps = PropsRuntime<'conversation.session.panel.section.actions'> & PropsLocale<typeof NS>
type VisibleTask = TeamTaskView & { status: Exclude<TeamTaskView['status'], 'deleted'> }
const statusKeys = { pending: 'status.pending', in_progress: 'status.in_progress', completed: 'status.completed' } satisfies Record<VisibleTask['status'], TeamKey>
const dotStates = { pending: 'idle', in_progress: 'ongoing', completed: 'done' } satisfies Record<VisibleTask['status'], StateDotState>
function visibleTasks(tasks: readonly TeamTaskView[]): VisibleTask[] { return tasks.filter((task): task is VisibleTask => task.status !== 'deleted') }
function progressLabel(tasks: readonly VisibleTask[], t: TeamBoardProps['t']): string {
  const completed = tasks.filter(task => task.status === 'completed').length
  const active = tasks.filter(task => task.status === 'in_progress').length
  const pending = tasks.length - completed - active
  return [...completed > 0 ? [t('progress.completed', { count: completed })] : [], ...active > 0 ? [t('progress.active', { count: active })] : [], ...pending > 0 ? [t('progress.pending', { count: pending })] : []].join(' · ')
}
/** Render ordered tasks, keeping the five-row fold choice in the Session store. */
export const TeamBoard = defineComponent((props: TeamBoardProps) => {
  const team = props.useProjection('agentTeam')
  const unfolded = props.useStore(state => state.unfolded)
  const expandedTaskId = ref<TeamTaskId | null>(null)
  const ordered = computed(() => {
    const tasks = team.value?.enabled ? visibleTasks(team.value.tasks) : []
    return [...tasks.filter(task => task.status === 'in_progress'), ...tasks.filter(task => task.status === 'pending'), ...tasks.filter(task => task.status === 'completed').reverse()]
  })
  return () => {
    if (!team.value?.enabled || (ordered.value.length === 0 && team.value.failure === undefined)) return null
    const foldable = ordered.value.length > 6
    const tasks = foldable && !unfolded.value ? ordered.value.slice(0, 5) : ordered.value
    const label = unfolded.value ? props.t('list.less') : props.t('list.more', { count: ordered.value.length - 5 })
    return h('div', { class: css.board, 'data-team-panel': '' }, [
      team.value.failure !== undefined ? h('div', { class: css.error, role: 'alert' }, [h(StateDot, { state: 'error' }), props.t('failure', { message: team.value.failure })]) : null,
      tasks.length > 0 ? h(HoverCardGroup, null, { default: () => h('ul', { class: css.tasks }, tasks.map(task => {
        const owner = task.ownerName ?? task.ownerId ?? props.t('unowned')
        const blocked = task.status === 'pending' && !task.ready
        const state = blocked ? 'warning' : dotStates[task.status]
        const status = blocked ? props.t('blocked') : props.t(statusKeys[task.status])
        const expanded = expandedTaskId.value === task.id
        const detailsId = 'team-task-' + props.sessionId + '-' + task.id
        return h('li', { key: task.id, class: css.task, 'data-team-task': task.id, 'data-status': task.status, 'data-expanded': expanded }, [
          h(HoverCard, { grouped: true, disabled: expanded }, { anchor: () => h('button', { type: 'button', class: css.taskRow, 'aria-expanded': expanded, 'aria-controls': detailsId, onClick: () => { expandedTaskId.value = expanded ? null : task.id } }, [h('span', { class: css.glyph, role: 'img', 'aria-label': status }, [h(StateDot, { state })]), h('span', { class: css.subject }, task.subject), h('span', { class: css.chevron, 'aria-hidden': true }, [h(IconChevronDownOutlineRegular, { size: 14 })])]), default: () => props.renderFactorySlot('conversation.session.panel.details', { title: task.subject, lines: [props.t('hover.owner', { name: owner }), ...task.description ? [task.description] : []], status: { state, label: status } }) }),
          expanded ? h('div', { class: css.details, id: detailsId, 'data-team-task-details': '' }, [task.description ? h('p', { class: css.description }, task.description) : null, h('p', { class: css.owner, 'data-team-task-owner': '' }, [h('span', { class: css.ownerLabel }, props.t('owner') + ': '), h(Tooltip, { label: owner, onlyWhenClipped: true, delayMs: 500, portal: true, side: 'top' }, { default: () => h('span', { class: css.ownerValue }, owner) })])]) : null,
        ])
      })) }) : null,
      foldable ? props.renderFactorySlot('conversation.session.panel.fold', { expanded: unfolded.value, label, name: props.t('list.foldName', { label }), onToggle: () => { props.actions.unfoldedSet(!unfolded.value) } }) : null,
    ])
  }
}, { props: ['sessionId', 'useProjection', 'useStore', 'actions', 'renderFactorySlot', 't'], inheritAttrs: false })
/** Render task progress beside the panel section title. */
export const TeamProgress = defineComponent((props: TeamProgressProps) => {
  const team = props.useProjection('agentTeam')
  return () => {
    if (!team.value?.enabled) return null
    const progress = progressLabel(visibleTasks(team.value.tasks), props.t)
    return progress === '' ? null : h('span', { class: css.progress }, progress)
  }
}, { props: ['useProjection', 't'], inheritAttrs: false })
