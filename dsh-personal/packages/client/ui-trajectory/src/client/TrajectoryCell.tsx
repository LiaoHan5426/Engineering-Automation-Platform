import { defineComponent, Fragment, h } from 'vue'
// Legacy standalone trajectory cell retained for direct consumers and specs.
import { formatElapsedSeconds, type TrajectoryCellKind, type TrajectoryCellProps } from './trajectory-record.ts'
import type { TrajectoryKey, TrajectoryTranslate } from './locales.ts'
import css from './TrajectoryCell.module.css'
export { formatElapsedSeconds }
export type { AssistantMetricDetail, TrajectoryCellKind, TrajectoryCellProps } from './trajectory-record.ts'
/** Display label per kind (matches the design tags). */
const KIND_LABEL_KEY: Record<TrajectoryCellKind, TrajectoryKey> = {
  system: 'kind.system',
  user: 'kind.user',
  context: 'kind.context',
  compacted: 'kind.compacted',
  message: 'kind.message',
  tool: 'kind.tool',
  subtool: 'kind.sub',
}
const TAG_CLASS: Record<TrajectoryCellKind, string | undefined> = {
  system: css.tagSystem,
  user: css.tagUser,
  context: css.tagContext,
  compacted: css.tagSystem,
  message: css.tagMessage,
  tool: css.tagTool,
  subtool: css.tagSubtool,
}
/**
 * Render one trajectory step cell.
 * @param props - index, kind, text, time, and optional Message metrics.
 * @returns the cell element.
 */
export const TrajectoryCell = defineComponent((props: TrajectoryCellProps & {
  t: TrajectoryTranslate
}) => {
  return () => {
    const { t, index, kind, text, inputDetail: _inputDetail, promptDetail: _promptDetail,
      previousPromptDetail: _previousPromptDetail, outputDetail: _outputDetail, resultSeq: _resultSeq,
      thinkingDetail: _thinkingDetail, sourceBlocks: _sourceBlocks, outputBlocks: _outputBlocks,
      schemaDetail: _schemaDetail, assistantMetrics: _assistantMetrics, result: _result, callId: _callId,
      toolName: _toolName, isError: _isError, timeSeconds, startedAt: _startedAt, input, output, think, selected =
        false, class: className, ...rest } = props
    const rootClass = [
      css.root,
      selected ? css.selected : undefined,
      className,
    ].filter((c): c is string => c !== undefined).join(' ')
    const showMetrics = kind === 'message'
    return (h('div', { 'class': rootClass, 'data-kind': kind, 'data-selected': selected || undefined, ...rest }, [
      h('span', { 'class': css.index }, [
        '#',
        index,
      ]),
      h('span', { 'class': css.tagSlot }, [
        h('span', { 'class': [css.tag, TAG_CLASS[kind]].filter((c): c is string => c !== undefined).join(' ') }, [
          t(KIND_LABEL_KEY[kind]),
        ]),
      ]),
      h('span', { 'class': css.text }, [
        text,
      ]),
      h('span', { 'class': css.trailing }, [
        showMetrics ? (h(Fragment, null, [
          h('span', { 'class': css.metric }, [
            input ?? '',
          ]),
          h('span', { 'class': css.metric }, [
            output ?? '',
          ]),
          h('span', { 'class': css.metric }, [
            think ?? '',
          ]),
        ])) : null,
        h('span', { 'class': css.time }, [
          formatElapsedSeconds(timeSeconds, t),
        ]),
      ]),
    ]))
  }
}, { name: 'TrajectoryCell', inheritAttrs: true, props: ['t', 'index', 'kind', 'text', 'inputDetail', 'promptDetail', 'previousPromptDetail', 'outputDetail', 'resultSeq', 'thinkingDetail', 'sourceBlocks', 'outputBlocks', 'schemaDetail', 'assistantMetrics', 'result', 'callId', 'toolName', 'isError', 'timeSeconds', 'startedAt', 'input', 'output', 'think', 'selected', 'class'] })
