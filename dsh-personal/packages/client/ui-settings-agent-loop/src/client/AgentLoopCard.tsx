import { defineComponent, h } from 'vue'
import { SettingsForm, SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { formLabels } from './locales.ts'
import type { AgentLoopCardFace } from './agent-loop-card-controller.ts'
/** Props the renderer binds for the agent-loop page. */
export type AgentLoopCardProps = PropsRuntime<'plugins.item'> &
  PropsLocale<'settings.agentLoop'> &
  InjectFace<AgentLoopCardFace>
/**
 * Render the agent loop's one-liner or its settings form, as the Plugins page asks.
 * @param props - the view asked for, locale copy, the form snapshot, and its actions.
 * @returns the one-liner, or the form.
 */
export const AgentLoopCard = defineComponent(
  (props: AgentLoopCardProps) => {
    const { t } = props
    const state = props.useAgentLoopCard(snapshot => snapshot)
    return () => {
      if (props.view === 'summary') return t('description')
      return h(
        SettingsForm,
        { labels: formLabels(t), state: state.value, onSave: props.save, onDiscard: props.discard },
        {
          default: () => [
            h(SettingsValueField, {
              id: 'plugin-config-agent-loop-parallel',
              label: t('maxParallel'),
              hint: t('maxParallelHint'),
              overriddenLabel: t('overridden'),
              resetLabel: t('reset'),
              invalidLabel: t('invalidNumber'),
              numeric: true,
              disabled: !state.value.writable,
              ...state.value.maxParallelToolCalls,
              onEdit: (text) => {
                props.edit('maxParallelToolCalls', text)
              },
              onReset: () => {
                props.resetField('maxParallelToolCalls')
              },
            }),
          ],
        },
      )
    }
  },
  { props: ['view', 't', 'useAgentLoopCard', 'save', 'discard', 'edit', 'resetField'] },
)
