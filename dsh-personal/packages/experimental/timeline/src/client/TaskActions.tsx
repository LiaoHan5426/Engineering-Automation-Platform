import { onMounted, computed, defineComponent, h, watch, shallowRef } from 'vue'
import { Button, IconCheckOutlineRegular, IconChevronsUpDownOutlineRegular, IconListPenOutlineRegular, IconPauseOutlineRegular, IconPlayOutlineRegular, IconQueueOutlineRegular, Menu, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { priorities } from '../records.ts'
import type { Annotation, Priority, Task, Tree } from '../records.ts'
import { CONTROL_WAIT_MS, latestControl, pendingControl } from '../controls.ts'
import { prioritiesOf } from '../tasks.ts'
import type { TaskRequest } from './actions.ts'
export interface PlaybackState {
  annotations: readonly Annotation[]
  trees: readonly Tree[]
  now: number
}
/** Express user intent without editing agent-owned progress optimistically. */
export const TaskActions = defineComponent((props: {
  tree: Tree
  task?: Task | undefined
  status: Task['status']
  playback: PlaybackState
  request: (value: TaskRequest) => Promise<void>
  setPriority?: (value: Priority) => Promise<void>
  annotate?: () => void
  annotationOpen?: boolean
} & PropsLocale<'timeline'>, { slots }) => {
  const sending = shallowRef(false)
  const message = shallowRef<'taskRequestFailed' | 'prioritySaveFailed' | null>(null)
  const busy = shallowRef(false)
  const menu = shallowRef(false)
  const updatedAt = computed(() => props.task?.updatedAt ?? Math.max(props.tree.createdAt, ...props.tree.tasks.map(task => task.updatedAt)))
  onMounted(() => watch(() => [props.status, updatedAt.value], () => {
    message.value = null
  }, { immediate: true, flush: 'post' }))
  const wholePlan = computed(() => props.task === undefined)
  const parentPriority = computed(() => props.task?.parent == null ? null : (prioritiesOf(props.tree.tasks).get(props.task.parent) ?? null))
  const priority = computed(() => props.task?.priority ?? parentPriority.value)
  const target = computed(() => props.task === undefined
    ? { kind: 'tree' as const, tree: props.tree.id }
    : { kind: 'task' as const, tree: props.tree.id, task: props.task.id })
  const receipt = computed(() => pendingControl(props.playback.annotations, target.value, props.playback.trees, props.playback.now) ??
        latestControl(props.playback.annotations, target.value))
  const control = computed(() => {
    const receiptSnapshot = receipt.value
    return receiptSnapshot?.control
  })
  const unconfirmed = computed(() => {
    const controlSnapshot = control.value
    return controlSnapshot?.outcome === null
  })
  const waiting = computed(() => {
    const receiptSnapshot = receipt.value
    return receiptSnapshot !== undefined && unconfirmed.value && props.playback.now - receiptSnapshot.createdAt < CONTROL_WAIT_MS
  })
  const retry = computed(() => {
    const controlSnapshot = control.value
    return unconfirmed.value || controlSnapshot?.outcome?.status === 'answered'
  })
  const available = computed(() => props.status !== 'done' && props.status !== 'retired' && props.tree.tasks.some(task => task.status !== 'retired'))
  const perform = computed(() => async (operation: () => Promise<void>, priority = false) => {
    if (sending.value)
      return
    sending.value = true
    busy.value = true
    message.value = null
    try {
      await operation()
    }
    catch {
      message.value = priority ? 'prioritySaveFailed' : 'taskRequestFailed'
    }
    finally {
      sending.value = false
      busy.value = false
    }
  })
  const action = computed(() => {
    const controlSnapshot = control.value
    return retry.value && controlSnapshot !== undefined ? controlSnapshot.action : props.status === 'active' ? 'pause' : 'resume'
  })
  const requesting = computed(() => props.status !== 'done' && !waiting.value && !retry.value)
  const text = computed(() => props.status === 'done'
    ? props.t('taskCompleted')
    : waiting.value ? props.t(action.value === 'pause' ? 'pausePending' : 'resumePending')
      : retry.value ? props.t(action.value === 'pause' ? 'retryPause' : 'retryResume')
        : props.t(action.value === 'pause' ? 'pauseTask' : 'resumeTask'))
  const label = computed(() => wholePlan.value && requesting.value ? props.t(action.value === 'pause' ? 'pausePlan' : 'resumePlan') : text.value)
  const playbackButton = computed(() => (h(Button, { 'className': wholePlan.value ? 'timeline-playback' : 'timeline-task-action', 'data-action': props.status === 'done' ? 'done' : action.value, 'data-pending': waiting.value, 'aria-label': label.value, 'disabled': busy.value || !available.value || waiting.value, 'onClick': () => {
    if (busy.value || !available.value || waiting.value)
      return
    void perform.value(() => props.request({ action: action.value, tree: props.tree, ...(
      props.task === undefined ? {} : { task: props.task }) }))
  } }, { default: () => [
    props.status === 'done' ? (h(IconCheckOutlineRegular, { 'size': 18 })) : action.value === 'pause' ? (h(IconPauseOutlineRegular, { 'size': 18 })) : (h(IconPlayOutlineRegular, { 'size': 18 })),
    h('span', null, [
      text.value,
    ]),
  ] })))
  const playbackControl = computed(() => {
    const controlSnapshot = control.value
    return (h(Tooltip, { 'label': busy.value ? props.t('sendingTaskRequest')
      : waiting.value ? `${label.value} · ${props.t(controlSnapshot?.delivery === 'unknown' ? 'controlDeliveryUnknown' : 'controlWaitingHint')}`
        : retry.value ? `${label.value} · ${props.t('controlUnconfirmedHint')}`
          : `${label.value} · ${props.t('taskControlsHint')}`, 'side': 'top', 'portal': true }, { default: () => [
      h('span', { 'class': 'timeline-playback-anchor', 'tabIndex': waiting.value ? 0 : undefined, 'role': waiting.value ? 'group' : undefined, 'aria-label': waiting.value ? label.value : undefined }, [
        playbackButton.value,
      ]),
    ] }))
  })
  return () => {
    const taskRendered = props.task
    const setPriorityRendered = props.setPriority
    return (h('div', { 'class': wholePlan.value ? 'timeline-plan-controls' : 'timeline-task-controls' }, [
      taskRendered === undefined ? (h('div', { 'class': 'timeline-overall', 'role': available.value ? 'group' : undefined, 'aria-label': available.value ? props.t('taskControls') : undefined, 'aria-busy': busy.value || waiting.value }, [
        available.value ? playbackControl.value : null,
        slots.default?.(),
      ])) : (h('div', { 'class': 'timeline-task-grid', 'role': 'group', 'aria-label': props.t('taskControls'), 'aria-busy': busy.value || waiting.value }, [
        h(Menu, {
          'open': menu.value, 'onClose': () => { menu.value = false }, 'side': 'top', 'portal': true, 'compact': true, 'autoFocus': true, 'className': 'timeline-priority-menu', 'selectedId': taskRendered.priority ?? 'none',
          'items': [
            ...priorities.map(value => ({
              id: value,
              label: (h('span', { 'class': 'timeline-priority-option' }, [
                h('span', { 'class': 'timeline-priority-badge', 'data-priority': value }, [
                  value,
                ]),
                props.t(`priority${value}`),
              ])),
            })),
            {
              id: 'none',
              label: parentPriority.value === null ? props.t('noPriority') : `${props.t('inheritedPriority')}: ${parentPriority.value}`,
            },
          ], 'onSelect': (value) => {
            menu.value = false
            const priority = priorities.find(item => item === value) ?? null
            if (priority !== taskRendered.priority && setPriorityRendered !== undefined)
              void perform.value(() => setPriorityRendered(priority), true)
          },
        }, { anchor: () => h(Button, { 'className': 'timeline-task-action timeline-priority-trigger', 'aria-label': `${props.t('priority')}: ${priority.value ?? props.t('noPriority')}`, 'title': props.t('priorityHint'), 'aria-haspopup': 'menu', 'aria-expanded': menu.value, 'disabled': busy.value || props.status === 'retired', 'onClick': () => { menu.value = !menu.value } }, { default: () => [
          h(IconQueueOutlineRegular, { 'size': 16 }),
          h('span', { 'class': 'timeline-priority-title' }, [
            props.t('priority'),
            ':',
          ]),
          h('span', { 'class': 'timeline-priority-badge', 'data-priority': priority.value ?? 'none' }, [
            priority.value ?? props.t('noPriority'),
          ]),
          h(IconChevronsUpDownOutlineRegular, { 'size': 12 }),
        ] }) }),
        playbackControl.value,
        h(Button, { 'className': 'timeline-task-action', 'aria-label': props.t('addAnnotation'), 'aria-pressed': (props.annotationOpen ?? false), 'aria-expanded': (props.annotationOpen ?? false), 'disabled': busy.value || props.status === 'retired', 'onClick': props.annotate }, { default: () => [
          h(IconListPenOutlineRegular, { 'size': 18 }),
          h('span', null, [
            props.t('addAnnotation'),
          ]),
        ] }),
      ])),
      message.value !== null ? (h('small', { 'class': 'timeline-error', 'role': 'alert' }, [
        props.t(message.value),
      ])) : null,
    ]))
  }
}, { name: 'TaskActions', inheritAttrs: false, props: ['tree', 'task', 'status', 'playback', 'request', 'setPriority', 'annotate', 'annotationOpen', 't'] })
