import { h, defineComponent, computed, shallowRef } from 'vue'
import { DisclosureRow, IconAppsAddOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './ProposeRow.module.css'
type ProposeRowProps = ToolCallViewProps & PropsLocale<'actionCards'>
/** Call states with row copy; a preparing call has no complete arguments yet. */
type RowState = 'preparing' | 'running' | 'ok' | 'error' | 'stopped'
function stateOf(props: ProposeRowProps): RowState {
  if (props.phase === 'preparing') return 'preparing'
  if (props.phase === 'start') return 'running'
  if (props.block.error?.code === 'interrupted') return 'stopped'
  return props.block.isError ? 'error' : 'ok'
}
/**
 * Render a `propose_action` call from its recorded arguments and result. Only a refused call expands, to show
 * why no card followed the answer.
 * @param props - tool call and localized status copy.
 * @returns the status row.
 */
export const ProposeRow = defineComponent(
  (props: ProposeRowProps) => {
    const expanded = shallowRef(false)
    const state = computed(() => stateOf(props))
    const title = computed(() => props.block.args.text('title') ?? '')
    const reason = computed(() =>
      props.phase === 'result' && props.block.isError
        ? props.block.content
          .flatMap(item => (item.type === 'text' ? [item.text] : []))
          .join('\n')
        : '',
    )
    return () => {
      return h('div', { 'data-tool': 'propose_action', 'data-state': state.value }, [
        h(
          DisclosureRow,
          {
            title: props.t('row.title'),
            icon: h(IconAppsAddOutlineRegular, { size: 14 }),
            running: state.value === 'preparing' || state.value === 'running',
            open: expanded.value && reason.value !== '',
            expandable: reason.value !== '',
            expandOnRowClick: true,
            keepContentWhenOpen: true,
            onToggle: () => {
              expanded.value = (value => !value)(expanded.value)
            },
            collapsedContent: h('span', { class: css.summary }, [
              h('span', {}, [props.t(`row.${state.value}`)]),
              h('span', { class: css.title }, [title.value]),
            ]),
          },
          {
            default: () => [
              h('pre', { class: css.reason }, [reason.value]),
              props.inspect &&
                h('button', { type: 'button', class: css.inspect, onClick: props.inspect }, [
                  props.t('row.inspect'),
                ]),
            ],
          },
        ),
      ])
    }
  },
  {
    props: ['phase', 'block', 't', 'inspect'],
    inheritAttrs: false,
  },
)
