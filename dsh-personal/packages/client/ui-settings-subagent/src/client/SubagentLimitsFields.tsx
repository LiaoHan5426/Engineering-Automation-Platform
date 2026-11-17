import { defineComponent, h, Fragment } from 'vue'
/** Delegation-limit fields inside the shared Subagent settings card. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { SettingsValueField } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  SubagentLimitsCardFace,
  SubagentLimitsCardState,
} from './subagent-limits-card-controller.ts'
import css from './SubagentLimitsFields.module.css'
/** Plain state and edit callbacks supplied by the owning card. */
export type SubagentLimitsFieldsProps = PropsLocale<'settings.subagent'> &
  Pick<SubagentLimitsCardFace, 'edit' | 'resetField'> & {
    state: SubagentLimitsCardState
  }
/**
 * Render the depth and capacity fields with their original validation and reset behavior.
 * @param props - Locale, staged fields, and edit callbacks.
 * @returns Two responsive fields and their application rules.
 */
export const SubagentLimitsFields = defineComponent(
  (props: SubagentLimitsFieldsProps) => {
    return () => {
      const { t, state } = props
      return h(Fragment, null, [
        h('div', { class: css.limits }, [
          h('div', { class: css.limit }, [
            h(SettingsValueField, {
              id: 'plugin-config-subagent-depth',
              label: t('subagentMaxDepth'),
              help: {
                label: t('subagentDepthHelpLabel'),
                content: h(Fragment, null, [
                  h('p', null, [t('subagentDepthHelp')]),
                  h('table', { class: css.depthTable, 'aria-label': t('subagentDepthHelpLabel') }, [
                    h('tbody', null, [
                      h('tr', null, [
                        h('th', { scope: 'row' }, [0]),
                        h('td', null, [t('subagentDepthZero')]),
                      ]),
                      h('tr', null, [
                        h('th', { scope: 'row' }, [1]),
                        h('td', null, [t('subagentDepthOne')]),
                      ]),
                    ]),
                  ]),
                  h('p', null, [t('subagentDepthOverride')]),
                ]),
              },
              overriddenLabel: t('overridden'),
              resetLabel: t('reset'),
              invalidLabel: t('subagentDepthInvalid'),
              numeric: true,
              disabled: !state.writable || state.saving,
              ...state.maxDepth,
              onEdit: (text) => {
                props.edit('maxDepth', text)
              },
              onReset: () => {
                props.resetField('maxDepth')
              },
            }),
          ]),
          h('div', { class: css.limit }, [
            h(SettingsValueField, {
              id: 'plugin-config-subagent-capacity',
              label: t('subagentMaxActive'),
              help: {
                label: t('subagentCapacityHelpLabel'),
                content: h('p', null, [t('subagentCapacityHelp')]),
              },
              overriddenLabel: t('overridden'),
              resetLabel: t('reset'),
              invalidLabel: t('subagentCapacityInvalid'),
              numeric: true,
              disabled: !state.writable || state.saving,
              ...state.maxActiveSubagents,
              onEdit: (text) => {
                props.edit('maxActiveSubagents', text)
              },
              onReset: () => {
                props.resetField('maxActiveSubagents')
              },
            }),
          ]),
        ]),
      ])
    }
  },
  { props: ['t', 'state', 'edit', 'resetField'] },
)
