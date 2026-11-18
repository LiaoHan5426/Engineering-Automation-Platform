import { defineComponent, h } from 'vue'
import { IconChevronDownOutlineRegular, IconChevronUpOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from './slots.ts'
/** Shared folding control for every panel list. */
export const PanelFold = defineComponent((p: FactoryComponentPropsOf<'conversation.session.panel.fold'>) => () => h('div', { 'data-session-panel-row': 'fold' }, [h('button', { type: 'button', 'data-row-part': 'body', 'aria-expanded': p.expanded, 'aria-label': p.name, onClick: p.onToggle }, [h('span', { 'data-row-part': 'icon', 'aria-hidden': 'true' }, [h(p.expanded ? IconChevronUpOutlineRegular : IconChevronDownOutlineRegular, { size: 14 })]), h('span', { 'data-row-part': 'content' }, p.label)])]), { props: ['expanded', 'label', 'name', 'onToggle'] })
