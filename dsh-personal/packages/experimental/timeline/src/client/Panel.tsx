import { onMounted, computed, defineComponent, Fragment, h, useId, watch, shallowRef } from 'vue'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { PropsStore, ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { ConfigFormSnapshot } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { Config } from '../config.ts'
import { defaultReportCadence } from '../policy.ts'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type { createViewStore, ViewState } from './store.ts'
import { emptyDraft } from './store.ts'
import { Schedule } from './Schedule.tsx'
import { TaskTree } from './TaskTree.tsx'
import { Details } from './Details.tsx'
import type { DetailTarget } from './navigation.ts'
import type { AnnotationRequest, PriorityRequest, TaskRequest } from './actions.ts'
import { DiscussionHistory } from './Annotations.tsx'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { TreeTransferActions } from './TreeTransfer.tsx'
export interface PanelInjected extends TreeTransferActions {
  hooks: {
    clock: ObservableSnapshot<number>
    locale: ObservableSnapshot<{
      active: string
    }>
    settings: ObservableSnapshot<ConfigFormSnapshot<Config>>
    selection: ObservableSnapshot<SessionId | null>
  }
  requestTask: (request: TaskRequest) => Promise<void>
  setPriority: (request: PriorityRequest) => Promise<void>
  annotate: (request: AnnotationRequest) => Promise<{
    notified: boolean
  }>
  consumeSelection: () => void
}
type PanelProps = PropsRuntime<'sidebar.right.pane.tab'> & PropsLocale<'timeline'> & PropsStore<ReturnType<typeof createViewStore>> & InjectFace<PanelInjected>
/** Read the shared committed view; this panel owns only viewing choices. */
export const Panel = defineComponent((props: Pick<PanelProps, 'sessionId' | 'useProjection' | 'useStore' | 'actions' | 'useClock' | 'useLocale' | 'useSettings' | 't' | 'useSession' | 'requestTask' | 'setPriority' | 'annotate' | 'useTabInfo' | 'useSelection' | 'consumeSelection' | 'importTree' | 'removeTree'>) => {
  const id = useId()
  const locale = props.useLocale(value => value.active)
  const container = shallowRef<HTMLDivElement | null>(null)
  const restore = shallowRef<{
    scrollTop: number
    target: DetailTarget | null
  } | null>(null)
  const view = props.useProjection('timeline')
  const settings = props.useSettings(value => value.value)
  const state = props.useStore(value => value)
  const now = props.useClock(value => value)
  const playback = computed(() => {
    const viewSnapshot = view.value
    return ({ annotations: viewSnapshot?.annotations ?? [], trees: viewSnapshot?.trees ?? [], now: now.value })
  })
  const running = props.useSession(value => value.running)
  const selection = props.useSelection(value => (value === props.sessionId ? value : null))
  onMounted(() => watch(() => [selection.value], () => {
    if (selection.value === null)
      return
    props.actions.update({ tree: null, tab: 'tasks', details: { tasks: [], timeline: [] } })
    props.consumeSelection()
  }, { immediate: true, flush: 'post' }))
  const tabInfo = props.useTabInfo()
  const pages = computed(() => state.value.details[state.value.tab])
  const page = computed(() => pages.value.at(-1))
  const draftKey = computed(() => JSON.stringify(page.value?.target))
  onMounted(() => watch(() => [pages.value], () => {
    const root = container.value
    const page = restore.value
    if (root === null || page === null)
      return
    restore.value = null
    const target = page.target
    const control = target === null
      ? root.querySelector<HTMLButtonElement>('[data-detail-back]')
      : [...root.querySelectorAll<HTMLButtonElement>('[data-task-id],[data-report-id]')].find(button => target.kind === 'task'
        ? button.dataset.taskId === target.task && button.dataset.treeId === target.tree
        : button.dataset.reportId === target.report)
    // Child links return inside their disclosure; focus must not change the saved time position.
    control?.closest('details')?.setAttribute('open', '');
    (root.querySelector<HTMLElement>('.timeline-detail-scroll') ?? root).scrollTop = page.scrollTop;
    (control ?? root.querySelector<HTMLElement>('[role=tabpanel]'))?.focus({ preventScroll: true })
  }, { immediate: true, flush: 'post' }))
  const open = computed(() => (target: DetailTarget) => {
    // Detail links exist only while the panel is mounted.
    // oxlint-disable-next-line typescript/no-non-null-assertion
    const root = container.value!
    restore.value = { scrollTop: 0, target: null }
    props.actions.update({
      details: {
        ...state.value.details,
        [state.value.tab]: [
          ...pages.value,
          {
            target,
            scrollTop: (root.querySelector<HTMLElement>('.timeline-detail-scroll') ?? root).scrollTop,
          },
        ],
      },
    })
  })
  const back = computed(() => (previous: (typeof pages.value)[number]) => {
    restore.value = previous
    props.actions.update({ details: { ...state.value.details, [state.value.tab]: pages.value.slice(0, -1) } })
  })
  const tabIds = computed(() => ['tasks', 'timeline'] as const)
  return () => {
    const pageSnapshot = page.value
    const viewSnapshot = view.value
    return (h('div', { 'class': 'dsh-timeline', 'data-detail': pageSnapshot?.target.kind, 'ref': container, 'data-timeline-dock-open': tabInfo.value.sidebar.expanded && tabInfo.value.tab.visible }, [
      h('header', { 'class': 'timeline-panel-header' }, [
        h('span', null, [
          h('strong', null, [
            props.t('title'),
          ]),
          h('small', null, [
            props.t('guide'),
          ]),
        ]),
      ]),
      h('div', { 'class': 'timeline-tabs', 'role': 'tablist', 'aria-label': props.t('title') }, [
        tabIds.value.map(tab => (h('button', { 'key': tab, 'id': `${id}-${tab}`, 'data-tab': tab, 'role': 'tab', 'type': 'button', 'aria-selected': state.value.tab === tab, 'aria-controls': `${id}-content`, 'tabIndex': state.value.tab === tab ? 0 : -1, 'onClick': () => { props.actions.update({ tab }) }, 'onKeydown': (event: KeyboardEvent & {
          currentTarget: HTMLElement
        }) => {
          const index = tabIds.value.indexOf(tab)
          const next: ViewState['tab'] | undefined = event.key === 'Home'
            ? tabIds.value[0]
            : event.key === 'End'
              ? tabIds.value[1]
              : event.key === 'ArrowRight' || event.key === 'ArrowLeft'
                ? tabIds.value[(index + 1) % tabIds.value.length]
                : undefined
          if (next === undefined)
            return
          event.preventDefault()
          props.actions.update({ tab: next })
          event.currentTarget.parentElement
            ?.querySelector<HTMLButtonElement>(`[data-tab="${next}"]`)
            ?.focus()
        } }, [
          props.t(tab === 'tasks' ? 'tasks' : 'reports'),
          tab === 'timeline' && viewSnapshot !== undefined ? (h('span', { 'class': 'timeline-tab-count', 'aria-hidden': 'true' }, [
            viewSnapshot.reports.filter(report => report.source !== 'no-activity').length,
          ])) : null,
        ]))),
      ]),
      viewSnapshot === undefined ? (h('p', { 'role': 'status' }, [
        props.t('loading'),
      ])) : (h('div', { 'role': 'tabpanel', 'id': `${id}-content`, 'aria-labelledby': `${id}-${state.value.tab}`, 'tabIndex': 0 }, [
        pageSnapshot !== undefined ? (h(Details, { 'locale': locale.value, 'view': viewSnapshot, 'target': pageSnapshot.target, 'decimals': settings.value?.progressDecimals ?? 2, 'back': () => { back.value(pageSnapshot) }, 'open': open.value, 'requestTask': props.requestTask, 'playback': playback.value, 'setPriority': props.setPriority, 'annotate': props.annotate, 'annotationDraft': {
          draft: state.value.drafts[draftKey.value] ?? emptyDraft,
          update: (patch) => { props.actions.draft(draftKey.value, patch) },
        }, 't': props.t })) : state.value.tab === 'tasks' ? (h(TaskTree, { 'sessionId': props.sessionId, 'view': viewSnapshot, 'state': state.value, 'now': now.value, 'decimals': settings.value?.progressDecimals ?? 2, 'segmented': settings.value?.segmentedProgress ?? true, 'update': props.actions.update, 'toggle': props.actions.toggle, 'openTask': (tree, task) => { open.value({ kind: 'task', tree, task }) }, 'requestTask': props.requestTask, 'playback': playback.value, 'running': running.value, 'importTree': props.importTree, 'removeTree': async (tree) => {
          const result = await props.removeTree(tree)
          props.actions.forgetTree(tree)
          return result
        }, 't': props.t })) : (h(Fragment, null, [
          settings.value?.reportsEnabled === false ? (h('p', { 'class': 'timeline-notice', 'role': 'status' }, [
            props.t('reportsDisabled'),
          ])) : null,
          viewSnapshot.error ? (h('p', { 'class': 'timeline-error', 'role': 'alert' }, [
            props.t('failed'),
            ' ',
            viewSnapshot.error,
          ])) : null,
          h(Schedule, { 'locale': locale.value, 'cadence': settings.value ?? defaultReportCadence, 'view': viewSnapshot, 'state': state.value, 'now': now.value, 'update': props.actions.update, 'openReport': (report) => { open.value({ kind: 'report', report }) }, 't': props.t }),
        ])),
        pageSnapshot === undefined ? (h(DiscussionHistory, { 'locale': locale.value, 'view': viewSnapshot, 'open': state.value.historyOpen, 'onToggle': (historyOpen) => { props.actions.update({ historyOpen }) }, 't': props.t })) : null,
      ])),
    ]))
  }
}, { name: 'Panel', inheritAttrs: false, props: ['sessionId', 'useProjection', 'useStore', 'actions', 'useClock', 'useLocale', 'useSettings', 't', 'useSession', 'requestTask', 'setPriority', 'annotate', 'useTabInfo', 'useSelection', 'consumeSelection', 'importTree', 'removeTree'] })
