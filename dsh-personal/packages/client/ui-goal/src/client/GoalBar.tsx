/** Goal indicator above the composer. Durable state and activation remain owner-provided. */
import { computed, defineComponent, h, ref, watch, type VNodeChild } from 'vue'
import type { GoalActivation, GoalSnapshot } from '@deepseek-ai/dsh-goal/client'
import {
  IconCheckOutlineRegular, IconCloseOutlineRegular, IconEditOutlineRegular, IconGoalOutlineRegular,
  IconPauseOutlineRegular, IconPlayOutlineRegular, IconTrashOutlineRegular, InlineEditor, Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import type { GoalActionResult, GoalBarActions, GoalBarInjected } from './slots.ts'
import type { GoalKey } from './locales.ts'
import css from './GoalBar.module.css'

export interface GoalBarProps extends GoalBarActions {
  /** Undefined is absent/loading; null means no goal. */
  goal: GoalSnapshot | null | undefined
  activation?: GoalActivation
}

const PHASE_LABELS = {
  active: 'phase.active', paused: 'phase.paused', blocked: 'phase.blocked',
} as const satisfies Record<string, GoalKey>

function activeLabel(activation: GoalActivation | undefined, t: TranslateNS<'goal'>): string {
  return activation === 'disarmed' ? t('phase.active.disarmed') : t(PHASE_LABELS.active)
}

export const GoalBar = defineComponent((props: GoalBarProps & PropsLocale<'goal'>) => {
  const editing = ref(false)
  const draft = ref('')
  // A ref changes synchronously, closing the same-render duplicate-CAS window.
  const pending = ref(false)
  const actionError = ref<string | null>(null)
  const clearedGoalId = ref<GoalSnapshot['id'] | null>(null)
  watch(() => props.goal?.id, () => {
    editing.value = false
    actionError.value = null
    clearedGoalId.value = null
  }, { flush: 'sync' })

  async function runAction(action: () => Promise<GoalActionResult>): Promise<GoalActionResult | undefined> {
    if (pending.value) return undefined
    pending.value = true
    actionError.value = null
    const result = await action()
    pending.value = false
    if (!result.ok) actionError.value = `${result.error.message} (${result.error.code})`
    return result
  }
  async function handleEdit(): Promise<void> {
    const trimmed = draft.value.trim()
    if (trimmed === '') return
    const result = await runAction(() => props.onEdit(trimmed))
    if (result?.ok) editing.value = false
  }
  async function handleClear(id: GoalSnapshot['id']): Promise<void> {
    const result = await runAction(props.onClear)
    if (result?.ok) clearedGoalId.value = id
  }
  function actionButton(label: string, icon: VNodeChild, disabled: boolean, action: () => void): VNodeChild {
    return h(Tooltip, { portal: true, label, side: 'bottom', delayMs: 500 }, {
      default: () => h('button', {
        type: 'button', class: css.iconBtn, disabled, onClick: action, 'aria-label': label,
      }, [icon]),
    })
  }
  return () => {
    const goal = props.goal
    if (goal == null || goal.phase === 'complete' || goal.id === clearedGoalId.value) return null
    const error = actionError.value === null ? null : h('span', { class: css.error, role: 'alert' }, actionError.value)
    if (editing.value) {
      return h('div', { class: css.dock, 'data-goal-bar': '' }, [h('div', { class: [css.bar, css.editBar] }, [
        h(InlineEditor, {
          value: draft.value, label: props.t('objective.aria'),
          onChange: (value: string) => { draft.value = value },
          onSave: () => { void handleEdit() }, onCancel: () => { editing.value = false },
        }), error,
        h('div', { class: css.actions }, [
          actionButton(props.t('action.save'), h(IconCheckOutlineRegular, { size: 14 }), pending.value || draft.value.trim() === '', () => { void handleEdit() }),
          actionButton(props.t('action.cancel'), h(IconCloseOutlineRegular, { size: 14 }), pending.value, () => { editing.value = false }),
        ]),
      ])])
    }
    const label = goal.phase === 'active' ? activeLabel(props.activation, props.t) : props.t(PHASE_LABELS[goal.phase])
    const resume = goal.phase !== 'active' || props.activation === 'disarmed'
    return h('div', { class: css.dock, 'data-goal-bar': '' }, [h('div', {
      class: css.bar, title: goal.phase === 'blocked' ? goal.blockedReason?.message : undefined,
    }, [
      h('span', { class: css.goalGlyph }, [h(IconGoalOutlineRegular, { size: 14 })]),
      h('span', { class: css.label }, label), h('span', { class: css.objective }, goal.objective), error,
      h('div', { class: css.actions }, [
        actionButton(props.t('action.edit'), h(IconEditOutlineRegular, { size: 14 }), pending.value, () => { draft.value = goal.objective; editing.value = true }),
        actionButton(props.t('action.clear'), h(IconTrashOutlineRegular, { size: 14 }), pending.value, () => { void handleClear(goal.id) }),
        actionButton(props.t(resume ? 'action.resume' : 'action.pause'), h(resume ? IconPlayOutlineRegular : IconPauseOutlineRegular, { size: 14 }),
          pending.value || (!resume && props.activation === undefined), () => { void runAction(resume ? props.onResume : props.onPause) }),
      ]),
    ])])
  }
}, { name: 'GoalBar', inheritAttrs: false, props: ['goal', 'activation', 'onEdit', 'onPause', 'onResume', 'onClear', 't'] })

export type GoalDockProps =
  import('@deepseek-ai/dsh-client-ui-slots').PropsRuntime<'conversation.input.dock'>
  & InjectFace<GoalBarInjected>
  & PropsLocale<'goal'>

/** Bind each setup seat once; activation follows the current exact projected revision. */
export const GoalDock = defineComponent((props: GoalDockProps) => {
  const projection = props.useProjection('goal')
  const goal = computed(() => projection.value?.goal)
  const activation = props.useGoalActivation(next => (
    next.id === goal.value?.id && next.revision === goal.value?.revision ? next.activation : undefined
  ))
  return () => h(GoalBar, {
    goal: goal.value,
    ...(activation.value === undefined ? {} : { activation: activation.value }),
    onEdit: props.onEdit, onPause: props.onPause, onResume: props.onResume, onClear: props.onClear, t: props.t,
  })
}, {
  name: 'GoalDock', inheritAttrs: false,
  props: ['useProjection', 'useGoalActivation', 'onEdit', 'onPause', 'onResume', 'onClear', 't'],
})
