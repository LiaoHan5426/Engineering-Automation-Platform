/** General Settings row for the Composer's busy-state Enter preference. */
import { defineComponent, h, ref } from 'vue'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { IconChevronDownOutlineRegular, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import type { BusyEnterBehavior } from '../contract/composer-submission.ts'
import type { ConversationKey } from '../locales.ts'
import css from './EnterBehaviorRow.module.css'

/** Registration-side preference face. */
export interface EnterBehaviorRowInjected {
  hooks: {
    /** Persisted busy-state preference bound as useBusyEnter. */
    busyEnter: SnapshotStore<BusyEnterBehavior>
  }
  /** Change the busy-state plain-Enter behavior. */
  setBusyEnter: (behavior: BusyEnterBehavior) => void
}

/** Full Settings-row props. */
export type EnterBehaviorRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'conversation'>
  & InjectFace<EnterBehaviorRowInjected>

const OPTIONS: readonly {
  id: BusyEnterBehavior
  label: ConversationKey
}[] = [
  { id: 'queue', label: 'settings.enter.queue' },
  { id: 'steer', label: 'settings.enter.steer' },
]

/**
 * Render the busy-state Enter behavior selector.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export const EnterBehaviorRow = defineComponent((props: EnterBehaviorRowProps) => {
  const behavior = props.useBusyEnter(value => value)
  const open = ref(false)
  return () => h('div', { class: css.row }, [
    h('div', { class: css.rowText }, [
      h('div', { class: css.title }, props.t('settings.enter.title')),
      h('div', { class: css.desc }, props.t('settings.enter.description')),
    ]),
    h(Menu, {
      open: open.value,
      onClose: () => { open.value = false },
      items: OPTIONS.map(option => ({ id: option.id, label: props.t(option.label) })),
      selectedId: behavior.value,
      onSelect: (id: string) => {
        const option = OPTIONS.find(candidate => candidate.id === id)
        if (option === undefined) return
        open.value = false
        props.setBusyEnter(option.id)
      },
      align: 'end',
      portal: true,
    }, {
      anchor: () => h('button', {
        type: 'button', class: css.selector,
        'aria-haspopup': 'menu', 'aria-expanded': open.value,
        onClick: () => { open.value = !open.value },
      }, [
        props.t(behavior.value === 'queue' ? 'settings.enter.queue' : 'settings.enter.steer'),
        h(IconChevronDownOutlineRegular, { className: css.chevron ?? '' }),
      ]),
    }),
  ])
}, { name: 'EnterBehaviorRow', inheritAttrs: false, props: ['useBusyEnter', 'setBusyEnter', 't'] })
