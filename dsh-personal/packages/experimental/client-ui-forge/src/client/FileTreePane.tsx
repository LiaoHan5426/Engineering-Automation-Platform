import { defineComponent, h, computed, shallowRef, watch } from 'vue'
/** Resizable file navigation; width belongs to the mounted tab and survives hiding the pane. */
import clsx from 'clsx'
import changesCss from './ChangesTab.module.css'
import { ChangedFiles, type ChangedFilesProps } from './ChangedFiles.tsx'
import css from './FileTreePane.module.css'
const MIN_WIDTH = 200
const MAX_WIDTH = 600
const DIFF_MIN_WIDTH = 320
/** Placement of a tab's file navigator; hiding it retains its viewing choices. */
export type FileTreePosition = 'right' | 'left' | 'hidden'
/**
 * Render a keyboard- and pointer-resizable tree beside the diff.
 * @param props - tree rows, pane position, the toggle's controlled element id, and the receiver of the shown width.
 * @returns the bounded pane and its resize separator.
 */
export const FileTreePane = defineComponent(
  (
    props: ChangedFilesProps & {
      readonly position: FileTreePosition
      readonly id: string
      /** Width required by the toolbar cell above the tree. */
      readonly least?: number
      /** Receives the pane's width in pixels whenever it changes, so the toolbar can align a cell with it. */
      readonly onWidth: (width: number) => void
    },
  ) => {
    const pane = shallowRef<HTMLDivElement | null>(null)
    const drag = shallowRef<{
      pointer: number
      x: number
      width: number
    } | null>(null)
    const width = shallowRef(240)
    const setWidth = (
      next: typeof width.value | ((previous: typeof width.value) => typeof width.value),
    ) => {
      width.value = typeof next === 'function' ? next(width.value) : next
    }
    const maximum = shallowRef(MAX_WIDTH)
    const setMaximum = (
      next: typeof maximum.value | ((previous: typeof maximum.value) => typeof maximum.value),
    ) => {
      maximum.value = typeof next === 'function' ? next(maximum.value) : next
    }
    watch(
      () => pane.value,
      (_next, _previous, onCleanup) => {
        const dispose = (() => {
          const parent = pane.value?.parentElement
          if (parent === undefined || parent === null) return
          const measure = (): void => {
            const available = parent.clientWidth
            // A retained tab has no measurable width while its session or pane is hidden.
            if (available === 0) return
            setMaximum(Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, available - DIFF_MIN_WIDTH)))
          }
          measure()
          const observer = new ResizeObserver(measure)
          observer.observe(parent)
          return () => {
            observer.disconnect()
          }
        })()
        if (typeof dispose === 'function') onCleanup(dispose)
      },
      { immediate: true, flush: 'post' },
    )
    const floor = computed(() => Math.max(MIN_WIDTH, props.least ?? 0))
    const top = computed(() => Math.max(floor.value, maximum.value))
    const shown = computed(() => Math.max(floor.value, Math.min(width.value, top.value)))
    watch(
      () => [shown.value, props.onWidth],
      () => {
        props.onWidth(shown.value)
      },
      { immediate: true, flush: 'post' },
    )
    const direction = computed(() => (props.position === 'left' ? 1 : -1))
    const resize = (next: number): void => {
      setWidth(Math.round(Math.max(floor.value, Math.min(top.value, next))))
    }
    return () => {
      return h(
        'div',
        {
          ref: pane,
          class: clsx(css.pane, changesCss.treePane),
          'data-position': props.position,
          hidden: props.position === 'hidden',
          style: { width: `${shown.value}px` },
        },
        [
          h('div', {
            class: css.resize,
            role: 'separator',
            tabindex: 0,
            'aria-label': props.t('diff.resizeFileTree'),
            'aria-orientation': 'vertical',
            'aria-controls': props.id,
            'aria-valuemin': floor.value,
            'aria-valuemax': top.value,
            'aria-valuenow': shown.value,
            onPointerdown: (event) => {
              if (event.button !== 0) return
              event.preventDefault();
              (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
              drag.value = { pointer: event.pointerId, x: event.clientX, width: shown.value }
            },
            onPointermove: (event) => {
              const active = drag.value
              if (active?.pointer === event.pointerId)
                resize(active.width + direction.value * (event.clientX - active.x))
            },
            onPointerup: (event) => {
              const active = drag.value
              if (active?.pointer !== event.pointerId) return
              resize(active.width + direction.value * (event.clientX - active.x))
              drag.value = null;
              (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
            },
            onPointercancel: () => {
              drag.value = null
            },
            onLostpointercapture: () => {
              drag.value = null
            },
            onKeydown: (event: KeyboardEvent) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
              event.preventDefault()
              resize(
                event.key === 'Home'
                  ? floor.value
                  : event.key === 'End'
                    ? top.value
                    : shown.value + direction.value * (event.key === 'ArrowRight' ? 20 : -20),
              )
            },
          }),
          h(
            'nav',
            {
              id: props.id,
              class: css.navigation,
              'aria-label': props.t('diff.allFiles', { count: props.files.length }),
            },
            [h(ChangedFiles, { ...props })],
          ),
        ],
      )
    }
  },
  {
    props: [
      'position',
      'id',
      'onWidth', 'least',
      'files',
      'state',
      'filter',
      'toggle',
      'jump',
      'menu',
      'threadCounts',
      'viewed',
      'loading',
      't',
    ],
  },
)
