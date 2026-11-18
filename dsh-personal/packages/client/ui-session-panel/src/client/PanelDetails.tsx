import { defineComponent, h } from 'vue'
import { IconClockOutlineRegular, IconDatabaseOutlineRegular, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { FactoryComponentPropsOf } from '@deepseek-ai/dsh-client-ui-slots'
import type { PanelDetailsFact } from './slots.ts'
import css from './PanelDetails.module.css'
const factIcons = { tokens: IconDatabaseOutlineRegular, duration: IconClockOutlineRegular } satisfies Record<PanelDetailsFact['kind'], typeof IconClockOutlineRegular>
/** Shared title, lines, status and measures on the row details surface. */
export const PanelDetails = defineComponent((p: FactoryComponentPropsOf<'conversation.session.panel.details'>) => () => h('div', { class: css.details, 'data-session-panel-details': '' }, [
  p.title !== undefined ? h('div', { class: css.title }, p.title) : null,
  ...(p.lines ?? []).map((line, index) => h('div', { key: index, class: css.line }, line)),
  p.status !== undefined ? h('div', { class: css.status }, [h(StateDot, { state: p.status.state }), h('span', null, p.status.label)]) : null,
  (p.facts ?? []).length ? h('div', { class: css.facts }, p.facts!.map(fact => h('span', { key: fact.kind, class: css.fact, 'data-fact': fact.kind }, [h('span', { class: css.factIcon, 'aria-hidden': 'true' }, [h(factIcons[fact.kind])]), fact.label]))) : null,
]), { props: ['title', 'lines', 'status', 'facts'] })
