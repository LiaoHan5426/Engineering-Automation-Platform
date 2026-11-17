import { defineComponent, h, ref, useId, type Component } from 'vue'
import { IconAgentPresetOutlineRegular, IconClockOutlineRegular, IconBranchOutlineRegular, IconChevronDownOutlineRegular, IconContextInjectionOutlineRegular, IconCordisPluginOutlineRegular, IconGoalOutlineRegular, IconGlobeOutlineRegular, IconPaperPlaneOutlineRegular, IconQueueOutlineRegular, IconUsersOutlineRegular, IconPlayOutlineRegular, type IconProps } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatNodeViewProps } from '../contract/slots.ts'
import { formatMessageClock } from './message-chrome.ts'
import { NoticeBody } from './ContextBody.tsx'
import { turnTriggerDetails, type TurnTriggerIcon } from './turn-trigger.ts'
import css from './TurnTriggerNodeView.module.css'
const TRIGGER_ICONS: Record<TurnTriggerIcon, Component<IconProps>> = {
  continue: IconPlayOutlineRegular,
  request: IconContextInjectionOutlineRegular,
  goal: IconGoalOutlineRegular,
  agent: IconPaperPlaneOutlineRegular,
  team: IconAgentPresetOutlineRegular,
  subagent: IconUsersOutlineRegular,
  github: IconBranchOutlineRegular,
  webhook: IconGlobeOutlineRegular,
  schedule: IconClockOutlineRegular,
  job: IconQueueOutlineRegular,
  plugin: IconCordisPluginOutlineRegular,
}
/** Render recorded trigger attribution above the whole-Turn disclosure. */
export const TurnTriggerNodeView = defineComponent((props: Pick<ChatNodeViewProps<'turn-trigger'>, 'node' | 't'>) => {
  const open = ref(false)
  const bodyId = useId()
  return () => {
    const { node, t } = props
    const details = turnTriggerDetails(node.data)
    const TriggerIcon = TRIGGER_ICONS[details.icon]
    if (details.compact)
      return (h('div', { 'class': css.continuation, 'data-generation-continuation': true }, [
        h('span', { 'class': css.icon, 'aria-hidden': true }, [
          h(TriggerIcon, { 'size': 14 }),
        ]),
        h('span', null, [
          t(details.title),
        ]),
      ]))
    const date = new Date(node.data.time)
    const time = formatMessageClock(node.data.time, t)
    return (h('section', { 'class': css.root, 'data-turn-trigger': true }, [
      h('button', { 'class': css.header, 'type': 'button', 'aria-expanded': open.value, 'aria-controls': bodyId, 'onClick': () => { open.value = !open.value } }, [
        h('span', { 'class': css.icon, 'aria-hidden': true }, [
          h(TriggerIcon, { 'size': 14 }),
        ]),
        h('span', { 'class': css.title }, [
          t(details.title),
        ]),
        h('time', { 'class': css.time, 'datetime': date.toISOString() }, [
          time,
        ]),
        h(IconChevronDownOutlineRegular, { 'size': 12, 'className': (open.value ? css.openChevron : css.chevron) ?? '' }),
      ]),
      open.value && h('div', { 'id': bodyId, 'class': css.body }, [
        h('p', { 'class': css.explanation }, [
          t('message.trigger.explanation'),
        ]),
        h('div', { 'class': css.content }, [
          h(NoticeBody, { 'content': node.data.content, 'source': node.data.source, 't': t }),
        ]),
      ]),
    ]))
  }
}, { name: 'TurnTriggerNodeView', inheritAttrs: false, props: ['node', 't'] })
