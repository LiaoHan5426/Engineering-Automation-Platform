/**
 * Official popupSelect shell: renders one session's PopupSelectController
 * store into the conversation.input.overlay anchor. Unlike the slash menu
 * (combobox — textarea keeps focus), this shell focuses its search input on
 * desktop; phones and tablets require explicit search focus. Typing filters
 * the loaded options locally, Enter and Tab accept the filtered highlight,
 * ↑↓ walk it (wrapping,
 * scrolled into view), and Escape and Shift+Tab dismiss back to the composer.
 * ←→ keep the search input's native caret. Any pointer interaction outside the
 * box dismisses (the click's own target takes focus). Closed state renders
 * null; the overlay slot stays mounted. The card height clamps to the space
 * above the composer.
 */
import {
  MenuGroup,
  MenuSurface,
  observeStickyMenuGroups,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { Fragment, h, defineComponent, shallowRef, computed, watch, watchEffect } from 'vue'
import clsx from 'clsx'
import {
  IconCheckOutlineRegular,
  isMobileDevice,
  RiskConfirmation,
  useAnchoredMaxHeight,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import { filterOptions } from './popup.ts'
import type { SelectOption } from './contract.ts'
import { groupOptions } from './option-groups.ts'
import type { PopupSelectController } from './popup.ts'
import css from './PopupSelectView.module.css'
/** Design cap on the card height (same MenuDropdown family as the slash menu). */
const MAX_HEIGHT = 320
/** Injected business face of the popupSelect overlay entry. */
export interface PopupSelectInjected {
  /** The session's shell controller (state store + verbs; the view never touches the open-context type). */
  popup: PopupSelectController
}
/** Full shell props: injected face + the locale seat. */
export type PopupSelectViewProps = PopupSelectInjected & PropsLocale<'command'>
/**
 * Render the popupSelect shell overlay entry.
 * @param props - injected face: the session's shell controller; `t` rides the standard locale seat.
 * @returns the select card while open; null while closed.
 */
export const PopupSelectView = defineComponent(
  (props: PopupSelectViewProps) => {
    const stateSeat = shallowRef(props.popup.state.getSnapshot())
    watchEffect((onCleanup) => {
      const store = props.popup.state
      stateSeat.value = store.getSnapshot()
      onCleanup(
        store.subscribe(() => {
          stateSeat.value = store.getSnapshot()
        }),
      )
    })
    const cardRef = shallowRef<HTMLDivElement | null>(null)
    const searchRef = shallowRef<HTMLInputElement | null>(null)
    const viewportRef = shallowRef<HTMLDivElement | null>(null)
    const filtered = computed(() => filterOptions(stateSeat.value.options, stateSeat.value.search))
    const grouped = computed(() => groupOptions(filtered.value))
    watch(
      [
        viewportRef,
        grouped,
        () => stateSeat.value.open,
        () => stateSeat.value.status,
        () => stateSeat.value.confirming,
      ],
      (_, __, onCleanup) => {
        if (viewportRef.value !== null) onCleanup(observeStickyMenuGroups(viewportRef.value))
      },
      { flush: 'post' },
    )
    const height = useAnchoredMaxHeight(cardRef, MAX_HEIGHT, () => stateSeat.value)
    watch(
      [
        () => (stateSeat.value.open ? stateSeat.value.active : null),
        filtered,
        () => stateSeat.value.confirming,
      ],
      ([active]) => {
        if (active !== null)
          cardRef.value
            ?.querySelector('[aria-selected="true"]')
            ?.scrollIntoView({ block: 'nearest' })
      },
      { flush: 'post' },
    )
    watch(
      [() => stateSeat.value.open, () => stateSeat.value.confirming],
      ([open, confirming], _, onCleanup) => {
        if (!open || confirming !== null) return
        const onPointerDown = (ev: PointerEvent) => {
          if (
            cardRef.value !== null &&
            ev.target instanceof Node &&
            cardRef.value.contains(ev.target)
          )
            return
          props.popup.dismiss()
        }
        document.addEventListener('pointerdown', onPointerDown, true)
        onCleanup(() => {
          document.removeEventListener('pointerdown', onPointerDown, true)
        })
      },
      { immediate: true },
    )
    watch(
      [() => stateSeat.value.open, () => stateSeat.value.confirming, searchRef],
      ([open, confirming]) => {
        if (open && confirming === null && !isMobileDevice()) searchRef.value?.focus()
      },
      { flush: 'post' },
    )
    return () => {
      const { popup, t } = props
      const state = stateSeat.value
      const rows = filtered.value
      const groups = grouped.value
      const maxHeight = `${height.value}px`
      if (!state.open) return null
      const confirmation = state.confirming?.confirmation
      const emptyLabel =
        state.searchLabels === null
          ? t('status.empty')
          : state.options.length === 0
            ? state.searchLabels.empty
            : state.searchLabels.noResults
      const onKeydown = (ev: KeyboardEvent): void => {
        // ArrowLeft/ArrowRight fall through on purpose: the search input keeps
        // its native caret movement.
        switch (ev.key) {
          case 'ArrowDown':
            ev.preventDefault()
            popup.move(1)
            return
          case 'ArrowUp':
            ev.preventDefault()
            popup.move(-1)
            return
          case 'Enter':
            ev.preventDefault()
            void popup.select(state.active)
            return
          // Tab settles like Enter and Shift+Tab dismisses like Escape, so the
          // card's keys mean what they mean in the composer. Both must be consumed:
          // the shell HOLDS focus, and native traversal would leave an open card
          // whose search input lost focus.
          case 'Tab':
            // With nothing to settle — still loading, failed, or filtered empty —
            // the keystroke stays the browser's, which is how the error strip's
            // retry button remains reachable.
            if (!ev.shiftKey && (state.status !== 'ready' || rows.length === 0)) return
            ev.preventDefault()
            if (ev.shiftKey) popup.dismiss({ focusComposer: true })
            else void popup.select(state.active)
            return
          case 'Escape':
            ev.preventDefault()
            popup.dismiss({ focusComposer: true })
            return
          default:
        }
      }
      const renderOption = (option: SelectOption, index: number) =>
        h(
          'div',
          {
            key: option.id,
            role: 'option',
            'aria-selected': index === state.active,
            'aria-label':
              option.badge === undefined ? undefined : `${option.label} ${option.badge}`,
            class: clsx(css.row, index === state.active && css.rowActive),
            onClick: () => {
              void popup.select(index)
            },
            onMouseenter: () => {
              popup.highlight(index)
            },
          },
          [
            h('span', { class: css.label }, [
              h('span', { class: css.labelText }, [option.label]),
              option.badge !== undefined && h('sup', { class: css.badge }, [option.badge]),
            ]),
            option.detail !== undefined && h('span', { class: css.detail }, [option.detail]),
            option.active === true && h('span', { class: css.check }, [h(IconCheckOutlineRegular)]),
          ],
        )
      // Group slots can run in a different order from the filtered rows.
      return h(Fragment, null, [
        state.confirming === null &&
          h(
            MenuSurface,
            {
              elementRef: (element) => {
                cardRef.value = element
              },
              className: clsx(css.card),
              style: { maxHeight },
              'aria-label': t('overlay.aria', { command: String(state.command) }),
              onKeydown: onKeydown,
            },
            {
              default: () => [
                h('input', {
                  ref: searchRef,
                  class: css.search,
                  type: 'text',
                  placeholder: state.searchLabels?.placeholder ?? t('search.placeholder'),
                  'aria-label': t('search.aria'),
                  value: state.search,
                  readonly: state.submitting,
                  onInput: (ev: Event) => {
                    if (ev.currentTarget instanceof HTMLInputElement)
                      popup.setSearch(ev.currentTarget.value)
                  },
                }),
                state.error !== null &&
                  h('div', { class: css.error, role: 'alert' }, [
                    h('span', { class: css.errorText }, [state.error]),
                    state.status === 'failed' &&
                      h(
                        'button',
                        {
                          type: 'button',
                          class: css.retry,
                          onClick: () => {
                            popup.retry()
                          },
                        },
                        [t('retry')],
                      ),
                  ]),
                state.status === 'pending' &&
                  h('div', { class: css.status }, [t('status.loading')]),
                state.submitting && h('div', { class: css.status }, [t('status.applying')]),
                state.status === 'ready' &&
                  rows.length === 0 &&
                  h('div', { class: css.status }, [emptyLabel]),
                state.status === 'ready' &&
                  h(
                    'div',
                    {
                      ref: viewportRef,
                      role: 'listbox',
                      'aria-label': t('listbox.aria', { command: String(state.command) }),
                      class: css.viewport,
                    },
                    [
                      groups.map(({ group, rows: groupRows }) =>
                        group === undefined
                          ? h(Fragment, { key: 'ungrouped' }, [
                            groupRows.map(option =>
                              renderOption(option, rows.lastIndexOf(option)),
                            ),
                          ])
                          : h(
                            MenuGroup,
                            { key: `group:${group.name}`, label: group.label },
                            {
                              default: () => [
                                groupRows.map(option =>
                                  renderOption(option, rows.lastIndexOf(option)),
                                ),
                              ],
                            },
                          ),
                      ),
                    ],
                  ),
              ],
            },
          ),
        confirmation !== undefined &&
          h(RiskConfirmation, {
            open: true,
            title: confirmation.title,
            description: confirmation.description,
            acknowledgeLabel: confirmation.acknowledgeLabel,
            cancelLabel: confirmation.cancelLabel,
            closeLabel: t('close'),
            confirmLabel: confirmation.confirmLabel,
            acknowledged: state.acknowledged,
            onAcknowledgedChange: (value) => {
              popup.acknowledge(value)
            },
            onCancel: () => {
              popup.cancelConfirmation()
            },
            onConfirm: () => {
              void popup.confirm()
            },
          }),
      ])
    }
  },
  { props: ['popup', 't'] },
)
