import { h, Fragment, defineComponent, shallowRef, type VNodeChild } from 'vue'
import { IconChevronDownOutlineRegular, IconInspectOutlineRegular, IconSkillOutlineRegular, TextShimmer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StartedToolCallViewProps, ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SkillRow.module.css'
/** Skill row lifecycle derived solely from the durable call slice. */
type SkillRowState = 'running' | 'ok' | 'error' | 'stopped'
type SkillRowProps = ToolCallViewProps & PropsLocale<'skill'>
/** Compact, replay-stable view model for the dedicated row. */
interface SkillRowModel {
  readonly name: string
  readonly output: string | null
  readonly errorSummary: string | null
  readonly state: SkillRowState
}
/** First physical line for the collapsed error summary and malformed-args fallback. */
function firstLine(text: string): string {
  const newline = text.indexOf('\n')
  return newline === -1 ? text : text.slice(0, newline)
}
/** Skill names are the only call argument the compact row presents. */
function skillName(argsRaw: string, callId: string): string {
  try {
    const parsed: unknown = JSON.parse(argsRaw)
    if (typeof parsed === 'object' && parsed !== null) {
      const name = (parsed as Record<string, unknown>).name
      if (typeof name === 'string' && name !== '')
        return firstLine(name)
    }
  }
  catch {
    // Streaming can expose a truncated JSON prefix; its first line is still
    // more useful than replacing the call with an unrelated catalog lookup.
  }
  return argsRaw === '' ? callId : firstLine(argsRaw)
}
/** Flatten durable result blocks under the generic Tool-row text contract.
 *  Keep aligned with ui-tool's models/tool-call-model.ts `resultText`. */
function resultText(block: StartedToolCallViewProps['block']): string | null {
  if (!('kind' in block))
    return null
  const parts: string[] = []
  for (const item of block.content) {
    parts.push(item.type === 'text' ? item.text : JSON.stringify(item, null, 2))
  }
  if (parts.length === 0 && block.error !== undefined) {
    parts.push(`${block.error.name}: ${block.error.code}`)
  }
  return parts.join('\n') || null
}
/** Derive display state without consulting the live skill catalog. */
function skillRowModel(block: StartedToolCallViewProps['block']): SkillRowModel {
  const settled = 'kind' in block
  const argsRaw = (settled ? block.call?.argsRaw : block.argsRaw) ?? ''
  const state: SkillRowState = !settled
    ? 'running'
    : block.error?.code === 'interrupted'
      ? 'stopped'
      : block.isError ? 'error' : 'ok'
  const output = resultText(block)
  return {
    name: skillName(argsRaw, block.callId),
    output,
    errorSummary: state === 'error' && output !== null ? firstLine(output) : null,
    state,
  }
}
/** Leading disclosure slot: state icon at rest, chevron on hover or while open. */
function disclosureLeading(open: boolean, expandable: boolean): VNodeChild {
  if (open)
    return h(IconChevronDownOutlineRegular, { 'className': css.chevron ?? '' })
  const icon = h(IconSkillOutlineRegular, { 'size': 14 })
  if (!expandable)
    return icon
  return (h(Fragment, null, [h('span', { 'class': css.iconIdle }, [icon]), h(IconChevronDownOutlineRegular, { 'className': `${css.chevron} ${css.chevronHover}` })]))
}
/** Visually hidden state copy for the color-only running sweep and error tone. */
function stateStatus(state: SkillRowState, t: SkillRowProps['t']): string | null {
  switch (state) {
    case 'running': return t('row.running')
    case 'error': return t('row.failed')
    default: return null
  }
}
/**
 * Render one `skill` tool call as an accent summary and instructions disclosure.
 * @param props - keyed toolview payload plus the skill locale seat.
 * @returns the dedicated skill row.
 */
export const SkillRow = defineComponent((props: SkillRowProps) => {
  return () => {
    if (props.phase === 'preparing')
      return h('div', { 'class': css.card, 'data-tool': 'skill', 'data-state': 'preparing' }, [h('div', { 'class': css.row }, [h('span', { 'class': css.leading }, [h(IconSkillOutlineRegular, { 'size': 14 })]), h('span', { 'class': css.visuallyHidden }, [props.t('row.preparing')]), h(TextShimmer, { 'active': true, 'className': css.title ?? '' }, { 'default': () => [props.t('row.title')] })])])
    return h(StartedSkillRow, { ...props })
  }
}, { 'name': 'SkillRow', 'props': ['phase', 'block', 'inspect', 't'] })
const StartedSkillRow = defineComponent((props: Exclude<SkillRowProps, {
  phase: 'preparing'
}>) => {
  const expanded = shallowRef(false)
  return () => {
    const { block, inspect, t } = props
    const model = skillRowModel(block)
    const expandable = model.output !== null
    const open = expanded.value && expandable
    const status = stateStatus(model.state, t)
    const running = model.state === 'running'
    const summary = model.state === 'stopped' ? t('row.stopped') : model.errorSummary ?? model.name
    const toggleExpand = (): void => {
      expanded.value = (value => !value)(expanded.value)
    }
    const toggleFromKeyboard = (event: KeyboardEvent): void => {
      if (!expandable || (event.key !== 'Enter' && event.key !== ' '))
        return
      event.preventDefault()
      toggleExpand()
    }
    const disclosureProps = expandable ? {
      role: 'button' as const,
      tabindex: 0,
      'aria-expanded': open,
      onClick: toggleExpand,
      onKeydown: toggleFromKeyboard,
    } : {}
    const leading = disclosureLeading(open, expandable)
    return (h('div', { 'class': css.card, 'data-tool': 'skill', 'data-state': model.state }, [h('div', { 'class': css.row, 'data-expandable': expandable || undefined, ...disclosureProps }, [h('span', { 'class': css.leading }, [leading]), status !== null ? h('span', { 'class': css.visuallyHidden }, [status]) : null, h(TextShimmer, { 'active': running }, { 'default': () => [h('span', { 'class': css.title }, [h(TextShimmer, null, { 'default': () => [t('row.title')] })]), h('span', { 'class': css.separator, 'data-shimmer-decoration': true, 'aria-hidden': true }), h('span', { 'class': `${css.summary}${model.state === 'error' ? ` ${css.errorSummary}`
      : model.state === 'stopped' ? ` ${css.stoppedSummary}` : ''}` }, [h(TextShimmer, null, { 'default': () => [summary] })])] })]), open ? (h('div', { 'class': css.bodyWrap }, [h('section', { 'class': css.instructionsCard, 'aria-label': t('row.instructions') }, [h('div', { 'class': css.instructionsHeader }, [t('row.instructions')]), h('pre', { 'class': css.instructions, 'data-error': model.state === 'error' || undefined }, [model.output])]), inspect !== undefined ? (h('button', { 'type': 'button', 'class': css.inspectButton, 'onClick': inspect }, [h(IconInspectOutlineRegular), t('row.inspect')])) : null])) : null]))
  }
}, { 'name': 'StartedSkillRow', 'props': ['block', 'inspect', 't'] })
