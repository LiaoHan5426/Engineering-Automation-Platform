import { defineComponent, h, onScopeDispose, ref } from 'vue'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconCloseCircleFillRegular, IconPlanOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { PlanChipInjected } from './index.ts'
import css from './PlanModeControl.module.css'

/** Runtime plan-seat, injected action and locale. */
export type PlanChipProps = PropsRuntime<'conversation.input.plan'> & InjectFace<PlanChipInjected> & PropsLocale<'plan'>

/** Show the authoritative effective plan target and execute /plan off. */
export const PlanChip = defineComponent((props: PlanChipProps) => {
  const plan = props.useProjection('plan')
  const leaving = ref(false)
  const error = ref<string | null>(null)
  let alive = true
  onScopeDispose(() => { alive = false })
  const off = (): void => {
    if (props.locked || leaving.value) return
    leaving.value = true
    error.value = null
    void props.exitPlanMode().then((failure) => {
      if (!alive) return
      leaving.value = false
      error.value = failure
    }, (reason: unknown) => {
      if (!alive) return
      leaving.value = false
      error.value = reason instanceof Error ? reason.message : String(reason)
    })
  }
  return () => {
    const current = plan.value
    if (current === undefined || !(current.pending ? !current.active : current.active)) return null
    return h('span', { class: css.wrap }, [
      h('button', { type: 'button', class: css.chip, 'aria-label': props.t('chip.on.aria'), title: props.t('chip.on.title'), disabled: props.locked || leaving.value, onClick: off }, [
        h('span', { class: css.glyph, 'aria-hidden': true }, [h(IconPlanOutlineRegular, { className: css.restGlyph ?? '', size: 14 }), h(IconCloseCircleFillRegular, { className: css.hoverGlyph ?? '', size: 14 })]),
        props.t('chip.label'),
      ]),
      error.value !== null ? h('span', { class: css.error, role: 'status', title: error.value }, props.t('chip.exitFailed')) : null,
    ])
  }
}, { name: 'PlanChip', inheritAttrs: false, props: ['useProjection', 'locked', 'exitPlanMode', 't'] })
