import { defineComponent, h, useId } from 'vue'
import { Button, IconFlatListOutlineRegular, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import { panelElementId, toggleElementId } from './element-ids.ts'
import type { SessionPanelToggleProps } from './slots.ts'
import { presentationOf } from './visibility.ts'
import css from './SessionPanelToggle.module.css'
/** Accessible session header toggle, including section indicators. */
export const SessionPanelToggle = defineComponent((p: SessionPanelToggleProps) => {
  const nameId = useId(), indicatorsId = useId()
  const dockable = p.useDockable(entries => entries.get(p.sessionId))
  const visibility = p.useVisibility(v => v)
  return () => {
    const shown = presentationOf(dockable.value === true, visibility.value, p.sessionId) !== 'hidden'
    const available = dockable.value !== undefined, open = available && shown
    const label = available ? p.t(open ? 'toggle.hide' : 'toggle.show') : p.t('toggle.unavailable')
    return h(Tooltip, { label, side: 'bottom', delayMs: 500 }, { default: () => h(Button, { size: 'sm', id: toggleElementId(p.sessionId), class: css.trigger, 'aria-expanded': open, 'aria-controls': open ? panelElementId(p.sessionId) : undefined, 'aria-disabled': available ? undefined : true, 'aria-labelledby': nameId + ' ' + indicatorsId, 'data-session-panel-toggle': '', onClick: () => p.toggle(p.sessionId) }, { default: () => [h(IconFlatListOutlineRegular, { size: 16 }), h('span', { id: nameId, class: css.name }, p.t('panel.name')), h('span', { id: indicatorsId, class: css.indicators }, [p.renderSlot('conversation.session.panel.indicator', { panelShown: open })])] }) })
  }
}, { props: ['sessionId', 'useDockable', 'useVisibility', 'toggle', 'renderSlot', 't'] })
