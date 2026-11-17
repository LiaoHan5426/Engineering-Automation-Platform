import { defineComponent, h } from 'vue'
// TrajectoryTurnHeader: sticky per-turn bar with Input/Output/Think/Time labels.
import css from './TrajectoryTurnHeader.module.css'
import type { TrajectoryKey, TrajectoryTranslate } from './locales.ts'
const COLUMN_LABEL_KEYS: readonly TrajectoryKey[] = [
  'column.input', 'column.output', 'column.think', 'column.time',
]
export interface TrajectoryTurnHeaderProps {
  /** 1-based turn index shown as `Turn N`. */
  turn: number
  /** Trajectory locale seat. */
  t: TrajectoryTranslate
}
/**
 * Render the sticky turn header row.
 * @param props.turn - turn index.
 * @returns the sticky header element.
 */
export const TrajectoryTurnHeader = defineComponent((props: TrajectoryTurnHeaderProps) => {
  return () => {
    const { turn, t } = props
    return (h('div', { 'class': css.root }, [
      h('div', { 'class': css.inner }, [
        h('span', { 'class': css.title }, [
          t('turn.label', { turn }),
        ]),
        h('div', { 'class': css.columns, 'aria-hidden': 'true' }, [
          COLUMN_LABEL_KEYS.map(key => (h('span', { 'key': key, 'class': css.column }, [
            t(key),
          ]))),
        ]),
      ]),
    ]))
  }
}, { name: 'TrajectoryTurnHeader', inheritAttrs: false, props: ['turn', 't'] })
