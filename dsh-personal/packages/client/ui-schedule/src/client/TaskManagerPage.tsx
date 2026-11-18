import { h, defineComponent, computed, shallowRef, watch } from 'vue'
import clsx from 'clsx'
import {
  Button,
  IconClockOutlineRegular,
  IconCloseOutlineRegular,
  IconEllipsisOutlineRegular,
  IconPlusOutlineRegular,
  IconSearchOutlineRegular,
  IconTrashOutlineRegular,
  IconChevronDownOutlineRegular,
  IconEditOutlineRegular,
  Input,
  Menu,
  MenuItemButton,
  Modal,
  ReferenceIconRegular,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  HostObservable,
  InjectFace,
  PropsLocale,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {
  ScheduleId,
  ScheduleCatalogEntry,
  ScheduleCreateRequest,
} from '@deepseek-ai/dsh-schedule/client'
import type { TaskCreateOutcome } from './TaskDetail.tsx'
import type { TaskEditorStoreProps } from './editor-store.ts'
import { taskNextRunAt, taskSessionId } from './task-record.ts'
import { TextSearchIndex } from '@deepseek-ai/dsh-util-text-search'
import type { CatalogSnapshot } from './catalog-source.ts'
import { CatalogFeedback } from './CatalogFeedback.tsx'
import { TaskDetail, useTaskDetail, type TaskDetailInjected } from './TaskDetail.tsx'
import { useRelativeClock } from './relative-clock.ts'
import { formatScheduleFrequency, nextRunParts, taskName, zoneLabel } from './schedule-format.ts'
import type { FrequencyZone } from './schedule-format.ts'
import { ScheduleEmptyIllustration } from './ScheduleEmptyIllustration.tsx'
import { ScheduleRecommendations } from './ScheduleRecommendations.tsx'
import css from './TaskManagerPage.module.css'
/** Injected catalog and task actions for the management page. */
export interface TaskManagerInjected extends TaskDetailInjected {
  /** Host task catalog with its query and deletion state. */
  readonly hooks: {
    readonly catalog: HostObservable<CatalogSnapshot<ScheduleCatalogEntry>>
  }
  /**
   * Start a new Session, where a reminder is created by asking the model to
   * schedule it, using the existing new-conversation action.
   */
  readonly onNewTask: () => void
  /** Start a new Session with a localized recommendation request prefilled. */
  readonly onUseRecommendation: (prompt: string) => void
  /**
   * Remove every ended Host task, after this page has confirmed the action.
   *
   * The call requests no task ids, so the Host's ended set is the one removed;
   * the page's rows are only a snapshot that a delivery can have moved. It
   * resolves once the settled outcome has been reported through the app-wide
   * notice, which is the only place the result is stated.
   * @returns resolution after the outcome is reported.
   */
  readonly onClearEnded: () => Promise<void>
  /** Create a task directly through the Host, without a model request. */
  readonly onCreateTask: (request: ScheduleCreateRequest) => Promise<TaskCreateOutcome>
}
/** Root-scoped task catalog props derived from the framework and injected actions. */
export type TaskManagerPageProps = PropsRuntime<'main'> &
  InjectFace<TaskManagerInjected> &
  TaskEditorStoreProps &
  PropsLocale<'schedule.manager'>
type StatusFilter = 'all' | ScheduleCatalogEntry['status']
/**
 * Render retained tasks with manual creation, inline editing, and authoritative deletion.
 * @param props - framework catalog snapshot, localized copy, and action callbacks.
 * @returns the searchable task list beside the selected task's detail.
 */
export const TaskManagerPage = defineComponent(
  (props: TaskManagerPageProps) => {
    const createMenuOpen = shallowRef(false)
    const manualOpen = shallowRef(false)
    const catalog = props.useCatalog(snapshot => snapshot)
    const records = computed(() => catalog.value.records),
      status = computed(() => catalog.value.status)
    const search = shallowRef('')
    const statusFilter = shallowRef<StatusFilter>('active')
    const selectedId = shallowRef<ScheduleId | null>(null)
    const clearConfirm = shallowRef(false)
    const clearMenu = shallowRef(false)
    const clearing = shallowRef(false)
    const now = useRelativeClock()
    const detail = useTaskDetail(
      props,
      () => catalog.value,
      () => selectedId.value ?? undefined,
    )
    const catalogRecord = computed(() => detail.value.record),
      selected = computed(() => detail.value.task),
      detailId = computed(() => detail.value.props.id),
      confirmId = computed(() => detail.value.props.confirmId),
      setConfirmId = computed(() => detail.value.props.onConfirm),
      setTab = computed(() => detail.value.props.onTabChange)
    const rowRef = shallowRef<HTMLButtonElement | null>(null)
    const createTriggerRef = shallowRef<HTMLButtonElement | null>(null)
    const headingRef = shallowRef<HTMLHeadingElement | null>(null)
    const clearTriggerRef = shallowRef<HTMLButtonElement | null>(null)
    const clearFocusPending = shallowRef(false)
    const clearSettled = shallowRef(false)
    const confirming = computed(() =>
      records.value.find(record => record.id === confirmId.value),
    )
    const endedCount = computed(
      () => records.value.filter(record => record.status === 'ended').length,
    )
    const rowIndex = computed(
      () =>
        new TextSearchIndex(
          records.value
            .filter(
              record => statusFilter.value === 'all' || record.status === statusFilter.value,
            )
            .toSorted(
              (left, right) => Date.parse(taskNextRunAt(left)) - Date.parse(taskNextRunAt(right)),
            ),
          record => ({
            fuzzy: [taskName(record)],
            substring: [taskSessionId(record), record.prompt],
          }),
        ),
    )
    const rows = computed(() => rowIndex.value.search(search.value))
    const emptyTitle = computed(() =>
      search.value.trim() !== ''
        ? 'list.noMatches'
        : statusFilter.value === 'paused'
          ? 'list.emptyPaused'
          : statusFilter.value === 'ended'
            ? 'list.emptyInactive'
            : statusFilter.value === 'active'
              ? 'list.emptyActive'
              : 'list.empty',
    )
    const systemZone = computed(() => Intl.DateTimeFormat().resolvedOptions().timeZone)
    const frequencyZone = computed<FrequencyZone>(() => ({
      system: systemZone.value,
      label: zone => zoneLabel(zone, props.t),
    }))
    watch(
      [() => selectedId.value, () => manualOpen.value, () => clearConfirm.value],
      (_value, _previous) => {
        (() => {
          // The detail focuses its own panel; with nothing selected, focus returns
          // to the control that opened it, or to the page heading once that control is gone.
          // An open confirmation owns the focus until it closes, even when a refresh
          // drops the selected task behind it.
          if (selectedId.value !== null || manualOpen.value || clearConfirm.value) return
          if (rowRef.value !== null) {
            const target = rowRef.value.isConnected ? rowRef.value : headingRef.value
            target?.focus()
            rowRef.value = null
          }
        })()

      },
      { immediate: true, flush: 'post' },
    )
    watch(
      [
        () => status.value,
        () => selectedId.value,
        () => selected.value,
        () => confirmId.value,
        () => confirming.value,
      ],
      (_value, _previous) => {
        (() => {
          if (status.value !== 'ready') return
          if (selectedId.value !== null && selected.value === undefined) selectedId.value = null
          if (confirmId.value !== null && confirming.value === undefined) setConfirmId.value(null)
        })()

      },
      { immediate: true, flush: 'post' },
    )
    const closeDetails = (): void => {
      selectedId.value = null
      manualOpen.value = false
    }
    const createManually = (trigger: HTMLButtonElement | null): void => {
      rowRef.value = trigger
      selectedId.value = null
      manualOpen.value = true
      setTab.value('rule')
    }
    // The Modal restores focus to the element it captured when it opened; the
    // trigger can be removed or rebuilt while the confirmation is open, so the
    // page points focus at the current control, or the heading when it is gone.
    // A settled removal whose readback lands later unmounts the trigger after the
    // dialog closed, which drops focus to the document body; that handoff is
    // caught by the same effect watching the ended count.
    watch(
      [() => clearConfirm.value, () => endedCount.value],
      (_value, _previous) => {
        (() => {
          if (clearConfirm.value) return
          if (clearFocusPending.value) {
            clearFocusPending.value = false
            const trigger = clearTriggerRef.value
            if (trigger?.isConnected === true) {
              trigger.focus()
              return
            }
            clearSettled.value = false
            headingRef.value?.focus()
            return
          }
          if (
            !clearSettled.value ||
            endedCount.value > 0 ||
            document.activeElement !== document.body
          )
            return
          clearSettled.value = false
          headingRef.value?.focus()
        })()

      },
      { immediate: true, flush: 'post' },
    )
    const confirmClearEnded = (): void => {
      // The confirmation button stays focusable while the removal runs, so a
      // second press has to be ignored here instead of by `disabled`.
      if (clearing.value) return
      clearing.value = true
      void props.onClearEnded().finally(() => {
        clearSettled.value = true
        clearing.value = false
        clearConfirm.value = false
      })
    }
    return () => {
      return h(
        'section',
        {
          class: clsx(
            css.page,
            (selected.value !== undefined || manualOpen.value) && css.hasDetails,
          ),
          'aria-label': props.t('title'),
          'data-testid': 'task-manager-page',
          onKeydown: (event: KeyboardEvent) => {
            // An Escape that closed a dropdown is already consumed by the Menu's
            // document capture listener. A confirmation's own Escape reaches the
            // Modal's document bubble listener, which runs after this React handler,
            // so the `clearConfirm` guard is what keeps this page from also closing
            // the detail while the dialog closes.
            if (
              event.key !== 'Escape' ||
              event.defaultPrevented ||
              confirmId.value !== null ||
              clearConfirm.value ||
              (selectedId.value === null && !manualOpen.value)
            )
              return
            event.preventDefault()
            event.stopPropagation()
            closeDetails()
          },
        },
        [
          h('div', { class: css.listPane }, [
            h('div', { class: css.pageScroll }, [
              h('div', { class: css.pageContent }, [
                h('div', { class: css.pageHeading }, [
                  h('h1', { ref: headingRef, tabindex: -1 }, [props.t('title')]),
                  h('div', { class: css.creationActions }, [
                    h(
                      'span',
                      {
                        class: css.createGroup,
                        role: 'group',
                        'aria-label': props.t('host.create'),
                      },
                      [
                        h(
                          Button,
                          {
                            variant: 'primary',
                            size: 'sm',
                            className: clsx(css.headerAction, css.createPrimary),
                            icon: h(IconPlusOutlineRegular, { size: 13 }),
                            onClick: props.onNewTask,
                          },
                          { default: () => [props.t('new.action')] },
                        ),
                        h(
                          Menu,
                          {
                            open: createMenuOpen.value,
                            onClose: () => {
                              createMenuOpen.value = false
                            },
                            align: 'end',
                            portal: true,
                            autoFocus: true,
                            listClassName: clsx(css.createMenu),
                          },
                          {
                            default: () => [
                              h(
                                MenuItemButton,
                                {
                                  icon: h(ReferenceIconRegular, { kind: 'session', size: 14 }),
                                  onSelect: () => {
                                    createMenuOpen.value = false
                                    props.onNewTask()
                                  },
                                },
                                { default: () => [props.t('host.chatCreate')] },
                              ),
                              h(
                                MenuItemButton,
                                {
                                  icon: h(IconEditOutlineRegular, { size: 14 }),
                                  onSelect: () => {
                                    createMenuOpen.value = false
                                    createManually(createTriggerRef.value)
                                  },
                                },
                                { default: () => [props.t('host.manualCreate')] },
                              ),
                            ],
                            anchor: () =>
                              h(
                                Button,
                                {
                                  elementRef: element => (createTriggerRef.value = element),
                                  variant: 'primary',
                                  size: 'sm',
                                  className: clsx(css.createMore),
                                  'aria-label': props.t('host.createMethod'),
                                  'aria-haspopup': 'menu',
                                  'aria-expanded': createMenuOpen.value,
                                  onClick: () => {
                                    createMenuOpen.value = (value => !value)(
                                      createMenuOpen.value,
                                    )
                                  },
                                },
                                { default: () => [h(IconChevronDownOutlineRegular, { size: 12 })] },
                              ),
                          },
                        ),
                      ],
                    ),
                  ]),
                ]),
                h('div', { class: css.filters }, [
                  h(
                    'div',
                    {
                      class: css.filterTabs,
                      role: 'group',
                      'aria-label': props.t('statusFilter.label'),
                    },
                    [
                      (['active', 'paused', 'ended', 'all'] as const).map(value =>
                        h(
                          'button',
                          {
                            key: value,
                            type: 'button',
                            class: clsx(
                              css.filterTab,
                              statusFilter.value === value && css.filterTabActive,
                            ),
                            'aria-pressed': statusFilter.value === value,
                            onClick: () => {
                              statusFilter.value = value
                            },
                          },
                          [props.t(value === 'all' ? 'statusFilter.all' : `status.${value}`)],
                        ),
                      ),
                    ],
                  ),
                ]),
                h('div', { class: css.searchTools }, [
                  h('div', { class: css.searchField }, [
                    h(
                      Input,
                      {
                        type: 'search',
                        'aria-label': props.t('search.label'),
                        placeholder: props.t('search.placeholder'),
                        value: search.value,
                        onInput: (event: Event) => {
                          search.value = (event.currentTarget as HTMLInputElement).value
                        },
                      },
                      { icon: () => h(IconSearchOutlineRegular, {}) },
                    ),
                    search.value !== '' &&
                      h(
                        Button,
                        {
                          size: 'sm',
                          className: clsx(css.searchClear),
                          'aria-label': props.t('search.clear'),
                          onClick: () => {
                            search.value = ''
                          },
                        },
                        { default: () => [h(IconCloseOutlineRegular, {})] },
                      ),
                  ]),
                  statusFilter.value !== 'active' &&
                    endedCount.value > 0 &&
                    h(
                      Menu,
                      {
                        open: clearMenu.value,
                        onClose: () => {
                          clearMenu.value = false
                        },
                        align: 'end',
                        portal: true,
                        items: [
                          {
                            id: 'clear-inactive',
                            label: props.t(clearing.value ? 'clear.pending' : 'clear.action'),
                            icon: h(IconTrashOutlineRegular, {}),
                            danger: true,
                            disabled: clearing.value || status.value !== 'ready',
                          },
                        ],
                        onSelect: () => {
                          clearMenu.value = false
                          clearFocusPending.value = true
                          clearConfirm.value = true
                        },
                      },
                      {
                        anchor: () =>
                          h(
                            Tooltip,
                            {
                              label: props.t('list.more'),
                              side: 'bottom',
                              portal: true,
                              disabled: clearMenu.value,
                            },
                            {
                              default: () => [
                                h(
                                  Button,
                                  {
                                    elementRef: element => (clearTriggerRef.value = element),
                                    variant: 'outline',
                                    className: clsx(css.catalogMore),
                                    'aria-label': props.t('list.more'),
                                    'aria-haspopup': 'menu',
                                    'aria-expanded': clearMenu.value,
                                    'aria-busy': clearing.value,
                                    onClick: () => {
                                      clearMenu.value = (value => !value)(clearMenu.value)
                                    },
                                  },
                                  { default: () => [h(IconEllipsisOutlineRegular, {})] },
                                ),
                              ],
                            },
                          ),
                      },
                    ),
                ]),
                h('div', { class: css.list }, [
                  selected.value === undefined &&
                    h(CatalogFeedback, {
                      status: status.value,
                      populated: rows.value.length > 0,
                      onRetry: props.onRetry,
                      t: props.t,
                    }),
                  status.value === 'ready' &&
                    rows.value.length === 0 &&
                    h('div', { class: css.empty, role: 'status' }, [
                      h(ScheduleEmptyIllustration, { className: clsx(css.emptyIllustration) }),
                      h('h2', {}, [props.t(emptyTitle.value)]),
                      h(
                        Button,
                        {
                          variant: 'outline',
                          className: clsx(css.emptyAction),
                          onClick: (event: Event) => {
                            createManually(event.currentTarget as HTMLButtonElement)
                          },
                        },
                        { default: () => [props.t('empty.action')] },
                      ),
                    ]),
                  status.value === 'ready' && rows.value.length === 0 && search.value.trim() === '' &&
                    (statusFilter.value === 'active' || statusFilter.value === 'all') &&
                    h(ScheduleRecommendations, { t: props.t, onUse: props.onUseRecommendation }),
                  h(
                    'ul',
                    {
                      class: css.listRows,
                      'aria-label': props.t('list.label'),
                      'aria-busy': status.value === 'loading',
                    },
                    [
                      rows.value.map((record) => {
                        // One pair per row: the same absolute stamp and distance reach
                        // both halves, from one formatting call.
                        const nextRunAt = taskNextRunAt(record)
                        const nextRun = nextRunParts(
                          nextRunAt,
                          props.t('time.locale'),
                          now.value,
                          props.t,
                        )
                        return h('li', { key: record.id }, [
                          h(
                            Button,
                            {
                              className: clsx(
                                css.row,
                                selectedId.value === record.id && css.selectedRow,
                                record.status !== 'active' && css.endedRow,
                              ),
                              'aria-label': taskName(record),
                              'aria-describedby': `${detailId.value}-metadata-${record.id}`,
                              'aria-expanded': selectedId.value === record.id,
                              'aria-controls':
                                selectedId.value === record.id ? detailId.value : undefined,
                              onClick: (event: Event) => {
                                rowRef.value = event.currentTarget as HTMLButtonElement
                                manualOpen.value = false
                                selectedId.value = record.id
                                setTab.value('rule')
                              },
                            },
                            {
                              default: () => [
                                h(IconClockOutlineRegular, { className: clsx(css.rowGlyph) }),
                                h('span', { class: css.rowContent }, [
                                  h('span', { class: css.rowTitle }, [taskName(record)]),
                                  h(
                                    'span',
                                    {
                                      class: css.rowSummary,
                                      id: `${detailId.value}-metadata-${record.id}`,
                                    },
                                    [
                                      record.status !== 'active' &&
                                        h('span', { class: css.metadata }, [
                                          props.t(`status.${record.status}`),
                                        ]),
                                      h('span', { class: css.metadata }, [
                                        formatScheduleFrequency(
                                          record,
                                          props.t,
                                          frequencyZone.value,
                                        ),
                                      ]),
                                      record.status === 'active' &&
                                        h('span', { class: css.metadata }, [
                                          props.t('list.nextPrefix'),
                                          h('time', { dateTime: nextRunAt }, [nextRun.absolute]),
                                          ' ',
                                          h('span', { class: css.nextRunRelative }, [
                                            nextRun.relative,
                                          ]),
                                        ]),
                                    ],
                                  ),
                                ]),
                              ],
                            },
                          ),
                        ])
                      }),
                    ],
                  ),
                ]),
              ]),
            ]),
          ]),
          manualOpen.value
            ? h(TaskDetail, {
              ...detail.value.props,
              onCreateTask: props.onCreateTask,
              onClose: closeDetails,
              onDeleted: closeDetails,
              onCreated: (task) => {
                manualOpen.value = false
                search.value = ''
                statusFilter.value = 'all'
                selectedId.value = task.id
                setTab.value('rule')
              },
            })
            : selected.value !== undefined &&
              h(TaskDetail, {
                ...detail.value.props,
                task: selected.value,
                authoritative: catalogRecord.value !== undefined,
                onDeleted: closeDetails,
                onClose: closeDetails,
              }),
          h(
            Modal,
            {
              className: clsx(css.confirmDialog),
              contentClassName: css.confirmContent as string,
              open: clearConfirm.value,
              title: props.t('clear.title', { count: endedCount.value }),
              description: props.t('clear.description'),
              closeLabel: props.t('clear.close'),
              onClose: () => {
                if (!clearing.value) clearConfirm.value = false
              },
            },
            {
              footer: () =>
                h('div', { class: css.confirmActions }, [
                  h(
                    Button,
                    {
                      variant: 'outline',
                      disabled: clearing.value,
                      onClick: () => {
                        clearConfirm.value = false
                      },
                    },
                    { default: () => [props.t('delete.cancel')] },
                  ),
                  h(
                    Button,
                    {
                      variant: 'outline',
                      className: clsx(css.deleteButton),
                      'aria-disabled': clearing.value,
                      onClick: confirmClearEnded,
                    },
                    {
                      default: () => [props.t(clearing.value ? 'clear.pending' : 'clear.confirm')],
                    },
                  ),
                ]),
            },
          ),
        ],
      )
    }
  },
  {
    props: [
      'useRemoteAccess',
      'useSessions',
      'useSessionRetainInfo',
      'useSessionAccess',
      'usePanelInfo',
      'useContextMenu',
      'useWorkspaces',
      'onDelete',
      'onRetry',
      'hostActions',
      'onOpenSession',
      'loadHistory',
      'onNewTask',
      'onUseRecommendation',
      'onClearEnded',
      'onCreateTask',
      'useCatalog',
      'useStore',
      'actions',
      't',
    ],
  },
)
