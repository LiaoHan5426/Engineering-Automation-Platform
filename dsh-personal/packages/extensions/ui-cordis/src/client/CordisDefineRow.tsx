import { computed, defineComponent, Fragment, h, shallowRef, useId } from 'vue'
/** Read-only `cordis_define` card with Host and Client source tabs. */
import { CodeBlock, DisclosureRow, IconCodeOutlineRegular, IconInspectOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { cordisDefineCard, type CordisToolState } from './card-model.ts'
import type { CordisCardFace } from './slots.ts'
import { cordisVisibleStatus, type CordisVisibleStatus } from './status.ts'
import type { CordisKey } from './locales.ts'
import css from './CordisDefineRow.module.css'
import { CordisPreparingRow } from './CordisPreparingRow.tsx'
/** Full card props composed by the keyed Tool slot. */
export type CordisDefineRowProps = ToolCallViewProps & InjectFace<CordisCardFace> & PropsLocale<'cordis'>
type ViewProps<T = CordisDefineRowProps> = T extends CordisDefineRowProps ? Pick<T, 'phase' | 'toolName' | 'callId' | 'block' | 'inspect' | 't' | 'useInventory' | 'useLoaded'> : never
type CardReading = CordisVisibleStatus | 'removed'
type SourceTab = 'client' | 'host'
const READING_LABELS = {
  idle: 'status.idle',
  'client-pending': 'status.clientPending',
  running: 'status.running',
  removed: 'status.removed',
} as const satisfies Record<CardReading, CordisKey>
function stateStatus(state: CordisToolState): CordisKey | null {
  switch (state) {
    case 'running': return 'a11y.defining'
    case 'error': return 'a11y.failed'
    case 'stopped': return 'a11y.stopped'
    default: return null
  }
}
/** Render one immutable Package definition. */
export const CordisDefineRow = defineComponent((props: ViewProps) => () => {
  if (props.phase === 'preparing')
    return h(CordisPreparingRow, {
      ...props,
      'icon': h(IconCodeOutlineRegular, {
        'size': 14,
      }),
      'title': props.t('row.defineTitle'),
      'className': css.card,
      'rowClassName': css.row,
      'titleClassName': css.title,
    })
  return h(StartedCordisDefineRow, {
    ...props,
  })
}, { name: 'CordisDefineRow', inheritAttrs: false, props: ['phase', 'toolName', 'callId', 'block', 'inspect', 't', 'useInventory', 'useLoaded'] })
const StartedCordisDefineRow = defineComponent((props: Exclude<ViewProps, {
  phase: 'preparing'
}>) => {
  const inventory = props.useInventory(snapshot => snapshot)
  const loaded = props.useLoaded(snapshot => snapshot)
  const card = computed(() => cordisDefineCard(props.block))
  const expanded = shallowRef(false)
  const selectedSource = shallowRef<SourceTab>(card.value.clientCode !== null ? 'client' : 'host')
  const sourcePanelId = useId()
  return () => {
    const row = card.value.pluginId === null
      ? undefined
      : inventory.value.rows.find(candidate => candidate.pluginId === card.value.pluginId)
    const reading: CardReading = card.value.pluginId !== null && inventory.value.removed.has(card.value.pluginId)
      ? 'removed'
      : row !== undefined && card.value.packageId !== null
        ? cordisVisibleStatus(row, card.value.packageId, loaded.value)
        : 'idle'
    const name = card.value.name ?? props.callId
    const expandable = card.value.hostCode !== null || card.value.clientCode !== null || card.value.output !== null
    const open = expanded.value && expandable
    const a11yState = stateStatus(card.value.state)
    const hasSource = card.value.clientCode !== null || card.value.hostCode !== null
    const activeSource: SourceTab = selectedSource.value === 'client' && card.value.clientCode !== null
      ? 'client'
      : selectedSource.value === 'host' && card.value.hostCode !== null
        ? 'host'
        : card.value.clientCode !== null ? 'client' : 'host'
    const activeCode = activeSource === 'client' ? card.value.clientCode : card.value.hostCode
    return (h('div', {
      'class': css.card,
      'data-tool': 'cordis_define',
      'data-state': card.value.state,
      'data-terminal': reading === 'removed' || undefined,
      'data-cordis-plugin-id': card.value.pluginId ?? undefined,
      'data-cordis-package-id': card.value.packageId ?? undefined,
      'data-cordis-status': reading,
    }, [a11yState !== null && h('span', {
      'class': css.visuallyHidden,
    }, [props.t(a11yState)]), h(DisclosureRow, {
      'rowClassName': css.row,
      'titleClassName': css.title,
      'chevronClassName': css.chevron,
      'icon': h(IconCodeOutlineRegular, {
        'size': 14,
      }),
      'title': props.t('row.defineTitle'),
      'open': open,
      'expandable': expandable,
      'expandOnRowClick': true,
      'keepContentWhenOpen': true,
      'onToggle': () => { expanded.value = !expanded.value },
      'collapsedContent': (h(Fragment, null, [h('span', {
        'class': css.separator,
        'aria-hidden': true,
      }), h('span', {
        'class': card.value.errorSummary === null ? css.name : css.errorSummary,
      }, [card.value.errorSummary ?? name]), card.value.errorSummary === null && (h('span', {
        'class': css.purpose,
      }, [card.value.purpose ?? props.t('purpose.missing')])), card.value.pluginId !== null && (h('span', {
        'class': css.readout,
      }, [h('span', {
        'class': css.statusLabel,
      }, [props.t(READING_LABELS[reading])])]))])),
    }, {
      default: () => [h('div', {
        'class': css.bodyWrap,
      }, [hasSource && activeCode !== null && (h('section', {
        'class': css.sourceCard,
      }, [h('div', {
        'class': css.sourceTabs,
        'role': 'tablist',
        'aria-label': props.t('body.source'),
      }, [(['client', 'host'] as const).map((source) => {
        const available = source === 'client' ? card.value.clientCode !== null : card.value.hostCode !== null
        return (h('button', {
          'key': source,
          'id': `${sourcePanelId}-${source}`,
          'type': 'button',
          'role': 'tab',
          'aria-controls': sourcePanelId,
          'aria-selected': activeSource === source,
          'class': activeSource === source ? `${css.sourceTab} ${css.sourceTabActive}` : css.sourceTab,
          'disabled': !available,
          'onClick': () => { selectedSource.value = source },
        }, [props.t(source === 'client' ? 'body.clientCode' : 'body.hostCode')]))
      })]), h('div', {
        'id': sourcePanelId,
        'class': css.sourcePanel,
        'role': 'tabpanel',
        'aria-labelledby': `${sourcePanelId}-${activeSource}`,
      }, [h(CodeBlock, {
        'toolbarLabels': { codeLabel: props.t('codeBlock.title'), wrapLabel: props.t('codeBlock.wrap'), unwrapLabel: props.t('codeBlock.unwrap') },
        'code': activeCode,
        'lang': 'javascript',
        'copyLabel': props.t('body.copy'),
        'copiedLabel': props.t('body.copied'),
        'className': css.sourceCode,
      })])])), card.value.output !== null && (h('section', {
        'class': css.codeSection,
      }, [h('div', {
        'class': css.sectionLabel,
      }, [props.t('body.output')]), h('pre', {
        'class': css.output,
        'data-error': card.value.state === 'error' || undefined,
      }, [card.value.output])])), card.value.pluginId !== null && h('div', {
        'class': css.panelHint,
      }, [props.t('panel.hint')]), props.inspect !== undefined && (h('button', {
        'type': 'button',
        'class': css.inspectButton,
        'onClick': props.inspect,
      }, [h(IconInspectOutlineRegular, {}), props.t('action.inspect')]))])],
    })]))
  }
}, { name: 'StartedCordisDefineRow', inheritAttrs: false, props: ['phase', 'toolName', 'callId', 'block', 'inspect', 't', 'useInventory', 'useLoaded'] })
