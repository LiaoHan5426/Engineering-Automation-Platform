/**
 * ModelSelect: the composer's named model seat (`conversation.input.model`).
 * Two-level selection per figma 496:26454's MenuDropdown: the root menu is
 * the Model / Effort row pair (label + current value + a right chevron),
 * each drilling into its own list — the provider-grouped model list over
 * the shared directory, and the effort levels. The trigger (313:14108's
 * ToggleButton) shows both: model name + effort in the caption tone.
 * Model catalogs above four entries show search, which retains focus while
 * ↑/↓ cycle the highlighted result; Enter and Tab accept it. Smaller model
 * catalogs, root panes, and effort panes move focus between rows. Escape and Shift+Tab leave a drilled pane first and otherwise close
 * back to the trigger. A drilled pane focuses the current effort or model
 * search field. Provider headings paint their background only while pinned
 * by scrolling. Clearing a query restores the full list and search focus.
 * Selecting restores trigger focus without a ring until the trigger loses focus
 * or the menu reopens. Mobile devices restore button focus when opening or
 * drilling; model search takes focus only after explicit user input.
 * Model names match a case-insensitive ordered subsequence
 * within each provider group, ranked by
 * prefix, alignment score, then catalog order. Returning to the root pane
 * hands focus back to the cell that opened it. Data and submission ride the
 * same per-session ModelDirectory as the /model popup; exact-model reasoning
 * metadata and the selected effort come from the Host rather than a
 * client-owned vocabulary. A rejected selection announces through the shared
 * transient Toast anchored to the composer card; the in-menu strip with
 * Retry remains the catalog-load surface. While the directory's pending
 * selection is unsettled, the trigger shows a spinner in place of its
 * chevron, and each row whose value that selection carries shows one in place
 * of its check mark.
 */
import {
  MenuGroup,
  MenuSurface,
  observeStickyMenuGroups,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  defineComponent,
  h,
  Teleport,
  computed,
  ref,
  shallowRef,
  useId,
  watch,
  watchPostEffect,
  nextTick,
  type CSSProperties,
  type VNodeRef,
} from 'vue'
import clsx from 'clsx'
import type { ModelReasoningEffort, ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import {
  IconCheckOutlineRegular,
  IconChevronDownOutlineRegular,
  IconChevronRightOutlineRegular,
  IconCloseFillRegular,
  IconDataOutlineRegular,
  IconWarningOutlineRegular,
  Input,
  isMobileDevice,
  StateDot,
  Tag,
  Toast,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type {
  InjectFace,
  PropsLocale,
  PropsRenderSlots,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots'
import type {
  ModelLabelOwner,
  ModelMenuControls,
  ModelMenuPaneRef,
  ModelSelectInjected,
} from './slots.ts'
import css from './ModelSelect.module.css'
import { TextSearchIndex } from '@deepseek-ai/dsh-util-text-search'
import { orderModelProviders } from './provider-order.ts'
/** Which pane the dropdown shows: the root menu, one drilled-in list, or a plugin-owned detail pane. */
type Pane =
  | {
    kind: 'root'
  }
  | {
    kind: 'model'
  }
  | {
    kind: 'effort'
  }
  | {
    kind: 'detail'
    pane: ModelMenuPaneRef
  }
/** Any pane reached by drilling from the root menu. */
type DrilledPane = Exclude<
  Pane,
  {
    kind: 'root'
  }
>
const ROOT_PANE: Pane = { kind: 'root' }
const MODEL_PANE: DrilledPane = { kind: 'model' }
const EFFORT_PANE: DrilledPane = { kind: 'effort' }
/** One dynamic effort row; undefined means preserve the provider default. */
interface EffortChoice {
  key: string
  effort: string | undefined
  label: string
}
/**
 * Render the composer model seat.
 * @param props - owner share (locked) + injected face (shared directory
 * store/verbs) + the standard locale seat.
 * @returns the trigger and, while open, the two-level menu.
 */
export type ModelSelectProps = InjectFace<ModelSelectInjected> &
  Pick<PropsRuntime<'conversation.input.model'>, 'locked'> &
  PropsLocale<'model'> &
  Omit<
    PropsRenderSlots<
      | 'conversation.input.model.label'
      | 'conversation.input.model.options'
      | 'conversation.input.model.pane'
    >,
    'SessionProvider'
  >
export const ModelSelect = defineComponent(
  (props: ModelSelectProps) => {
    const state = props.useDirectory(state => state)
    const open = ref(false)
    const setOpen = (value: boolean): void => {
      open.value = value
    }
    const pane = shallowRef<Pane>(ROOT_PANE)
    const setPane = (value: Pane): void => {
      pane.value = value
    }
    const query = ref('')
    const setQuery = (value: string): void => {
      query.value = value
    }
    const highlightedIndex = ref<number | null>(null)
    const setHighlightedIndex = (value: number | null): void => {
      highlightedIndex.value = value
    }
    const selectionFocus = ref(false)
    const setSelectionFocus = (value: boolean): void => {
      selectionFocus.value = value
    }
    // The in-menu error strip serves catalog loads (its Retry re-runs the
    // load); a rejected SELECTION announces through the transient toast
    // instead, so the strip renders only while the latest failure-capable
    // action was a load.
    const lastActionRef = shallowRef<'load' | 'select'>('load')
    const toast = ref<{
      seq: number
      text: string
    } | null>(null)
    const setToast = (
      value: {
        seq: number
        text: string
      } | null,
    ): void => {
      toast.value = value
    }
    const toastSeq = shallowRef(0)
    const rootRef = shallowRef<HTMLDivElement | null>(null)
    const triggerRef = shallowRef<HTMLButtonElement | null>(null)
    const searchRef = shallowRef<HTMLInputElement | null>(null)
    const menuRef = shallowRef<HTMLDivElement | null>(null)
    const groupsRef = shallowRef<HTMLDivElement | null>(null)
    const itemRefs = shallowRef<(HTMLButtonElement | null)[]>([])
    const id = useId()
    const anchorStyle: CSSProperties & Record<'--dsh-model-anchor', string> = {
      '--dsh-model-anchor': `--dsh-model-${id.replaceAll(':', '')}`,
    }
    const accountProviderName = computed(() => props.t('provider.account'))
    const groups = computed(() =>
      orderModelProviders(state.value.groups).map(group => ({
        ...group,
        provider: {
          id: group.id,
          name: group.id === 'deepseek-account' ? accountProviderName.value : group.name,
        },
      })),
    )
    const choices = computed(() =>
      groups.value.flatMap(group =>
        group.models.map(model => ({
          group,
          model,
          selection: {
            provider: group.id,
            model: model.id,
            ...(model.reasoning?.defaultEffort === undefined
              ? {}
              : { reasoningEffort: model.reasoning.defaultEffort }),
          } satisfies ModelSelection,
        })),
      ),
    )
    const showSearch = computed(() => choices.value.length > 4)
    const groupIndexes = computed(() =>
      groups.value.map(group => ({
        group,
        index: new TextSearchIndex(group.models, model => ({
          fuzzy: [model.name, model.id],
          substring: [model.description],
        })),
      })),
    )
    const filteredGroups = computed(() =>
      groupIndexes.value
        .map(({ group, index }) => ({
          ...group,
          models: index.search(showSearch.value ? query.value : ''),
        }))
        .filter(group => group.models.length > 0),
    )
    const visibleModels = computed(() =>
      filteredGroups.value.flatMap(group =>
        group.models.map(model => ({
          provider: group.id,
          model: model.id,
        })),
      ),
    )
    const currentVisibleIndex = computed(() =>
      visibleModels.value.findIndex(
        model =>
          model.provider === state.value.current?.provider &&
          model.model === state.value.current.model,
      ),
    )
    const activeModelIndex = computed(() =>
      Math.min(
        highlightedIndex.value ?? Math.max(0, currentVisibleIndex.value),
        visibleModels.value.length - 1,
      ),
    )
    const selectedIndex = computed(() =>
      state.value.current === null
        ? -1
        : choices.value.findIndex(
          c =>
            c.selection.provider === state.value.current?.provider &&
              c.selection.model === state.value.current.model,
        ),
    )
    const currentChoice = computed(() => choices.value[selectedIndex.value])
    const reasoning = computed(() => currentChoice.value?.model.reasoning)
    const effectiveEffort = computed(
      () => state.value.current?.reasoningEffort ?? reasoning.value?.defaultEffort,
    )
    const effortLabel = computed(() =>
      currentChoice.value === undefined
        ? undefined
        : reasoning.value === undefined
          ? state.value.retainedEffort
          : effectiveEffort.value === undefined
            ? props.t('effort.providerDefault')
            : (reasoning.value.efforts.find(level => level.id === effectiveEffort.value)?.name ??
              effectiveEffort.value),
    )
    const effortChoices = computed<readonly EffortChoice[]>(() =>
      reasoning.value === undefined
        ? []
        : [
          ...(reasoning.value.defaultEffort === undefined
            ? [
              {
                key: 'provider-default',
                effort: undefined,
                label: props.t('effort.providerDefault'),
              },
            ]
            : []),
          ...reasoning.value.efforts.map((effort: ModelReasoningEffort) => ({
            key: `effort:${effort.id}`,
            effort: effort.id,
            label: effort.name,
          })),
        ],
    )
    const pending = computed(() => state.value.pending)
    const busy = computed(() => pending.value !== null)
    const reload = (): void => {
      lastActionRef.value = 'load'
      props.load()
    }
    watch(open, (isOpen, _previous, onCleanup) => {
      if (!isOpen) return
      const closeOutside = (event: MouseEvent): void => {
        // The portaled card is outside the trigger subtree; check both.
        if (rootRef.value?.contains(event.target as Node) === true) return
        if (menuRef.value?.contains(event.target as Node) === true) return
        setOpen(false)
      }
      // WebKit touch taps on non-clickable areas dispatch pointerdown without mousedown.
      document.addEventListener('pointerdown', closeOutside)
      document.addEventListener('mousedown', closeOutside)
      onCleanup(() => {
        document.removeEventListener('pointerdown', closeOutside)
        document.removeEventListener('mousedown', closeOutside)
      })
    })
    watch(showSearch, () => {
      if (!showSearch.value) {
        setQuery('')
        setHighlightedIndex(null)
      }
    })
    // Pane switches unmount the focused row; restore focus inside the menu so
    // keyboard navigation remains available.
    const paneFocus = shallowRef<'drill' | DrilledPane | null>(null)
    const previousShowSearch = shallowRef(showSearch.value)
    watch(
      [open, pane, showSearch],
      async () => {
        const changedSearchMode = previousShowSearch.value !== showSearch.value
        previousShowSearch.value = showSearch.value
        const intent =
          paneFocus.value ?? (changedSearchMode && pane.value.kind === 'model' ? 'drill' : null)
        paneFocus.value = null
        if (!open.value || intent === null) return
        if (intent === 'drill') {
          if (pane.value.kind === 'detail') {
            await nextTick()
            // A detail pane places its own initial focus (autoFocus commits before
            // this effect); otherwise the surface keeps the menu's keys reachable.
            if (menuRef.value?.contains(document.activeElement) !== true)
              (menuRef.value ?? triggerRef.value)?.focus()
            return
          }
          if (pane.value.kind === 'model' && showSearch.value && !isMobileDevice()) {
            searchRef.value?.focus()
            return
          }
          // The checked row is the value in use; a pane without one opens on its
          // first row.
          const checked = menuRef.value?.querySelector<HTMLElement>(
            '[role="menuitemradio"][aria-checked="true"]:not([disabled])',
          )
          const target = checked ?? itemRefs.value.find(item => item !== null && !item.disabled);
          (target ?? triggerRef.value)?.focus()
          return
        }
        const cell =
          intent.kind === 'detail'
            ? Array.from(
              menuRef.value?.querySelectorAll<HTMLButtonElement>('[data-model-menu-pane]') ?? [],
            ).find(button => button.dataset.modelMenuPane === intent.pane.key)
            : itemRefs.value[intent.kind === 'effort' ? 1 : 0];
        (cell !== null && cell !== undefined && !cell.disabled ? cell : triggerRef.value)?.focus()
      },
      { flush: 'post' },
    )
    watchPostEffect((onCleanup) => {
      void filteredGroups.value
      const viewport = groupsRef.value
      if (viewport === null) return
      onCleanup(observeStickyMenuGroups(viewport))
    })
    watchPostEffect(() => {
      void visibleModels.value
      if (open.value && pane.value.kind === 'model' && activeModelIndex.value >= 0) {
        itemRefs.value[activeModelIndex.value]?.scrollIntoView({ block: 'nearest' })
      }
    })
    const show = (): void => {
      setSelectionFocus(false)
      triggerRef.value?.focus()
      setQuery('')
      setHighlightedIndex(null)
      if (currentChoice.value === undefined) paneFocus.value = 'drill'
      setPane(currentChoice.value === undefined ? MODEL_PANE : ROOT_PANE)
      setOpen(true)
      reload()
    }
    const changeQuery = (next: string): void => {
      setQuery(next)
      setHighlightedIndex(0)
    }
    const close = (restoreFocus = false): void => {
      paneFocus.value = null
      setOpen(false)
      setPane(ROOT_PANE)
      if (restoreFocus)
        queueMicrotask(() => {
          triggerRef.value?.focus()
        })
    }
    const closeAfterSelection = (): void => {
      setSelectionFocus(true)
      close(true)
    }
    const drill = (next: DrilledPane): void => {
      setQuery('')
      setHighlightedIndex(null)
      paneFocus.value = 'drill'
      setPane(next)
    }
    /** Leave a drilled pane for the root one, handing the keyboard back to its cell. */
    const back = (from: DrilledPane): void => {
      paneFocus.value = from
      setPane(ROOT_PANE)
    }
    const controls = computed<ModelMenuControls>(() => ({
      locked: props.locked || busy.value,
      dismiss: () => {
        close()
        triggerRef.value?.focus()
      },
      reportFailure: (message) => {
        setToast({ seq: ++toastSeq.value, text: message })
      },
    }))
    const moveFocus = (offset: number): void => {
      const items = Array.from(
        menuRef.value?.querySelectorAll<HTMLButtonElement>(
          'button[role="menuitem"]:not([disabled]), button[role="menuitemradio"]:not([disabled]), button[role="switch"]:not([disabled])',
        ) ?? [],
      )
      if (items.length === 0) return
      const active = items.findIndex(item => item === document.activeElement)
      // Focus outside the rows (the trigger, which keeps it while the menu
      // opens) enters at the end the step comes from: the first row forward,
      // the last row backward.
      const next =
        active === -1
          ? offset > 0
            ? 0
            : items.length - 1
          : (active + offset + items.length) % items.length
      items[next]?.focus()
    }
    const onRootKeyDown = (event: KeyboardEvent): void => {
      if (event.isComposing) return
      if (event.key === 'Escape' && open.value) {
        event.preventDefault()
        // Escape backs out of a drilled pane first, then closes.
        if (
          pane.value.kind === 'detail' ||
          (pane.value.kind !== 'root' && currentChoice.value !== undefined)
        )
          back(pane.value)
        else close(true)
        return
      }
      if (!open.value) return
      if (pane.value.kind === 'detail' && event.key === 'Tab') {
        event.preventDefault()
        close(true)
        return
      }
      if (
        pane.value.kind === 'model' &&
        showSearch.value &&
        (event.key === 'ArrowDown' || event.key === 'ArrowUp')
      ) {
        event.preventDefault()
        if (!busy.value && visibleModels.value.length > 0) {
          const direction = event.key === 'ArrowDown' ? 1 : -1
          setHighlightedIndex(
            (activeModelIndex.value + direction + visibleModels.value.length) %
              visibleModels.value.length,
          )
          searchRef.value?.focus()
        }
        return
      }
      if (
        pane.value.kind === 'model' &&
        showSearch.value &&
        event.target instanceof HTMLInputElement &&
        (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey))
      ) {
        if (event.key === 'Tab' && visibleModels.value.length === 0) return
        event.preventDefault()
        const highlighted = visibleModels.value[activeModelIndex.value]
        if (!busy.value && highlighted !== undefined) choose(highlighted)
        return
      }
      // Tab settles like Enter and Shift+Tab leaves like Escape, so the menu's
      // keys mean what they mean in the composer. Both are consumed: the card
      // keeps the browser's focus traversal out while it is open.
      if (event.key === 'Tab') {
        if (event.shiftKey) {
          event.preventDefault()
          if (pane.value.kind !== 'root' && currentChoice.value !== undefined) back(pane.value)
          else close(true)
          return
        }
        // Settling activates the row the keyboard is on; with focus still on the
        // trigger, Tab enters the menu at the value in use instead. Any other
        // control inside the card (a retry button) keeps the browser's traversal,
        // so the keystroke stays unconsumed there.
        const focused = document.activeElement
        const rows = Array.from(
          menuRef.value?.querySelectorAll<HTMLButtonElement>(
            'button[role="menuitem"]:not([disabled]), button[role="menuitemradio"]:not([disabled]), button[role="switch"]:not([disabled])',
          ) ?? [],
        )
        if (focused instanceof HTMLButtonElement && rows.includes(focused)) {
          event.preventDefault()
          focused.click()
          return
        }
        if (focused !== triggerRef.value) return
        event.preventDefault()
        if (pane.value.kind === 'model' && showSearch.value) {
          setHighlightedIndex(null)
          searchRef.value?.focus()
          return
        }
        const checked = menuRef.value?.querySelector<HTMLElement>(
          '[role="menuitemradio"][aria-checked="true"]:not([disabled])',
        );
        (checked ?? rows.find(item => !item.disabled))?.focus()
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        moveFocus(event.key === 'ArrowDown' ? 1 : -1)
      }
    }
    const onBlur = (event: FocusEvent): void => {
      // Removing a focused pane control can blur before the post watcher restores
      // focus. Explanation text can also clear focus without leaving its page.
      if (
        event.relatedTarget === null &&
        (paneFocus.value !== null || pane.value.kind === 'detail')
      )
        return
      if (
        event.relatedTarget instanceof Node &&
        (rootRef.value?.contains(event.relatedTarget) === true ||
          menuRef.value?.contains(event.relatedTarget) === true)
      )
        return
      close()
    }
    const settleSelection = (result: Awaited<ReturnType<ModelSelectInjected['select']>>): void => {
      if (result === undefined) return
      if (result.ok) {
        if (rootRef.value !== null) closeAfterSelection()
        return
      }
      const { error } = result
      toastSeq.value += 1
      setToast({
        seq: toastSeq.value,
        text:
          error.code === 'session/writer-held'
            ? props.t('error.sessionInUse')
            : props.t('error.action', { message: `${error.code}: ${error.message}` }),
      })
    }
    const submit = (selection: ModelSelection): void => {
      lastActionRef.value = 'select'
      // Disabled option rows cannot retain focus while a selection is pending.
      setSelectionFocus(true)
      triggerRef.value?.focus()
      void props.select(selection).then(settleSelection)
    }
    const choose = (selection: ModelSelection): void => {
      if (
        state.value.current?.provider === selection.provider &&
        state.value.current.model === selection.model
      ) {
        closeAfterSelection()
        return
      }
      submit(selection)
    }
    const chooseEffort = (effort: string | undefined): void => {
      if (state.value.current === null) return
      if (effectiveEffort.value === effort) {
        closeAfterSelection()
        return
      }
      const selection: ModelSelection = {
        provider: state.value.current.provider,
        model: state.value.current.model,
        ...(effort === undefined ? {} : { reasoningEffort: effort }),
      }
      submit(selection)
    }
    const waiting = computed(
      () => currentChoice.value === undefined && state.value.status === 'loading',
    )
    const modelLabel = computed(() =>
      waiting.value
        ? props.t('trigger.loading')
        : (currentChoice.value?.model.name ?? props.t('trigger.fallback')),
    )
    const triggerLabel = computed(() =>
      effortLabel.value === undefined
        ? modelLabel.value
        : `${modelLabel.value} · ${effortLabel.value}`,
    )
    const triggerAria = computed(() =>
      waiting.value
        ? props.t('trigger.loading')
        : currentChoice.value === undefined
          ? props.t('trigger.selectAria')
          : effortLabel.value === undefined
            ? props.t('trigger.aria', { model: modelLabel.value })
            : props.t('trigger.ariaEffort', { model: modelLabel.value, effort: effortLabel.value }),
    )
    return () => {
      if (!props.available) return null
      const renderModelLabel = (
        provider: ModelLabelOwner['provider'],
        model: ModelLabelOwner['model'],
        placement: ModelLabelOwner['placement'],
        selected: boolean,
      ) => {
        const badge = model.badge
        return h('span', { 'data-provider-id': provider.id, 'data-model-id': model.id }, [
          props.renderSlot(
            'conversation.input.model.label',
            {
              provider,
              model,
              placement,
              selected,
            },
            {
              fallback:
                badge === undefined
                  ? model.name
                  : h('span', { class: css.badgedName }, [
                    placement === 'trigger'
                      ? [
                        h(
                          Tag,
                          { className: clsx(css.badge), tone: badge.tone },
                          { default: () => [props.resolveText(badge.text)] },
                        ),
                        ' ',
                      ]
                      : null,
                    h('span', { class: css.badgedNameText }, [model.name]),
                    placement === 'trigger'
                      ? null
                      : [
                        ' ',
                        h(
                          Tag,
                          { className: clsx(css.badge), tone: badge.tone },
                          { default: () => [props.resolveText(badge.text)] },
                        ),
                      ],
                  ]),
            },
          ),
        ])
      }
      const itemRef = (at: number): VNodeRef => {
        let element: HTMLButtonElement | null = null
        return (node) => {
          if (node instanceof HTMLButtonElement) {
            element = node
            itemRefs.value[at] = node
          } else if (itemRefs.value[at] === element) {
            // A removed row must not clear another row that now occupies its index.
            itemRefs.value[at] = null
          }
        }
      }
      return h(
        'div',
        {
          ref: rootRef,
          class: css.root,
          onKeydown: onRootKeyDown,
          onFocusout: onBlur,
          onMousedown: (event) => {
            // WebKit blurs a focused row before click unless the button's mousedown keeps focus.
            if (event.target instanceof Element && event.target.closest('button') !== null)
              event.preventDefault()
          },
        },
        [
          h(
            'button',
            {
              ref: triggerRef,
              type: 'button',
              class: css.trigger,
              style: anchorStyle,
              'aria-label': triggerAria.value,
              'aria-haspopup': 'menu',
              'aria-expanded': open.value,
              'aria-controls': open.value ? `${id}-menu` : undefined,
              title: triggerLabel.value,
              'aria-busy': busy.value,
              'data-selection-focus': selectionFocus.value ? '' : undefined,
              onBlur: () => {
                setSelectionFocus(false)
              },
              disabled: props.locked,
              onClick: () => {
                if (open.value) {
                  close(true)
                } else {
                  show()
                }
              },
            },
            [
              h(
                IconDataOutlineRegular,
                { className: clsx(css.triggerIcon), size: 16 },
                { default: () => [] },
              ),
              h('span', { class: css.triggerLabel }, [
                currentChoice.value === undefined
                  ? modelLabel.value
                  : renderModelLabel(
                    currentChoice.value.group.provider,
                    currentChoice.value.model,
                    'trigger',
                    true,
                  ),
              ]),
              effortLabel.value !== undefined &&
                h('span', { class: css.triggerEffort }, [effortLabel.value]),
              busy.value
                ? h(StateDot, { state: 'ongoing' }, { default: () => [] })
                : h(
                  IconChevronDownOutlineRegular,
                  { className: clsx(css.chevron, open.value && css.chevronOpen) },
                  { default: () => [] },
                ),
            ],
          ),
          open.value &&
            h(Teleport, { to: document.body }, [
              h(
                MenuSurface,
                {
                  elementRef: (node: HTMLDivElement | null) => {
                    menuRef.value = node
                  },
                  'data-model-menu': '',
                  tabIndex: pane.value.kind === 'detail' ? -1 : undefined,
                  id: `${id}-menu`,
                  className: clsx(
                    css.menu,
                    (pane.value.kind === 'root' || pane.value.kind === 'detail') &&
                      css.settingsMenu,
                  ),
                  style: anchorStyle,
                  onKeydown: onRootKeyDown,
                  onFocusout: onBlur,
                  onMousedown: (event: MouseEvent) => {
                    if (event.target instanceof Element && event.target.closest('button') !== null)
                      event.preventDefault()
                  },
                  role:
                    pane.value.kind === 'model' || pane.value.kind === 'detail' ? 'group' : 'menu',
                  'aria-label':
                    pane.value.kind === 'detail' ? pane.value.pane.title : props.t('menu.aria'),
                  'aria-busy': state.value.status === 'loading' || busy.value,
                },
                {
                  default: () => [
                    pane.value.kind === 'root' && [
                      h(
                        'button',
                        {
                          ref: itemRef(0),
                          type: 'button',
                          role: 'menuitem',
                          class: css.cell,
                          onClick: () => {
                            drill(MODEL_PANE)
                          },
                        },
                        [
                          h('span', { class: css.cellLabel }, [props.t('menu.model')]),
                          h('span', { class: css.cellValue }, [
                            currentChoice.value === undefined
                              ? modelLabel.value
                              : renderModelLabel(
                                currentChoice.value.group.provider,
                                currentChoice.value.model,
                                'menu',
                                true,
                              ),
                          ]),
                          h(
                            IconChevronRightOutlineRegular,
                            { className: clsx(css.cellChevron) },
                            { default: () => [] },
                          ),
                        ],
                      ),
                      reasoning.value !== undefined &&
                        h(
                          'button',
                          {
                            ref: itemRef(1),
                            type: 'button',
                            role: 'menuitem',
                            class: css.cell,
                            onClick: () => {
                              drill(EFFORT_PANE)
                            },
                          },
                          [
                            h('span', { class: css.cellLabel }, [props.t('menu.effort')]),
                            h('span', { class: css.cellValue }, [effortLabel.value]),
                            h(
                              IconChevronRightOutlineRegular,
                              { className: clsx(css.cellChevron) },
                              { default: () => [] },
                            ),
                          ],
                        ),
                      props.renderSlot('conversation.input.model.options', {
                        ...controls.value,
                        openPane: (pane) => {
                          drill({ kind: 'detail', pane })
                        },
                      }),
                    ],
                    pane.value.kind === 'model' && [
                      showSearch.value &&
                        h('div', { class: css.searchRow }, [
                          h(
                            Input,
                            {
                              elementRef: (node: HTMLInputElement | null) => {
                                searchRef.value = node
                              },
                              className: clsx(
                                css.search,
                                query.value !== '' && css.searchWithQuery,
                              ),
                              type: 'text',
                              role: 'searchbox',
                              'aria-label': props.t('search.placeholder'),
                              'aria-controls': `${id}-models`,
                              'aria-activedescendant':
                                activeModelIndex.value < 0
                                  ? undefined
                                  : `${id}-model-${activeModelIndex.value}`,
                              placeholder: props.t('search.placeholder'),
                              value: query.value,
                              readOnly: busy.value,
                              onInput: (event: Event) => {
                                if (event.target instanceof HTMLInputElement)
                                  changeQuery(event.target.value)
                              },
                            },
                            { default: () => [] },
                          ),
                          query.value !== '' &&
                            h(
                              'button',
                              {
                                type: 'button',
                                class: css.searchClear,
                                'aria-label': props.t('search.clear'),
                                disabled: busy.value,
                                onClick: () => {
                                  changeQuery('')
                                  searchRef.value?.focus()
                                },
                              },
                              [h(IconCloseFillRegular, {}, { default: () => [] })],
                            ),
                        ]),
                      state.value.status === 'loading' &&
                        h('div', { class: css.status }, [props.t('status.loading')]),
                      state.value.error !== null &&
                        lastActionRef.value === 'load' &&
                        h('div', { class: css.error }, [
                          h('span', {}, [props.t('error.action', { message: state.value.error })]),
                          h('button', { type: 'button', class: css.retry, onClick: reload }, [
                            props.t('retry'),
                          ]),
                        ]),
                      state.value.failures.map(failure =>
                        h('div', { class: css.warning, key: failure.id }, [
                          h('span', {}, [
                            props.t('warning.groupLoad', {
                              name:
                                failure.id === 'deepseek-account'
                                  ? props.t('provider.account')
                                  : failure.name,
                              message: failure.message,
                            }),
                          ]),
                          h('button', { type: 'button', class: css.retry, onClick: reload }, [
                            props.t('retry'),
                          ]),
                        ]),
                      ),
                      h(
                        'div',
                        {
                          ref: groupsRef,
                          id: `${id}-models`,
                          class: clsx(css.groups, 'scrollable'),
                          role: 'menu',
                          'aria-label': props.t('menu.model'),
                          hidden: filteredGroups.value.length === 0,
                        },
                        [
                          filteredGroups.value.map((group) => {
                            return h(
                              MenuGroup,
                              { key: group.id, label: group.provider.name },
                              {
                                default: () => [
                                  group.models.map((model) => {
                                    const index = visibleModels.value.findIndex(
                                      item =>
                                        item.provider === group.id && item.model === model.id,
                                    )
                                    const selected =
                                      state.value.current?.provider === group.id &&
                                      state.value.current.model === model.id
                                    return h(
                                      'button',
                                      {
                                        ref: itemRef(index),
                                        type: 'button',
                                        role: 'menuitemradio',
                                        'aria-checked': selected,
                                        id: `${id}-model-${index}`,
                                        tabIndex: showSearch.value ? -1 : 0,
                                        onFocus: () => {
                                          setHighlightedIndex(index)
                                        },
                                        'data-highlighted':
                                          index === activeModelIndex.value ? '' : undefined,
                                        class: clsx(
                                          css.option,
                                          css.modelOption,
                                          selected && css.selected,
                                          index === activeModelIndex.value && css.optionActive,
                                        ),
                                        onMousemove:
                                          busy.value || index === activeModelIndex.value
                                            ? undefined
                                            : () => {
                                              if (showSearch.value) setHighlightedIndex(index)
                                              else itemRefs.value[index]?.focus()
                                            },
                                        key: model.id,
                                        title: model.name,
                                        disabled: busy.value,
                                        onClick: () => {
                                          choose({ provider: group.id, model: model.id })
                                        },
                                      },
                                      [
                                        h('span', { class: css.optionCopy }, [
                                          h('span', { class: css.modelName }, [
                                            renderModelLabel(
                                              group.provider,
                                              model,
                                              'option',
                                              selected,
                                            ),
                                          ]),
                                        ]),
                                        h('span', { class: css.check }, [
                                          pending.value?.provider === group.id &&
                                          pending.value.model === model.id
                                            ? h(
                                              StateDot,
                                              { state: 'ongoing' },
                                              { default: () => [] },
                                            )
                                            : selected
                                              ? h(
                                                IconCheckOutlineRegular,
                                                {},
                                                { default: () => [] },
                                              )
                                              : null,
                                        ]),
                                      ],
                                    )
                                  }),
                                ],
                              },
                            )
                          }),
                        ],
                      ),
                      state.value.status === 'ready' &&
                        filteredGroups.value.length === 0 &&
                        h('div', { class: css.empty, role: 'status' }, [
                          props.t(choices.value.length === 0 ? 'empty.models' : 'search.empty'),
                        ]),
                    ],
                    pane.value.kind === 'effort' && [
                      state.value.error !== null &&
                        lastActionRef.value === 'load' &&
                        h('div', { class: css.error }, [
                          h('span', {}, [props.t('error.action', { message: state.value.error })]),
                          h('button', { type: 'button', class: css.retry, onClick: reload }, [
                            props.t('action.reload'),
                          ]),
                        ]),
                      h('div', { class: clsx(css.groups, 'scrollable') }, [
                        effortChoices.value.length === 0
                          ? h('div', { class: css.empty }, [props.t('empty.efforts')])
                          : effortChoices.value.map((level, index) =>
                            h(
                              'button',
                              {
                                ref: itemRef(index),
                                type: 'button',
                                role: 'menuitemradio',
                                'aria-checked': effectiveEffort.value === level.effort,
                                class: clsx(
                                  css.option,
                                  effectiveEffort.value === level.effort && css.selected,
                                ),
                                key: level.key,
                                disabled: busy.value,
                                onClick: () => {
                                  chooseEffort(level.effort)
                                },
                              },
                              [
                                h('span', { class: css.optionCopy }, [
                                  h('span', { class: css.modelName }, [level.label]),
                                ]),
                                h('span', { class: css.check }, [
                                  pending.value !== null &&
                                    pending.value.provider === state.value.current?.provider &&
                                    pending.value.model === state.value.current.model &&
                                    pending.value.reasoningEffort === level.effort
                                    ? h(StateDot, { state: 'ongoing' }, { default: () => [] })
                                    : effectiveEffort.value === level.effort
                                      ? h(IconCheckOutlineRegular, {}, { default: () => [] })
                                      : null,
                                ]),
                              ],
                            ),
                          ),
                      ]),
                    ],
                    pane.value.kind === 'detail' &&
                      h('div', { class: clsx(css.groups, 'scrollable') }, [
                        props.renderSlot('conversation.input.model.pane', controls.value, {
                          entryKey: pane.value.pane.key,
                        }),
                      ]),
                  ],
                },
              ),
            ]),
          toast.value !== null &&
            h(
              Toast,
              {
                key: toast.value.seq,
                text: toast.value.text,
                icon: h(IconWarningOutlineRegular, {}, { default: () => [] }),
                anchor: rootRef.value?.closest<HTMLElement>('[data-composer-card]') ?? null,
                onDone: () => {
                  setToast(null)
                },
              },
              { default: () => [] },
            ),
        ],
      )
    }
  },
  {
    props: [
      'locked',
      'available',
      'useDirectory',
      'load',
      'select',
      'resolveText',
      't',
      'renderSlot',
    ],
    inheritAttrs: false,
  },
)
