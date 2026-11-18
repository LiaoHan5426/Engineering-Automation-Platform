import { defineComponent, h, shallowRef, computed, watchPostEffect, type VNodeChild } from 'vue'
/**
 * Review controls of the changes toolbar: the lens that keeps the files of one review layer, as a full-width
 * radio group above the file tree or as a menu where no tree shows; the switch that hides test files; and the
 * share of shown files the reader marked viewed. The thread list shares the segmented radio group.
 */
import {
  IconChevronDownOutlineRegular,
  Menu,
  Switch,
  Tooltip,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ChangesLens } from './changes-store.ts'
import type { ForgePanelKey, NS } from './locales.ts'
import css from './ReviewControls.module.css'
/** Lenses in display order. */
export const LENSES: readonly ChangesLens[] = ['all', 'interface', 'implementation', 'test']
const LENS_LABEL: Record<ChangesLens, ForgePanelKey> = {
  all: 'lens.all',
  interface: 'lens.interface',
  implementation: 'lens.implementation',
  test: 'lens.test',
}
/** Props shared by both forms of the lens. */
export interface LensProps extends PropsLocale<typeof NS> {
  /** The lens shown. */
  readonly lens: ChangesLens
  /** Files each lens keeps among the files the switch leaves. */
  readonly counts: Readonly<Record<ChangesLens, number>>
  /** Whether test files hide, which disables the `test` lens. */
  readonly hideTests: boolean
  /** Show another lens. */
  readonly choose: (lens: ChangesLens) => void
}
/** One segment of a {@link SegmentedChoice}. */
export interface Segment<Value extends string> {
  /** Value the segment chooses. */
  readonly value: Value
  /** Localized label. */
  readonly label: string
  /** Count shown after the label, or null for none. */
  readonly count: number | null
  /** Localized hover text of a disabled segment, or null for an enabled one. */
  readonly disabledTip: string | null
}
/**
 * Render a radio group whose segments share its width, each with a count after its label; arrow keys, Home, and End
 * move between enabled segments.
 * @param props - the segments, the chosen value, the choose action, and the group's localized accessible name.
 * @returns the radio group.
 */
export const SegmentedChoice = defineComponent(
  <Value extends string>(props: {
    readonly segments: readonly Segment<Value>[]
    readonly value: Value
    readonly choose: (value: Value) => void
    readonly label: string
    readonly sizing?: 'equal' | 'content'
    readonly counted?: boolean
  }) => {
    const group = shallowRef<HTMLDivElement | null>(null)
    return () => {
      const enabled = props.segments
        .filter(segment => segment.disabledTip === null)
        .map(segment => segment.value)
      const move = (event: KeyboardEvent): void => {
        const at = enabled.indexOf(props.value)
        let next: Value | undefined
        switch (event.key) {
          case 'ArrowLeft':
          case 'ArrowUp':
            next = enabled[(at + enabled.length - 1) % enabled.length]
            break
          case 'ArrowRight':
          case 'ArrowDown':
            next = enabled[(at + 1) % enabled.length]
            break
          case 'Home':
            next = enabled[0]
            break
          case 'End':
            next = enabled.at(-1)
            break
          default:
            return
        }
        event.preventDefault()
        event.stopPropagation()
        /* v8 ignore next -- every caller keeps a segment enabled, so every key lands on one */
        if (next === undefined) return
        props.choose(next)
        group.value?.querySelector<HTMLButtonElement>(`[data-segment="${next}"]`)?.focus()
      }
      return h(
        'div',
        { ref: group, role: 'radiogroup', 'aria-label': props.label, class: css.segmented, 'data-sizing': props.sizing ?? 'equal' },
        [
          props.segments.map((segment) => {
            const button = h(
              'button',
              {
                key: segment.value,
                type: 'button',
                role: 'radio',
                class: css.segment,
                'aria-checked': props.value === segment.value,
                disabled: segment.disabledTip !== null,
                tabindex: props.value === segment.value ? 0 : -1,
                'data-segment': segment.value,
                onKeydown: move,
                onClick: () => {
                  props.choose(segment.value)
                },
              },
              [
                h('span', { class: css.segmentLabel }, [segment.label]),
                h('span', { class: (props.counted ?? true) ? css.count : css.hiddenCount }, [segment.count ?? '']),
              ],
            )
            const tip = segment.disabledTip ?? ((props.counted ?? true) || segment.count === null ? null : `${segment.label} ${String(segment.count)}`)
            return h(Tooltip, { key: segment.value, label: tip ?? segment.label, side: 'bottom', delayMs: 500, disabled: tip === null }, { default: () => [button] })
          }),
        ],
      )
    }
  },
  { props: ['segments', 'value', 'choose', 'label', 'sizing', 'counted'] },
)
/**
 * Render the lens as a radio group whose segments share its width.
 * @param props - the lens, its counts, whether test files hide, the choose action, and copy.
 * @returns the radio group.
 */
export const LensControl = defineComponent((props: LensProps & {
  /** Receives the cell width, padding included, at which labels fit without counts. */
  readonly need: (width: number) => void
}) => {
  const root = shallowRef<HTMLDivElement | null>(null)
  const withCounts = shallowRef<HTMLDivElement | null>(null)
  const labelsOnly = shallowRef<HTMLDivElement | null>(null)
  const counted = shallowRef(true)
  const segments = computed(() => LENSES.map((item): Segment<ChangesLens> => item === 'test' && props.hideTests
    ? { value: item, label: props.t(LENS_LABEL[item]), count: null, disabledTip: props.t('lens.testHidden') }
    : { value: item, label: props.t(LENS_LABEL[item]), count: props.counts[item], disabledTip: null }))
  watchPostEffect((onCleanup) => {
    JSON.stringify(segments.value.map(segment => [segment.label, segment.count]))
    const element = root.value
    const full = withCounts.value
    const bare = labelsOnly.value
    const cell = element?.parentElement
    if (element === null || full === null || bare === null || cell === null || cell === undefined) return
    let live = true
    const width = (node: Element): number => node.getBoundingClientRect().width
    const measure = (): void => {
      const available = width(element)
      if (!live || available === 0) return
      counted.value = width(full) <= available
      props.need(Math.ceil(width(bare) + width(cell) - available))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    const fonts = document.fonts
    fonts.addEventListener('loadingdone', measure)
    onCleanup(() => {
      live = false
      observer.disconnect()
      fonts.removeEventListener('loadingdone', measure)
    })
  })
  return () => {
    const common = { label: props.t('lens.aria'), value: props.lens, choose: props.choose, segments: segments.value, sizing: 'content' as const }
    return h('div', { ref: root, class: css.lensFit }, [
      h(SegmentedChoice<ChangesLens>, { ...common, counted: counted.value }),
      h('div', { class: css.measures, 'aria-hidden': 'true', inert: '' }, [
        h('div', { ref: withCounts }, [h(SegmentedChoice<ChangesLens>, { ...common, label: '' })]),
        h('div', { ref: labelsOnly }, [h(SegmentedChoice<ChangesLens>, { ...common, label: '', counted: false })]),
      ]),
    ])
  }
}, { name: 'LensControl', props: ['lens', 'counts', 'hideTests', 'choose', 'need', 't'] })
/**
 * Render the lens as a menu button, for a toolbar without the file tree beside it.
 * @param props - the lens, its counts, whether test files hide, the choose action, copy, and whether the owning tab is visible.
 * @returns the trigger with its portalled menu.
 */
export const LensMenu = defineComponent(
  (
    props: LensProps & {
      readonly visible: boolean
    },
  ) => {
    const open = shallowRef(false)
    const setOpen = (
      next: typeof open.value | ((previous: typeof open.value) => typeof open.value),
    ) => {
      open.value = typeof next === 'function' ? next(open.value) : next
    }
    return () => {
      const items: MenuEntry[] = LENSES.map((item) => {
        // Like the segment, a disabled lens shows no count, since hidden test files are not counted.
        const disabled = item === 'test' && props.hideTests
        return {
          id: item,
          disabled,
          label: h('span', { class: css.menuRow }, [
            h('span', null, [props.t(LENS_LABEL[item])]),
            h('span', { class: css.count }, [disabled ? '' : props.counts[item]]),
          ]),
        }
      })
      return h(
        Menu,
        {
          open: props.visible && open.value,
          portal: true,
          dense: true,
          align: 'start',
          autoFocus: true,
          selectedId: props.lens,
          items: items,
          onClose: () => {
            setOpen(false)
          },
          onSelect: (id) => {
            setOpen(false)
            props.choose(id as ChangesLens)
          },
        },
        {
          anchor: () =>
            h(
              'button',
              {
                type: 'button',
                class: css.trigger,
                'aria-haspopup': 'menu',
                'aria-expanded': props.visible && open.value,
                'aria-label': props.t('lens.menuAria', { lens: props.t(LENS_LABEL[props.lens]) }),
                'data-forge-lens-menu': props.lens,
                onClick: () => {
                  setOpen(value => !value)
                },
              },
              [props.t(LENS_LABEL[props.lens]), h(IconChevronDownOutlineRegular, { size: 12 })],
            ),
        },
      )
    }
  },
  { props: ['lens', 'counts', 'hideTests', 'choose', 'visible', 't'] },
)
/**
 * Render the switch that hides test files, with its label beside it where the toolbar has room.
 * @param props - whether test files hide, the toggle action, and copy.
 * @returns the switch and its label.
 */
export function HideTestsSwitch({
  hidden,
  toggle,
  t,
}: PropsLocale<typeof NS> & {
  readonly hidden: boolean
  readonly toggle: () => void
}): VNodeChild {
  return h(
    Tooltip,
    { label: t('tests.hideHint'), side: 'bottom', delayMs: 500 },
    {
      default: () => [
        h('label', { class: css.switch, 'data-forge-hide-tests': '' }, [
          h(Switch, { checked: hidden, label: t('tests.hide'), onChange: toggle }),
          h('span', { class: css.switchLabel, 'aria-hidden': 'true' }, [t('tests.hide')]),
        ]),
      ],
    },
  )
}
/** Radius of the progress ring, inside its 14px box with a 2px stroke. */
const RING_RADIUS = 5.5
/**
 * Render how many of the shown files the reader marked viewed: a ring filled to the viewed share, then a label, or the
 * bare count that a narrow toolbar shows instead (`data-forge-progress` names each form for the toolbar's styles).
 * @param props - the viewed and shown file counts, and copy.
 * @returns the progress, or nothing without shown files.
 */
export function ViewedProgress({
  viewed,
  total,
  t,
}: PropsLocale<typeof NS> & {
  readonly viewed: number
  readonly total: number
}): VNodeChild {
  if (total === 0) return null
  const counts = { viewed: String(viewed), total: String(total) }
  const label = t('viewed.progress', counts)
  const circumference = 2 * Math.PI * RING_RADIUS
  return h(
    'span',
    {
      class: css.progress,
      role: 'progressbar',
      'aria-label': t('viewed.progressAria'),
      'aria-valuemin': 0,
      'aria-valuemax': total,
      'aria-valuenow': viewed,
      'aria-valuetext': label,
      'data-forge-viewed-progress': `${viewed}/${total}`,
    },
    [
      h('svg', { class: css.ring, viewBox: '0 0 14 14', 'aria-hidden': 'true' }, [
        h('circle', { class: css.ringTrack, cx: '7', cy: '7', r: RING_RADIUS }),
        h('circle', {
          class: css.ringFill,
          cx: '7',
          cy: '7',
          r: RING_RADIUS,
          'stroke-dasharray': `${(viewed / total) * circumference} ${circumference}`,
        }),
      ]),
      h('span', { class: css.progressForm, 'data-forge-progress': 'full' }, [label]),
      h('span', { class: css.progressForm, 'data-forge-progress': 'compact' }, [
        t('viewed.count', counts),
      ]),
    ],
  )
}
