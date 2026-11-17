import {
  defineComponent,
  h,
  createVNode,
  Fragment,
  computed,
  shallowRef,
  useId,
  watch,
  Teleport,
  type VNodeChild,
} from 'vue'
/** Anchored type-filter editor with asynchronous suggestions and explicit confirmation. */
import { MenuSurface } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import css from './inspector.module.css'
/** Current confirmed query and an asynchronous candidate source. */
export type InspectorTypeFilterProps = PropsLocale<'session-inspector'> & {
  readonly value: string
  readonly suggest: (query: string) => Promise<readonly string[]>
  readonly apply: (query: string) => void
}
/**
 * Edit a type fragment without filtering until Enter, Apply, or a candidate is selected.
 * @param props - Confirmed query, candidate resolver, commit callback, and localized copy.
 * @returns A header button and its portaled editor; stale responses cannot replace newer suggestions.
 */
const portal = (content: VNodeChild, to: HTMLElement) => createVNode(Teleport, { to }, [content])
export const TypeFilter = defineComponent(
  (props: InspectorTypeFilterProps) => {
    const open = shallowRef(false)
    const setOpen = (
      next: typeof open.value | ((previous: typeof open.value) => typeof open.value),
    ) => {
      open.value = typeof next === 'function' ? next(open.value) : next
    }
    const draft = shallowRef(props.value)
    const setDraft = (
      next: typeof draft.value | ((previous: typeof draft.value) => typeof draft.value),
    ) => {
      draft.value = typeof next === 'function' ? next(draft.value) : next
    }
    const active = shallowRef(-1)
    const setActive = (
      next: typeof active.value | ((previous: typeof active.value) => typeof active.value),
    ) => {
      active.value = typeof next === 'function' ? next(active.value) : next
    }
    const result = shallowRef<
      | {
        query: string
        items: readonly string[]
        error?: string
      }
      | undefined
    >(undefined)
    const setResult = (
      next: typeof result.value | ((previous: typeof result.value) => typeof result.value),
    ) => {
      result.value = typeof next === 'function' ? next(result.value) : next
    }
    const anchor = shallowRef<HTMLButtonElement | null>(null)
    const panel = shallowRef<HTMLDivElement | null>(null)
    const input = shallowRef<HTMLInputElement | null>(null)
    const id = useId()
    const listId = `${id}-types`
    const anchorName = `--dsh-type-filter-${id.replaceAll(':', '')}`
    const close = (restoreFocus: boolean) => {
      setOpen(false)
      if (restoreFocus) anchor.value?.focus({ preventScroll: true })
    }
    const commit = (query: string): void => {
      props.apply(query)
      close(true)
    }
    watch(
      () => [open.value],
      () => {
        if (!open.value) return
        input.value?.focus({ preventScroll: true })
        input.value?.select()
      },
      { immediate: true, flush: 'post' },
    )
    watch(
      () => [open.value, close],
      (_next, _previous, onCleanup) => {
        const dispose = (() => {
          if (!open.value) return
          const outside = (event: PointerEvent): void => {
            const target = event.target
            if (
              target instanceof Node &&
              !panel.value?.contains(target) &&
              !anchor.value?.contains(target)
            )
              close(false)
          }
          const blur = (): void => {
            close(false)
          }
          window.addEventListener('pointerdown', outside, true)
          window.addEventListener('blur', blur)
          return () => {
            window.removeEventListener('pointerdown', outside, true)
            window.removeEventListener('blur', blur)
          }
        })()
        if (typeof dispose === 'function') onCleanup(dispose)
      },
      { immediate: true, flush: 'post' },
    )
    watch(
      () => [open.value, draft.value, props.suggest],
      (_next, _previous, onCleanup) => {
        const dispose = (() => {
          if (!open.value) return
          let valid = true
          setResult(undefined)
          setActive(-1)
          void Promise.resolve()
            .then(() => props.suggest(draft.value))
            .then(
              (items) => {
                if (valid) setResult({ query: draft.value, items })
              },
              (error: unknown) => {
                if (valid)
                  setResult({
                    query: draft.value,
                    items: [],
                    error: error instanceof Error ? error.message : String(error),
                  })
              },
            )
          return () => {
            valid = false
          }
        })()
        if (typeof dispose === 'function') onCleanup(dispose)
      },
      { immediate: true, flush: 'post' },
    )
    const current = computed(() =>
      result.value?.query === draft.value ? result.value : undefined,
    )
    const items = computed(() => current.value?.items ?? [])
    const selected = computed(() =>
      active.value >= 0 && active.value < items.value.length ? active.value : -1,
    )
    watch(
      () => [selected.value],
      () => {
        if (selected.value >= 0)
          panel.value
            ?.querySelectorAll<HTMLElement>('[role="option"]')
            [selected.value]?.scrollIntoView({ block: 'nearest' })
      },
      { immediate: true, flush: 'post' },
    )
    return () => {
      return createVNode(Fragment, null, [
        h(
          'button',
          {
            ref: anchor,
            style: { anchorName },
            type: 'button',
            class: css.typeFilterButton,
            'aria-label': props.t('filter.title'),
            title:
              props.value === ''
                ? props.t('filter.title')
                : `${props.t('filter.title')}: *${props.value}*`,
            'aria-haspopup': 'dialog',
            'aria-expanded': open.value,
            'aria-pressed': props.value !== '',
            onClick: () => {
              if (open.value) {
                close(true)
                return
              }
              setDraft(props.value)
              setResult(undefined)
              setActive(-1)
              setOpen(true)
            },
          },
          [
            h(
              'svg',
              {
                width: '13',
                height: '13',
                viewBox: '0 0 16 16',
                fill: 'none',
                stroke: 'currentColor',
                'stroke-width': '1.3',
                'aria-hidden': 'true',
              },
              [h('path', { d: 'M2 3h12L9.5 8v5l-3-1.5V8L2 3Z' })],
            ),
          ],
        ),
        open.value &&
          portal(
            h(
              MenuSurface,
              {
                compact: true,
                elementRef: (element: HTMLDivElement | null) => {
                  panel.value = element
                },
                className: css.typeFilterPanel ?? '',
                role: 'dialog',
                'aria-label': props.t('filter.title'),
                style: { positionAnchor: anchorName },
                onKeydown: (event: KeyboardEvent) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    event.stopPropagation()
                    close(true)
                  }
                },
                onFocusout: (event: FocusEvent) => {
                  if (
                    event.relatedTarget instanceof Node &&
                    !(event.currentTarget as HTMLElement).contains(event.relatedTarget) &&
                    !anchor.value?.contains(event.relatedTarget)
                  )
                    close(false)
                },
              },
              {
                default: () => [
                  h('div', null, [
                    h('input', {
                      ref: input,
                      class: css.typeFilterInput,
                      value: draft.value,
                      role: 'combobox',
                      'aria-label': props.t('filter.input'),
                      'aria-autocomplete': 'list',
                      'aria-expanded': true,
                      'aria-controls': listId,
                      'aria-activedescendant':
                        selected.value < 0 ? undefined : `${id}-option-${selected.value}`,
                      placeholder: props.t('filter.placeholder'),
                      onInput: (event) => {
                        setDraft((event.currentTarget as HTMLInputElement).value)
                        setActive(-1)
                      },
                      onKeydown: (event: KeyboardEvent) => {
                        // Safari reports IME confirmation with 229 after isComposing clears.
                        // oxlint-disable-next-line typescript/no-deprecated
                        if (event.isComposing || event.keyCode === 229) return
                        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                          event.preventDefault()
                          setActive(
                            items.value.length === 0
                              ? -1
                              : selected.value < 0
                                ? event.key === 'ArrowDown'
                                  ? 0
                                  : items.value.length - 1
                                : (selected.value +
                                    (event.key === 'ArrowDown' ? 1 : -1) +
                                    items.value.length) %
                                  items.value.length,
                          )
                        } else if (event.key === 'Enter') {
                          event.preventDefault()
                          commit(items.value[selected.value] ?? draft.value)
                        }
                      },
                    }),
                    h('div', { class: css.typeFilterHelp }, [props.t('filter.help')]),
                    h(
                      'div',
                      {
                        id: listId,
                        role: 'listbox',
                        'aria-label': props.t('filter.candidates'),
                        'aria-busy': current.value === undefined,
                        class: css.typeFilterOptions,
                      },
                      [
                        items.value.map((type, index) =>
                          h(
                            'button',
                            {
                              key: type,
                              id: `${id}-option-${index}`,
                              type: 'button',
                              role: 'option',
                              'aria-selected': selected.value === index,
                              tabindex: -1,
                              title: type,
                              onPointerdown: (event) => {
                                event.preventDefault()
                              },
                              onClick: () => {
                                commit(type)
                              },
                            },
                            [type],
                          ),
                        ),
                      ],
                    ),
                    current.value === undefined &&
                      h('div', { role: 'status' }, [props.t('filter.loading')]),
                    current.value?.error !== undefined
                      ? h('div', { role: 'alert' }, [props.t('filter.failed'), current.value.error])
                      : current.value !== undefined &&
                        items.value.length === 0 &&
                        h('div', { role: 'status' }, [props.t('filter.noCandidates')]),
                    h('div', { class: css.typeFilterActions }, [
                      h(
                        'button',
                        {
                          type: 'button',
                          onClick: () => {
                            setDraft('')
                            setActive(-1)
                            input.value?.focus()
                          },
                        },
                        [props.t('filter.clear')],
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          onClick: () => {
                            close(true)
                          },
                        },
                        [props.t('filter.cancel')],
                      ),
                      h(
                        'button',
                        {
                          type: 'button',
                          onClick: () => {
                            commit(draft.value)
                          },
                        },
                        [props.t('filter.apply')],
                      ),
                    ]),
                  ]),
                ],
              },
            ),
            document.body,
          ),
      ])
    }
  },
  { props: ['value', 'suggest', 'apply', 't'] },
)
