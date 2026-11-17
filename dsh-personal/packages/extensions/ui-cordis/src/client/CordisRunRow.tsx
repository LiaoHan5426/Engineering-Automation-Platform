import { computed, defineComponent, h, watchEffect } from 'vue'
/** `cordis_run` card and the host seat for Package-owned interactive UI. */
import { IconCodeOutlineRegular, IconInspectOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots'
import type { ToolCallViewProps } from '@deepseek-ai/dsh-client-ui-tool/client'
import { cordisRunCard } from './card-model.ts'
import { cordisToolViewKey } from './run-card-index.ts'
import type { CordisRunCardFace } from './slots.ts'
import { cordisVisibleStatus, type CordisVisibleStatus } from './status.ts'
import type { CordisKey } from './locales.ts'
import css from './CordisRunRow.module.css'
import { CordisPreparingRow } from './CordisPreparingRow.tsx'
/** Full Run-card props including its declared Package business-view child slot. */
export type CordisRunRowProps = ToolCallViewProps & InjectFace<CordisRunCardFace> & PropsRenderSlots<'tool.view.cordis'> & PropsLocale<'cordis'>
type ViewProps<T = CordisRunRowProps> = T extends CordisRunRowProps ? Pick<T, 'phase' | 'toolName' | 'callId' | 'block' | 'inspect' | 't' | 'renderSlot' | 'useInventory' | 'useLoaded' | 'useRunCards' | 'useActiveRuns' | 'onObserveRunCard'> : never
type RunReading = CordisVisibleStatus | 'awaiting-approval' | 'failed' | 'removed' | 'superseded'
const READING_LABELS = {
  idle: 'status.idle',
  'awaiting-approval': 'status.awaitingApproval',
  failed: 'status.failed',
  'client-pending': 'status.clientPending',
  running: 'status.running',
  removed: 'status.removed',
  superseded: 'status.superseded',
} as const satisfies Record<RunReading, CordisKey>
/** Render one activation result and, when eligible, its Package-owned view. */
export const CordisRunRow = defineComponent((props: ViewProps) => () => {
  if (props.phase === 'preparing')
    return h(CordisPreparingRow, {
      ...props,
      'icon': h(IconCodeOutlineRegular, {
        'size': 14,
      }),
      'title': props.t('row.runTitle'),
      'className': css.card,
      'rowClassName': css.row,
      'titleClassName': css.title,
    })
  return h(StartedCordisRunRow, {
    ...props,
  })
}, { name: 'CordisRunRow', inheritAttrs: false, props: ['phase', 'toolName', 'callId', 'block', 'inspect', 't', 'renderSlot', 'useInventory', 'useLoaded', 'useRunCards', 'useActiveRuns', 'onObserveRunCard'] })
const StartedCordisRunRow = defineComponent((props: Exclude<ViewProps, {
  phase: 'preparing'
}>) => {
  const inventory = props.useInventory(snapshot => snapshot)
  const loaded = props.useLoaded(snapshot => snapshot)
  const latest = props.useRunCards(snapshot => snapshot)
  const activeRuns = props.useActiveRuns(snapshot => snapshot)
  const card = computed(() => cordisRunCard(props.block))
  const key = computed(() => card.value.state === 'ok' && card.value.pluginId !== null && card.value.packageId !== null && card.value.pluginRunId !== null && card.value.seq !== null ? cordisToolViewKey(card.value.pluginId, card.value.packageId) : null)
  watchEffect(() => {
    const current = card.value
    if (key.value !== null && current.seq !== null && current.pluginRunId !== null)
      props.onObserveRunCard({ key: key.value, callId: props.callId, seq: current.seq, pluginRunId: current.pluginRunId })
  }, { flush: 'post' })
  return () => {
    const row = card.value.pluginId === null
      ? undefined
      : inventory.value.rows.find(candidate => candidate.pluginId === card.value.pluginId)
    const pointer = key.value === null ? undefined : latest.value.get(key.value)
    const superseded = pointer !== undefined && pointer.callId !== props.callId && pointer.seq >= (card.value.seq ?? -1)
    const activity = card.value.pluginId === null ? undefined : activeRuns.value.get(card.value.pluginId)
    const attempt = card.value.pluginRunId !== null && row?.latestRun?.pluginRunId === card.value.pluginRunId
      ? row.latestRun
      : undefined
    const awaitingApproval = attempt?.status === 'awaiting-approval' || (card.value.packageId !== null
            && activity?.phase === 'awaiting-approval'
            && activity.packageId === card.value.packageId
            && (card.value.mode === null || activity.mode === card.value.mode))
    const reading: RunReading = card.value.pluginId !== null && inventory.value.removed.has(card.value.pluginId)
      ? 'removed'
      : superseded
        ? 'superseded'
        : awaitingApproval
          ? 'awaiting-approval'
          : attempt?.status === 'failed'
            ? 'failed'
            : row !== undefined && card.value.packageId !== null
              ? cordisVisibleStatus(row, card.value.packageId, loaded.value)
              : 'idle'
    const status = props.t(READING_LABELS[reading])
    const summary = card.value.errorSummary
            ?? (card.value.pluginId === null ? props.callId : `${card.value.pluginId}${card.value.packageId === null ? '' : ` · ${card.value.packageId}`}`)
    const showBusiness = reading === 'running' && key.value !== null
    return (h('div', {
      'class': css.card,
      'data-tool': 'cordis_run',
      'data-state': card.value.state,
      'data-cordis-plugin-id': card.value.pluginId ?? undefined,
      'data-cordis-package-id': card.value.packageId ?? undefined,
      'data-cordis-run-id': card.value.pluginRunId ?? undefined,
      'data-cordis-status': reading,
    }, [h('div', {
      'class': css.row,
    }, [h('span', {
      'class': css.icon,
    }, [h(IconCodeOutlineRegular, {
      'size': 14,
    })]), h('span', {
      'class': css.title,
    }, [props.t(card.value.mode === 'update' ? 'row.updateTitle' : 'row.runTitle')]), h('span', {
      'class': css.separator,
      'aria-hidden': true,
    }), h('span', {
      'class': card.value.errorSummary === null ? css.summary : css.error,
    }, [summary]), h('span', {
      'class': css.status,
    }, [status]), props.inspect !== undefined && (h('button', {
      'type': 'button',
      'class': css.inspect,
      'aria-label': props.t('action.inspect'),
      'onClick': props.inspect,
    }, [h(IconInspectOutlineRegular, {})]))]), reading === 'removed' && h('div', {
      'class': css.message,
    }, [props.t('run.removed')]), reading === 'superseded' && h('div', {
      'class': css.message,
    }, [props.t('run.superseded')]), reading === 'failed' && attempt?.error !== undefined && (h('div', {
      'class': css.message,
    }, [attempt.error.message])), showBusiness && card.value.pluginId !== null && card.value.packageId !== null && card.value.pluginRunId !== null && (h('div', {
      'class': css.business,
      'data-cordis-business-view': key.value,
    }, [props.renderSlot('tool.view.cordis', {
      pluginId: card.value.pluginId,
      packageId: card.value.packageId,
      pluginRunId: card.value.pluginRunId,
    }, {
      entryKey: key.value,
      fallback: card.value.output === null ? null : h('pre', {
        'class': css.output,
      }, [card.value.output]),
    })])), !showBusiness && reading !== 'removed' && reading !== 'superseded' && card.value.output !== null && (h('pre', {
      'class': css.output,
    }, [card.value.output]))]))
  }
}, { name: 'StartedCordisRunRow', inheritAttrs: false, props: ['phase', 'toolName', 'callId', 'block', 'inspect', 't', 'renderSlot', 'useInventory', 'useLoaded', 'useRunCards', 'useActiveRuns', 'onObserveRunCard'] })
