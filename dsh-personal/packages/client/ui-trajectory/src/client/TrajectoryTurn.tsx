import { defineComponent, h } from 'vue'
// TrajectoryTurn: sticky Turn header plus the padded Message/Step body.
import { TrajectoryTurnHeader } from './TrajectoryTurnHeader.tsx'
import type { TrajectoryTranslate } from './locales.ts'
import css from './TrajectoryTurn.module.css'
export interface TrajectoryTurnProps {
  /** 1-based turn index for the sticky header. */
  turn: number
  /** Message / Step headers and TrajectoryCell rows. */
  /** Trajectory locale seat. */
  t: TrajectoryTranslate
}
/**
 * Render one turn section (sticky header + body).
 * @param props - turn index and body children.
 * @returns the turn section element.
 */
export const TrajectoryTurn = defineComponent((props: TrajectoryTurnProps, { slots }) => {
  return () => {
    return (h('section', { 'class': css.root, 'data-turn': props.turn }, [
      h(TrajectoryTurnHeader, { 'turn': props.turn, 't': props.t }),
      h('div', { 'class': css.body }, [
        slots.default?.(),
      ]),
    ]))
  }
}, { name: 'TrajectoryTurn', inheritAttrs: false, props: ['turn', 't'] })
