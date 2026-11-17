/** Frame-wide dynamic Plugin inventory, approvals, versions, and lifecycle actions. */
import { defineComponent, Fragment, h, shallowRef, watch } from 'vue'
import { IconCheckOutlineRegular, IconCloseOutlineRegular, IconCordisPluginOutlineRegular, IconPlayOutlineRegular, IconStopFillRegular, IconTrashOutlineRegular, StateDot, Tooltip, useDismissOnOutsidePointer, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { CordisRunActivity } from '@deepseek-ai/dsh-cordis-client-runner/client'
import type { SessionId } from '@deepseek-ai/dsh-api-remotes/client'
import type { CordisInventoryRow } from './dynamic-port.ts'
import type { CordisPanelFace } from './slots.ts'
import type { CordisKey } from './locales.ts'
import type { ApprovalRequestId, CordisDynamicPackageId, CordisDynamicPluginId } from './events.ts'
import { cordisVisibleStatus, packageOf, type CordisVisibleStatus } from './status.ts'
import css from './CordisPanel.module.css'
/** Full panel props composed by the sidebar footer-action slot. */
export type CordisPanelProps = PropsRuntime<'sidebar.footer.action'> & InjectFace<CordisPanelFace> & PropsLocale<'cordis'>
type PanelStatus = CordisVisibleStatus | 'awaiting-approval' | 'failed'
const STATUS_LABELS = {
  idle: 'status.idle',
  'awaiting-approval': 'status.awaitingApproval',
  'client-pending': 'status.clientPending',
  running: 'status.running',
  failed: 'status.failed',
} as const satisfies Record<PanelStatus, CordisKey>
const RENDER_FAILURE_LABELS = {
  abdicated: 'render.failedAbdicated',
  held: 'render.failedHeld',
} as const satisfies Record<'abdicated' | 'held', CordisKey>
interface RowView {
  readonly pluginId: CordisDynamicPluginId
  readonly agentId: SessionId
  readonly listed?: CordisInventoryRow
  readonly activity?: CordisRunActivity
}
function selectedPackageIdOf({ pluginId, listed, activity }: RowView, selected: Readonly<Record<string,
  CordisDynamicPackageId>>): CordisDynamicPackageId | undefined {
  const selectedPackageId = selected[pluginId]
  if (selectedPackageId !== undefined
        && listed?.packages.some(pkg => pkg.packageId === selectedPackageId))
    return selectedPackageId
  return listed?.nextPackageId
        ?? listed?.currentPackageId
        ?? listed?.packages.at(-1)?.packageId
        ?? activity?.packageId
}
function visiblePanelStatus(view: RowView, selectedPackageId: CordisDynamicPackageId | undefined,
  loaded: Parameters<typeof cordisVisibleStatus>[2]): PanelStatus {
  const { listed, activity } = view
  const latest = listed?.latestRun
  if (activity?.phase === 'awaiting-approval' || latest?.status === 'awaiting-approval') {
    return 'awaiting-approval'
  }
  if (latest?.status === 'failed' && latest.packageId === selectedPackageId)
    return 'failed'
  if (listed?.activeRun === undefined)
    return 'idle'
  return cordisVisibleStatus(listed, listed.activeRun.packageId, loaded)
}
function panelDotState(status: PanelStatus, busy: boolean): StateDotState {
  if (busy)
    return 'ongoing'
  switch (status) {
    case 'idle': return 'idle'
    case 'client-pending': return 'ongoing'
    case 'running': return 'done'
    case 'awaiting-approval': return 'warning'
    case 'failed': return 'error'
  }
}
function blockingFirst(rows: readonly RowView[]): readonly RowView[] {
  return [
    ...rows.filter(row => row.activity?.phase === 'awaiting-approval'),
    ...rows.filter(row => row.activity?.phase !== 'awaiting-approval'),
  ]
}
const RowAction = defineComponent((props: {
  label: string
}, { attrs, slots }) => () => h(Tooltip, { label: props.label, side: 'bottom', delayMs: 500 }, {
  default: () => h('button', { type: 'button', class: css.actionButton, 'aria-label': props.label, ...attrs }, slots.default?.()),
}), { name: 'CordisRowAction', inheritAttrs: false, props: ['label'] })
function DoubleCheckIcon() {
  return (h('span', {
    'class': css.doubleCheck,
    'aria-hidden': true,
  }, [h(IconCheckOutlineRegular, {
    'size': 12,
  }), h(IconCheckOutlineRegular, {
    'size': 12,
  })]))
}
/** Render the inventory panel and its unified footer action. */
type PanelViewProps = Pick<CordisPanelProps, 'wide' | 't' | 'useInventory' | 'useActiveRuns' | 'useRunErrors' | 'useLoaded' | 'useRenderFailures' | 'useSessions' | 'onRefresh' | 'onApprove' | 'onDecline' | 'onRun' | 'onStop' | 'onRemove'>
export const CordisPanel = defineComponent((props: PanelViewProps) => {
  const inventory = props.useInventory(snapshot => snapshot)
  const activeRuns = props.useActiveRuns(snapshot => snapshot)
  const errors = props.useRunErrors(snapshot => snapshot)
  const loaded = props.useLoaded(snapshot => snapshot)
  const renderFailures = props.useRenderFailures(snapshot => snapshot)
  const current = props.useSessions(state => Object.values(state.byId).find(session => (session.retainedBy.mainView ?? 0) > 0)?.id)
  const open = shallowRef(false)
  const selected = shallowRef<Record<string, CordisDynamicPackageId>>({})
  const pending = shallowRef<ReadonlySet<CordisDynamicPluginId>>(new Set())
  const actionErrors = shallowRef<ReadonlyMap<CordisDynamicPluginId, string>>(new Map())
  let visibleRequests = new Set<ApprovalRequestId>()
  const rootRef = shallowRef<HTMLDivElement | null>(null)
  const anchor = shallowRef<{ left: number; bottom: number }>()
  watch([open, rootRef], ([isOpen], _previous, cleanup) => {
    if (!isOpen) return
    const place = (): void => {
      const rect = rootRef.value?.getBoundingClientRect()
      if (rect !== undefined) anchor.value = { left: rect.left, bottom: window.innerHeight - rect.top + 8 }
    }
    place()
    window.addEventListener('resize', place)
    cleanup(() => { window.removeEventListener('resize', place) })
  }, { flush: 'post', immediate: true })
  useDismissOnOutsidePointer(rootRef, () => open.value, (value) => { open.value = value })
  watch(activeRuns, (runs) => {
    const now = new Set<ApprovalRequestId>()
    for (const activity of runs.values()) if (activity.phase === 'awaiting-approval') now.add(activity.requestId)
    const discovered = [...now].some(id => !visibleRequests.has(id))
    visibleRequests = now
    if (discovered) open.value = true
  }, { immediate: true, flush: 'post' })
  watch(() => props.onRefresh, (refresh) => { refresh() }, { immediate: true, flush: 'post' })
  watch([() => props.onRefresh, open], ([refresh, isOpen]) => { if (isOpen) refresh() }, { immediate: true, flush: 'post' })
  return () => {
    const byPlugin = new Map<CordisDynamicPluginId, RowView>()
    for (const listed of inventory.value.rows) {
      const activity = activeRuns.value.get(listed.pluginId)
      byPlugin.set(listed.pluginId, {
        pluginId: listed.pluginId,
        agentId: activity?.agentId ?? listed.agentId,
        listed,
        ...activity === undefined ? {} : { activity },
      })
    }
    for (const [pluginId, activity] of activeRuns.value) {
      if (byPlugin.has(pluginId))
        continue
      byPlugin.set(pluginId, { pluginId, agentId: activity.agentId, activity })
    }
    const all = [...byPlugin.values()]
    const mine = blockingFirst(all.filter(row => current.value !== undefined && row.agentId === current.value))
    const theirs = blockingFirst(all.filter(row => current.value === undefined || row.agentId !== current.value))
    const approvals = [...activeRuns.value.values()].filter(activity => activity.phase === 'awaiting-approval').length
    const running = all.filter(view => visiblePanelStatus(view, selectedPackageIdOf(view, selected.value), loaded.value) === 'running').length
    if (all.length === 0)
      return null
    const runAction = async (pluginId: CordisDynamicPluginId, action: () => Promise<void | {
      ok: boolean
      message?: string
    }>) => {
      if (pending.value.has(pluginId))
        return
      pending.value = (currentPending => new Set(currentPending).add(pluginId))(pending.value)
      actionErrors.value = ((currentErrors) => {
        const next = new Map(currentErrors)
        next.delete(pluginId)
        return next
      })(actionErrors.value)
      try {
        const result = await action()
        if (result !== undefined && !result.ok) {
          actionErrors.value = (currentErrors => new Map(currentErrors).set(pluginId, result.message ?? 'operation failed'))(actionErrors.value)
        }
      }
      catch (error) {
        actionErrors.value = (currentErrors => new Map(currentErrors).set(pluginId,
          error instanceof Error ? error.message : String(error)))(actionErrors.value)
      }
      finally {
        pending.value = ((currentPending) => {
          const next = new Set(currentPending)
          next.delete(pluginId)
          return next
        })(pending.value)
        props.onRefresh()
      }
    }
    const renderRow = (view: RowView) => {
      const { pluginId, listed, activity } = view
      const selectedPackageId = selectedPackageIdOf(view, selected.value)
      const selectedPackage = listed !== undefined && selectedPackageId !== undefined
        ? packageOf(listed, selectedPackageId)
        : undefined
      const activePackage = listed?.activeRun === undefined
        ? undefined
        : packageOf(listed, listed.activeRun.packageId)
      const name = selectedPackage?.name
        ?? (activity?.phase === 'awaiting-approval' ? activity.name : pluginId)
      const purpose = selectedPackage?.purpose
        ?? (activity?.phase === 'awaiting-approval' ? activity.purpose : '')
      const latest = listed?.latestRun
      const awaiting = activity?.phase === 'awaiting-approval'
        ? activity.requestId
        : latest?.status === 'awaiting-approval' ? latest.approvalRequestId : undefined
      const status = visiblePanelStatus(view, selectedPackageId, loaded.value)
      const busy = pending.value.has(pluginId) || activity?.phase === 'orchestrating'
      const failure = errors.value.get(pluginId)
      const hostFailure = latest?.status === 'failed' ? latest.error : undefined
      const renderFailure = renderFailures.value.get(pluginId)
      const actionError = actionErrors.value.get(pluginId)
      const nextPackageId = listed?.nextPackageId !== undefined
        && listed.nextPackageId !== listed.currentPackageId ? listed.nextPackageId : undefined
      const currentPackageId = listed?.currentPackageId
      const runMode = listed?.currentPackageId !== undefined
        && selectedPackageId !== listed.currentPackageId ? 'update' as const : 'run' as const
      return (h('li', {
        'key': pluginId,
        'class': css.row,
        'data-cordis-row': pluginId,
        'data-cordis-status': status,
        'data-cordis-awaiting': awaiting !== undefined || undefined,
      }, [h('div', {
        'class': css.rowHead,
      }, [h('span', {
        'class': css.rowId,
      }, [pluginId]), h('span', {
        'class': css.rowName,
      }, [name]), h('span', {
        'class': css.rowStatus,
      }, [h(StateDot, {
        'state': panelDotState(status, busy),
      }), h('span', {}, [props.t(STATUS_LABELS[status])])])]), listed !== undefined && listed.packages.length > 1 && selectedPackageId !== undefined && (h('label', {
        'class': css.versionPicker,
      }, [h('span', {}, [props.t('panel.version')]), h('select', {
        'value': selectedPackageId,
        'disabled': busy,
        'onChange': (event: Event) => {
          if (!(event.currentTarget instanceof HTMLSelectElement))
            return
          selected.value = (currentSelected => ({
            ...currentSelected,
            [pluginId]: event.currentTarget.value as CordisDynamicPackageId,
          }))(selected.value)
        },
      }, [listed.packages.map(pkg => (h('option', {
        'key': pkg.packageId,
        'value': pkg.packageId,
      }, [`${pkg.name} · ${pkg.packageId}`])))])])), h('div', {
        'class': css.rowDetail,
      }, [h('span', {
        'class': css.rowPurpose,
      }, [purpose]), h('div', {
        'class': css.rowActions,
      }, [awaiting !== undefined && (h(Fragment, null, [h(RowAction, {
        'label': props.t('action.approveOnce'),
        'data-cordis-approve': awaiting,
        'disabled': busy,
        'onClick': () => {
          void runAction(pluginId, async () => {
            await props.onApprove(awaiting, false)
            open.value = false
          })
        },
      }, {
        default: () => [h(IconCheckOutlineRegular, {
          'size': 14,
        })],
      }), h(RowAction, {
        'label': props.t('action.approvePlugin'),
        'data-cordis-approve-plugin': awaiting,
        'disabled': busy,
        'onClick': () => {
          void runAction(pluginId, async () => {
            await props.onApprove(awaiting, true)
            open.value = false
          })
        },
      }, {
        default: () => [h(DoubleCheckIcon, {})],
      }), h(RowAction, {
        'label': props.t('action.decline'),
        'data-cordis-decline': awaiting,
        'disabled': busy,
        'onClick': () => {
          void runAction(pluginId, async () => {
            await props.onDecline(awaiting)
            open.value = false
          })
        },
      }, {
        default: () => [h(IconCloseOutlineRegular, {
          'size': 14,
        })],
      })])), awaiting === undefined && listed !== undefined
                    && selectedPackageId !== undefined && listed.activeRun === undefined && (h(RowAction, {
        'label': props.t('action.run'),
        'data-cordis-switch': 'run',
        'disabled': busy,
        'onClick': () => {
          void runAction(pluginId, () => props.onRun({
            agentId: listed.agentId,
            pluginId,
            packageId: selectedPackageId,
            mode: runMode,
            hasClientHalf: selectedPackage?.hasClientHalf === true,
          }))
        },
      }, {
        default: () => [h(IconPlayOutlineRegular, {
          'size': 14,
        })],
      })), awaiting === undefined && listed !== undefined && listed.activeRun !== undefined
                    && selectedPackageId !== listed.activeRun.packageId && selectedPackage !== undefined && (h(RowAction, {
        'label': props.t('action.run'),
        'data-cordis-switch': 'run',
        'disabled': busy,
        'onClick': () => {
          void runAction(pluginId, () => props.onRun({
            agentId: listed.agentId,
            pluginId,
            packageId: selectedPackage.packageId,
            mode: runMode,
            hasClientHalf: selectedPackage.hasClientHalf,
          }))
        },
      }, {
        default: () => [h(IconPlayOutlineRegular, {
          'size': 14,
        })],
      })), awaiting === undefined && listed !== undefined && listed.activeRun !== undefined && status === 'client-pending'
                    && activePackage !== undefined && selectedPackageId === listed.activeRun.packageId && (h(RowAction, {
        'label': props.t('action.run'),
        'data-cordis-switch': 'run',
        'disabled': busy,
        'onClick': () => {
          void runAction(pluginId, () => props.onRun({
            agentId: listed.agentId,
            pluginId,
            packageId: activePackage.packageId,
            mode: 'run',
            hasClientHalf: true,
          }))
        },
      }, {
        default: () => [h(IconPlayOutlineRegular, {
          'size': 14,
        })],
      })), awaiting === undefined && listed !== undefined && listed.activeRun !== undefined && (h(RowAction, {
        'label': props.t('action.stop'),
        'data-cordis-switch': 'stop',
        'disabled': busy,
        'onClick': () => { void runAction(pluginId, () => props.onStop(listed.agentId, pluginId)) },
      }, {
        default: () => [h(IconStopFillRegular, {
          'size': 14,
        })],
      })), awaiting === undefined && listed !== undefined && (h(RowAction, {
        'label': props.t('action.remove'),
        'data-cordis-remove': pluginId,
        'disabled': busy,
        'onClick': () => { void runAction(pluginId, () => props.onRemove(listed.agentId, pluginId)) },
      }, {
        default: () => [h(IconTrashOutlineRegular, {
          'size': 14,
        })],
      }))])]), awaiting === undefined && nextPackageId !== undefined && listed !== undefined && (h('div', {
        'class': css.transition,
      }, [h('span', {}, [currentPackageId === undefined ? '' : props.t('panel.current', { packageId: currentPackageId })]), h('span', {}, [props.t('panel.next', { packageId: nextPackageId })]), h('div', {
        'class': css.transitionActions,
      }, [h('button', {
        'type': 'button',
        'disabled': busy,
        'onClick': () => {
          void runAction(pluginId, () => props.onRun({
            agentId: listed.agentId,
            pluginId,
            packageId: nextPackageId,
            mode: currentPackageId === undefined ? 'run' : 'update',
            hasClientHalf: packageOf(listed, nextPackageId)?.hasClientHalf === true,
          }))
        },
      }, [props.t('action.retry')]), currentPackageId !== undefined && (h('button', {
        'type': 'button',
        'disabled': busy,
        'onClick': () => {
          void runAction(pluginId, () => props.onRun({
            agentId: listed.agentId,
            pluginId,
            packageId: currentPackageId,
            mode: 'run',
            hasClientHalf: packageOf(listed, currentPackageId)?.hasClientHalf === true,
          }))
        },
      }, [props.t('action.rollback')]))])])), failure !== undefined && (h('div', {
        'class': css.rowError,
        'role': 'alert',
      }, [`${failure.message} (${failure.reason})`])), failure === undefined && hostFailure !== undefined && (h('div', {
        'class': css.rowError,
        'role': 'alert',
      }, [`${hostFailure.message} (${hostFailure.phase})`])), actionError !== undefined && h('div', {
        'class': css.rowError,
        'role': 'alert',
      }, [actionError]), renderFailure !== undefined && (h('div', {
        'class': css.rowError,
        'role': 'alert',
        'data-cordis-render-failure': renderFailure.slot,
        'data-cordis-render-abdicated': renderFailure.abdicated || undefined,
      }, [`${props.t(RENDER_FAILURE_LABELS[renderFailure.abdicated ? 'abdicated' : 'held'], {
        slot: renderFailure.slot,
      })} ${renderFailure.message}`])), activePackage !== undefined && activePackage.packageId !== selectedPackageId && (h('span', {
        'class': css.activeVersion,
      }, [`${props.t('status.running')}: ${activePackage.name} · ${activePackage.packageId}`]))]))
    }
    return (h('div', {
      'ref': rootRef,
      'class': props.wide ? css.layer : `${css.layer} ${css.rail}`,
    }, [open.value && anchor.value !== undefined && (h('section', {
      'class': css.panel,
      'style': { left: `${anchor.value.left}px`, bottom: `${anchor.value.bottom}px` },
      'data-cordis-panel': true,
      'aria-label': props.t('panel.title'),
    }, [h('header', {
      'class': css.header,
    }, [h('span', {
      'class': css.title,
    }, [props.t('panel.title')])]), h('div', {
      'class': css.body,
    }, [inventory.value.error !== undefined && (h('p', {
      'class': css.readError,
      'role': 'alert',
    }, [props.t('panel.readFailed', { message: inventory.value.error })])), !inventory.value.read && inventory.value.error === undefined && h('p', {
      'class': css.note,
    }, [props.t('panel.loading')]), inventory.value.read && all.length === 0 && h('p', {
      'class': css.note,
    }, [props.t('panel.empty')]), mine.length > 0 && (h('section', {}, [h('h3', {
      'class': css.group,
    }, [props.t('panel.group.current')]), h('ul', {
      'class': css.rows,
    }, [mine.map(renderRow)])])), theirs.length > 0 && (h('section', {}, [h('h3', {
      'class': css.group,
    }, [props.t('panel.group.others')]), h('ul', {
      'class': css.rows,
    }, [theirs.map(renderRow)])]))])])), h('div', {
      'class': css.footerButtons,
    }, [h('button', {
      'type': 'button',
      'class': css.badge,
      'data-cordis-badge': all.length,
      'data-cordis-approval-badge': approvals,
      'data-active': approvals > 0 || undefined,
      'aria-label': props.t('panel.plugins.aria'),
      'aria-expanded': open.value,
      'onClick': () => { open.value = (value => !value)(open.value) },
    }, [h(IconCordisPluginOutlineRegular, {
      'size': props.wide ? 16 : 18,
    }), props.wide && (h(Fragment, null, [h('span', {
      'class': css.badgeLabel,
    }, [props.t('panel.trigger')]), h('span', {
      'class': css.badgeCount,
    }, [props.t('panel.runningCount', { count: running })])]))])])]))

  }
}, { name: 'CordisPanel', inheritAttrs: false, props: ['wide','useSessions','useInventory','useActiveRuns','useRunErrors','useLoaded','useRenderFailures','onApprove','onDecline','onRun','onStop','onRemove','onRefresh','t'] })
