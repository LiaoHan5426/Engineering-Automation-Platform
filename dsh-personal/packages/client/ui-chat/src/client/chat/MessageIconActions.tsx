import { defineComponent, h, useId, type VNodeChild } from 'vue'
// Shared IconActions chrome for user and assistant messages: copy
// live, optional branch wiring, and an optional date-aware clock.
import { IconBranchOutlineRegular, IconCheckOutlineRegular, IconCopyOutlineRegular, Tooltip, useClipboardCopy } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import { formatMessageClock } from './message-chrome.ts'
import { useCalendarDay } from './use-calendar-day.ts'
import css from './MessageIconActions.module.css'
export interface MessageIconActionsProps {
  /** Plain text the copy action writes. */
  text: string
  /** Unix epoch ms for the clock label; omitted for transient messages. */
  time?: number | undefined
  /** Clock before icons (user) or after (assistant). */
  clock: 'start' | 'end'
  /** Fork the session at this message; omission hides the branch action. */
  onBranch?: (() => void) | undefined
  /** The message is not a completed transcript tail, so branch stays visible but unavailable. */
  branchUnavailable?: boolean | undefined
  /** Parent layout class composed onto the actions row. */
  className?: string | undefined
  /**
     * Slot-rendered actions owned by independent plugins, placed between the
     * built-in copy and branch controls.
     */
  extraActions?: VNodeChild
  /**
     * Icon-row Turn-usage trigger (the TurnUsagePanel pill), seated after the
     * branch control at the end of the icon cluster.
     */
  usageAction?: VNodeChild
  /** The owning view's locale seat, passed down as a plain prop. */
  t: ChatViewSlotProps['t']
}
/**
 * Copy / branch (/ clock) IconActions row shared by user and assistant chrome.
 * @param props - Copy text, event time, clock side, branch callback, className.
 * @returns The actions row element.
 */
export const MessageIconActions = defineComponent((props: MessageIconActionsProps) => {
  const day = useCalendarDay()
  const reasonId = useId()
  const { copied, onCopy } = useClipboardCopy(() => props.text)
  return () => {
    const { time, clock, onBranch, branchUnavailable = false, className, extraActions, usageAction, t } = props
    const clockEl = time === undefined ? null : (h('span', { 'class': clock === 'start' ? css.timeStart : css.timeEnd }, [
      formatMessageClock(time, t, day.value),
    ]))
    return (h('div', { 'class': className === undefined ? css.actions : `${css.actions} ${className}`, 'data-clock': clock }, [
      clock === 'start' ? clockEl : null,
      h(Tooltip, { 'label': copied.value ? t('copied') : t('copy'), 'side': 'bottom' }, { default: () => [
        h('button', { 'type': 'button', 'class': css.action, 'aria-label': copied.value ? t('copied') : t('copy'), 'onClick': onCopy }, [
          copied.value ? h(IconCheckOutlineRegular, null) : h(IconCopyOutlineRegular, null),
        ]),
      ] }),
      extraActions,
      onBranch !== undefined && (h(Tooltip, { 'label': branchUnavailable ? t('message.branchUnavailable') : t('message.branch'), 'side': 'bottom', 'openOnClick': branchUnavailable }, { default: () => [
        h('button', { 'type': 'button', 'class': css.action, 'aria-label': t('message.branch'), 'aria-disabled': branchUnavailable || undefined, 'aria-describedby': branchUnavailable ? reasonId : undefined, 'data-unavailable': branchUnavailable || undefined, 'onClick': branchUnavailable ? undefined : onBranch }, [
          h(IconBranchOutlineRegular, null),
        ]),
      ] })),
      onBranch !== undefined && branchUnavailable && (h('span', { 'id': reasonId, 'class': css.visuallyHidden }, [
        t('message.branchUnavailable'),
      ])),
      clock === 'end'
        ? h('span', { 'class': css.endInfo }, [
          usageAction,
          clockEl,
        ]) : usageAction,
    ]))
  }
}, { name: 'MessageIconActions', inheritAttrs: false, props: ['text', 'time', 'clock', 'onBranch', 'branchUnavailable', 'className', 'extraActions', 'usageAction', 't'] })
