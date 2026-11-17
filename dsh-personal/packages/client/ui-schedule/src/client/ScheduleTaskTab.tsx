import clsx from 'clsx'
import { h, defineComponent, computed, shallowRef, watch } from 'vue'
import { IconClockOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type { ScheduleCatalogEntry } from '@deepseek-ai/dsh-schedule/client'
import type { CatalogSnapshot } from './catalog-source.ts'
import { CatalogFeedback } from './CatalogFeedback.tsx'
import { TaskDetail, useTaskDetail, type TaskDetailInjected } from './TaskDetail.tsx'
import type { TaskTabBindings } from './task-tab-bindings.ts'
import type { TaskEditorStoreProps } from './editor-store.ts'
import { useTaskTabTarget } from './task-tab-target.ts'
import css from './TaskManagerPage.module.css'
/** The Host task catalog the body, its chip, and the Tasks page all read. */
export interface ScheduleTaskCatalogInjected {
  /** Shared Host task catalog with its query and deletion state. */
  readonly hooks: {
    readonly catalog: HostObservable<CatalogSnapshot<ScheduleCatalogEntry>>
  }
}
/** The provider-owned recovery a restored tab page resolves its task through. */
export interface ScheduleTaskBindingInjected {
  /** Durable binding from one task tab page to the task it last showed. */
  readonly taskBindings: TaskTabBindings
}
/** Everything the task tab's body needs injected. */
export interface ScheduleTaskTabInjected
  extends TaskDetailInjected, ScheduleTaskCatalogInjected, ScheduleTaskBindingInjected {}
/** Props of the task tab's body: the tab it draws, localized copy, and its catalog face. */
export type ScheduleTaskTabProps = PropsRuntime<'sidebar.right.pane.tab'> &
  TaskEditorStoreProps &
  PropsLocale<'schedule.manager'> &
  InjectFace<ScheduleTaskTabInjected>
/**
 * Render the single task named by this tab's navigation parameters or by the
 * binding those parameters last wrote.
 *
 * When neither names a task, the body reports the catalog feedback until a read
 * requested after the baseline for the current navigation succeeds without the
 * task; the missing-task state then covers both an unbound restored tab and a
 * navigated tab whose task is gone.
 * @param props - tab information, the Host task catalog, localized copy, and action callbacks.
 * @returns the task's detail, or its centered loading, query-failure, or missing-task state.
 */
export const ScheduleTaskTab = defineComponent(
  (props: ScheduleTaskTabProps) => {
    const _projection0 = props.useTabInfo()
    const tab = computed(() => _projection0.value.tab)
    const _projection1 = useTaskTabTarget(
      () => props.sessionId,
      () => tab.value,
      () => props.taskBindings,
    )
    const navigated = computed(() => _projection1.value.navigated),
      navigation = computed(() => _projection1.value.navigation),
      recovered = computed(() => _projection1.value.recovered),
      params = computed(() => _projection1.value.params)
    const catalog = props.useCatalog(snapshot => snapshot)
    const detail = useTaskDetail(
      props,
      () => catalog.value,
      () => params.value?.id,
    )
    const task = computed(() => detail.value.task),
      catalogRecord = computed(() => detail.value.record)
    const navigationRevision = computed(() =>
      navigated.value ? tab.value.navigation.revision : undefined,
    )
    const baseline = shallowRef(
      (() => ({ revision: navigationRevision.value, request: catalog.value.readRequest }))(),
    )
    const answered = computed(
      () => catalog.value.settled && catalog.value.readSettled > baseline.value.request,
    )
    watch(
      [() => props.onRetry, () => baseline.value.request, () => task.value, () => answered.value],
      (_value, _previous) => {
        (() => {
          // The retained records leave this tab without a task and no read requested
          // after that baseline has succeeded: ask for one, naming the baseline ordinal.
          // A refresh shares only a read requested after that ordinal, so the read that
          // answers for this tab is never one sent before the baseline.
          if (task.value === undefined && !answered.value)
            void props.onRetry(baseline.value.request)
        })()

      },
      { immediate: true, flush: 'post' },
    )
    watch(
      [
        () => props.taskBindings,
        () => props.sessionId,
        () => tab.value.id,
        () => tab.value.kind,
        () => tab.value.contentId,
        () => navigation.value?.sessionId,
        () => navigation.value?.id,
      ],
      (_value, _previous) => {
        (() => {
          if (navigation.value === undefined) return
          props.taskBindings.write(
            props.sessionId,
            { id: tab.value.id, kind: tab.value.kind, contentId: tab.value.contentId },
            navigation.value,
          )
        })()

      },
      { immediate: true, flush: 'post' },
    )
    watch(
      [
        () => props.taskBindings,
        () => props.sessionId,
        () => tab.value.id,
        () => tab.value.kind,
        () => tab.value.contentId,
        () => recovered.value,
        () => navigated.value,
        () => answered.value,
        () => catalogRecord.value,
      ],
      (_value, _previous) => {
        (() => {
          // A binding this tab cannot resolve against a read that succeeded after the tab
          // appeared described a task that no longer exists; forgetting it leaves the
          // restored tab in the same feedback state as one that never had a binding. A
          // refresh republishes `loading` over the retained records, so that read is the
          // one that answers, not the read state.
          if (
            recovered.value === undefined ||
            navigated.value ||
            !answered.value ||
            catalogRecord.value !== undefined
          )
            return
          props.taskBindings.forget(props.sessionId, {
            id: tab.value.id,
            kind: tab.value.kind,
            contentId: tab.value.contentId,
          })
        })()

      },
      { immediate: true, flush: 'post' },
    )
    return () => {
      if (baseline.value.revision !== navigationRevision.value) {
        baseline.value = { revision: navigationRevision.value, request: catalog.value.readRequest }
      }
      if (task.value === undefined) {
        // A tab this window cannot name a task for has nothing left to load once a
        // read succeeds, so it states the task's absence rather than reporting a load
        // that never ends; an unbound restored tab and a navigated tab whose task is
        // gone read the same to the user, so both center the one missing-task state.
        // A ready catalog from a read this tab may not use is not that answer: the
        // tab is waiting for its own read, so it reports the load instead.
        const pending = catalog.value.status === 'ready' && !answered.value
        return h('div', { class: css.tabBody }, [
          answered.value
            ? h('div', { class: css.empty, role: 'status' }, [
              h(IconClockOutlineRegular, { size: 24, className: clsx(css.emptyGlyph) }),
              h('h3', {}, [props.t('detail.missing')]),
            ])
            : h(CatalogFeedback, {
              status: pending ? 'loading' : catalog.value.status,
              populated: false,
              onRetry: props.onRetry,
              t: props.t,
            }),
        ])
      }
      return h('div', { class: css.tabBody }, [
        h(TaskDetail, {
          ...detail.value.props,
          task: task.value,
          authoritative: catalogRecord.value !== undefined,
          onDeleted: () => {
            tab.value.actions.close()
          },
        }),
      ])
    }
  },
  {
    props: [
      'useTabInfo',
      'useSession',
      'sessionId',
      'useProjection',
      'useAccess',
      'useConversation',
      'useInput',
      'inputActions',
      'useChat',
      'useRemoteAccess',
      'useSessions',
      'useSessionRetainInfo',
      'useSessionAccess',
      'usePanelInfo',
      'useContextMenu',
      'useWorkspaces',
      'useStore',
      'actions',
      'onDelete',
      'onRetry',
      'hostActions',
      'onOpenSession',
      'loadHistory',
      'taskBindings',
      'useCatalog',
      't',
    ],
  },
)
