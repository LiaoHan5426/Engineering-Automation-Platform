import { onMounted, computed, defineComponent, Fragment, h, watch, shallowRef } from 'vue'
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Task } from '../records.ts'
import type { ProgressPrecision } from '../policy.ts'
import { progressStates } from '../tasks.ts'
import type { ProgressParts } from '../tasks.ts'
const partLabels = {
  done: 'completedWork',
  active: 'activeWork',
  pending: 'pendingWork',
  blocked: 'blockedWork',
} as const
type ProgressState = (typeof progressStates)[number]
/** Keep incomplete work below 100 at the chosen display precision. */
export function formatProgress(value: number, decimals: ProgressPrecision = 2): string {
  const percent = Math.max(0, Math.min(1, value)) * 100
  return Math.min(percent, value < 1 ? 100 - 10 ** -decimals : 100).toFixed(decimals)
}
/**
 * Show a task weight independently of the progress precision setting.
 * @param weight - the stored sibling weight.
 * @returns the weight rounded to at most two decimal places, without trailing zeros.
 */
export function formatWeight(weight: number): string {
  return String(Number(weight.toFixed(2)))
}
/** Stable, determinate progress with quiet motion only while work is active. */
export const Progress = defineComponent((props: {
  value: number
  status: Task['status']
  label: string
  decimals?: ProgressPrecision
  parts?: ProgressParts | undefined
} & PropsLocale<'timeline'>) => {
  const hovered = shallowRef<{
    part: ProgressState
    expanded: boolean
  } | null>(null)
  const dismissed = shallowRef(false)
  const select = computed(() => (part: ProgressState | undefined) => {
    hovered.value = part === undefined ? null : { part, expanded: false }
  })
  const clear = computed(() => () => {
    hovered.value = null
    dismissed.value = false
  })
  const segmented = computed(() => props.parts !== undefined)
  onMounted(() => watch(() => [hovered.value, segmented.value, dismissed.value], (_next, _previous, cleanup) => {
    const dispose0 = (() => {
      if (!segmented.value && (hovered.value !== null || dismissed.value)) {
        hovered.value = null
        dismissed.value = false
        return
      }
      if (hovered.value === null || hovered.value.expanded || !segmented.value || dismissed.value)
        return
      const selection = hovered.value
      const timer = setTimeout(() => {
        if (hovered.value === selection)
          hovered.value = { ...selection, expanded: true }
      }, 500)
      return () => { clearTimeout(timer) }
    })()
    if (typeof dispose0 === 'function')
      cleanup(dispose0)
  }, { immediate: true, flush: 'post' }))
  const describe = computed(() => (state: ProgressState) => {
    const part = props.parts?.[state]
    if (part === undefined)
      return ''
    const percent = state === 'done' ? formatProgress(part.fraction, (props.decimals ?? 2)) : (part.fraction * 100).toFixed((props.decimals ?? 2))
    return props.t(partLabels[state], { count: part.leaves, percent })
  })
  const breakdown = computed(() => progressStates.map(describe.value).join('\n'))
  const part = computed(() => hovered.value === null ? undefined : props.parts?.[hovered.value.part])
  const titles = computed(() => {
    const current = part.value
    const items = current?.titles.slice(0, current.leaves > 6 ? 5 : 6).map(title => `- ${title.replace(/\s+/gu, ' ').trim()}`) ?? []
    if (current !== undefined && current.leaves > 6)
      items.push('- ...')
    return items
  })
  const tooltip = computed(() => hovered.value === null ? breakdown.value : [describe.value(hovered.value.part), ...(hovered.value.expanded ? titles.value : [])].join('\n'))
  const work = computed(() => (props.parts?.done.fraction ?? 0) + (props.parts?.active.fraction ?? 0))
  const tip = computed(() => (props.parts?.active.fraction ?? 0) > 0 ? 'active' : 'done')
  const bar = computed(() => (h('div', { 'class': 'timeline-progress', 'data-status': props.status, 'data-segmented': props.parts === undefined ? undefined : true, 'role': 'progressbar', 'aria-label': props.label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Number(formatProgress(props.value, (props.decimals ?? 2))), 'aria-valuetext': props.parts === undefined ? `${formatProgress(props.value, (props.decimals ?? 2))}%` : breakdown.value, 'tabIndex': props.parts === undefined ? undefined : 0, 'aria-keyshortcuts': props.parts === undefined ? undefined : 'ArrowLeft ArrowRight', 'onMouseleave': clear.value, 'onBlur': clear.value, 'onFocus': () => {
    const part = progressStates.find(state => (props.parts?.[state].fraction ?? 0) > 0)
    select.value(part)
  }, 'onKeydown': (event: KeyboardEvent & {
    currentTarget: HTMLElement
  }) => {
    if (segmented.value && event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      hovered.value = null
      dismissed.value = true
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')
      return
    const visible = progressStates.filter(state => (props.parts?.[state].fraction ?? 0) > 0)
    if (visible.length === 0)
      return
    event.preventDefault()
    const current = hovered.value === null ? -1 : visible.indexOf(hovered.value.part)
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const index = current < 0
      ? direction === 1
        ? 0
        : visible.length - 1
      : (current + direction + visible.length) % visible.length
    select.value(visible[index])
  } }, [
    props.parts === undefined ? (h('span', { 'style': { width: cssLength(`${Math.max(0, Math.min(1, props.value)) * 100}%`) } })) : (h(Fragment, null, [
      progressStates.map(state => (h('span', { 'key': state, 'data-part': state, 'data-tip': state === tip.value ? true : undefined, 'aria-hidden': 'true', 'style': { width: cssLength(`${(props.parts?.[state].fraction ?? 0) * 100}%`) }, 'onMouseenter': () => { select.value(state) } }))),
      h('span', { 'class': 'timeline-progress-highlight', 'data-flow': props.status === 'active' && work.value > 0 ? true : undefined, 'aria-hidden': 'true', 'style': { width: cssLength(`${work.value * 100}%`) } }),
    ])),
  ])))
  return () => {
    return props.parts === undefined ? (bar.value) : (h(Tooltip, { 'label': tooltip.value, 'disabled': dismissed.value, 'side': 'top', 'portal': true, 'maxWidth': 360 }, { default: () => [
      bar.value,
    ] }))
  }
}, { name: 'Progress', inheritAttrs: false, props: ['value', 'status', 'label', 'decimals', 'parts', 't'] })
function cssLength(value: number | string | undefined): string | undefined { return typeof value === 'number' ? `${value}px` : value }
