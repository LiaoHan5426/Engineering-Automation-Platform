import { defineComponent, computed, shallowRef, watch, h, useId, Teleport, onMounted } from 'vue'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
// Type-only: the `contextPressure` / `contextBreakdown` projection key merges.
import type {} from '@deepseek-ai/dsh-token-meter/client'
import { Tooltip, useDismissOnOutsidePointer } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ComposerBarProps } from '../contract/slots.ts'
import { contextOccupancy } from '../context-occupancy.ts'
import css from './ContextMeter.module.css'
/** Ring geometry: 14px viewBox, 2px stroke. */
const RADIUS = 5.5
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
/**
 * Marker the localized occupancy sentence is split on, so the panel headline
 * keeps the reading in its own tone while each locale still owns the word
 * order (`45% of context used` / `上下文已用 45%`).
 */
const READING_SLOT = '\u0000'
/** Panel legend rows, in bar-segment order; each color class carries the shared swatch/segment tint. */
const ROWS = [
  { key: 'systemTokens', label: 'context.system', color: css.colorSystem },
  { key: 'toolsTokens', label: 'context.tools', color: css.colorTools },
  { key: 'messageTokens', label: 'context.messages', color: css.colorMessages },
] as const
/**
 * Format a token count for the compact context panel.
 * @param value - token count.
 * @param t - Conversation locale seat with shared compact-number templates.
 * @returns Compact localized count using K or M when needed.
 */
function formatTokens(value: number, t: ComposerBarProps['t']): string {
  const scaled = (candidate: number): string =>
    candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10)
  if (value < 1000) return String(value)
  if (value < 1000000) return t('number.thousand', { value: scaled(value / 1000) })
  return t('number.million', { value: scaled(value / 1000000) })
}
export interface ContextMeterProps {
  useProjection: UseProjection
  /** The owning bar's locale seat, passed down as a plain prop. */
  t: ComposerBarProps['t']
}
export const ContextMeter = defineComponent(
  (props: ContextMeterProps) => {
    const useProjection = computed(() => props.useProjection)
    const t = computed(() => props.t)
    const pressure = useProjection.value('contextPressure')
    const breakdown = useProjection.value('contextBreakdown')
    const open = shallowRef(false)
    const setOpen = (
      next: typeof open.value | ((previous: typeof open.value) => typeof open.value),
    ) => {
      open.value = typeof next === 'function' ? next(open.value) : next
    }
    const rootRef = shallowRef<HTMLSpanElement | null>(null)
    const panelRef = shallowRef<HTMLDivElement | null>(null)
    const context = computed(() => contextOccupancy(pressure.value))
    const available = computed(() => context.value !== null)
    const anchorNameSource1 = useId()
    const anchorName = computed(() => `--dsh-context-${anchorNameSource1.replaceAll(':', '')}`)
    useDismissOnOutsidePointer(rootRef, () => open.value && available.value, setOpen, panelRef)
    const percent = computed(() => context.value?.percent ?? 0)
    const reading = computed(() => `${percent.value}%`)
    const headline = computed(() =>
      t
        .value('context.aria', { percent: READING_SLOT })
        .split(READING_SLOT)
        .map(part => part.trim()),
    )
    const breakdownTotal = computed(() =>
      breakdown.value === undefined
        ? 0
        : breakdown.value.systemTokens +
          breakdown.value.toolsTokens +
          breakdown.value.messageTokens,
    )
    const parts = computed(() =>
      breakdown.value === undefined || breakdownTotal.value === 0
        ? [{ key: 'total', color: undefined, width: percent.value }]
        : ROWS.map(row => ({
          key: row.key,
          color: row.color,
          width: (percent.value * (breakdown.value?.[row.key] ?? 0)) / breakdownTotal.value,
        })),
    )
    const segments = computed(() => parts.value.filter(part => part.width > 0))
    onMounted(() =>
      watch(
        [() => available.value, () => open.value],
        () => {
          if (!available.value && open.value) setOpen(false)
        },
        { immediate: true, flush: 'post' },
      ),
    )
    onMounted(() =>
      watch(
        [() => available.value, () => open.value],
        (_value, _previous, onCleanup) => {
          const cleanup = (() => {
            if (!open.value || !available.value) return
            const onKeyDown = (e: KeyboardEvent): void => {
              if (e.key === 'Escape') setOpen(false)
            }
            document.addEventListener('keydown', onKeyDown)
            return () => {
              document.removeEventListener('keydown', onKeyDown)
            }
          })()
          if (typeof cleanup === 'function') onCleanup(cleanup)
        },
        { immediate: true, flush: 'post' },
      ),
    )
    return () => {
      if (context.value === null) return null
      return h(
        'span',
        {
          ref: rootRef,
          style: { anchorName: anchorName.value },
          class: css.root,
        },
        [
          h(
            Tooltip,
            {
              label: t.value('context.aria', { percent: reading.value }),
              side: 'top',
              delayMs: 200,
              disabled: open.value,
              portal: true,
            },
            {
              default: () => [
                h(
                  'button',
                  {
                    type: 'button',
                    class: css.trigger,
                    'aria-label': t.value('context.aria', { percent: reading.value }),
                    'aria-haspopup': 'dialog',
                    'aria-expanded': open.value,
                    onClick: () => {
                      setOpen(!open.value)
                    },
                  },
                  [
                    h(
                      'svg',
                      {
                        viewBox: '0 0 14 14',
                        width: '14',
                        height: '14',
                        'aria-hidden': true,
                      },
                      [
                        h('circle', {
                          class: css.track,
                          cx: '7',
                          cy: '7',
                          r: RADIUS,
                        }),
                        h('circle', {
                          class: css.fill,
                          cx: '7',
                          cy: '7',
                          r: RADIUS,
                          strokeDasharray: `${(CIRCUMFERENCE * percent.value) / 100} ${CIRCUMFERENCE}`,
                          transform: 'rotate(-90 7 7)',
                        }),
                      ],
                    ),
                    h('span', null, [reading.value]),
                  ],
                ),
              ],
            },
          ),
          open.value &&
            h(Teleport, { to: document.body }, [
              h(
                'div',
                {
                  ref: panelRef,
                  class: css.panel,
                  style: { positionAnchor: anchorName.value },
                  role: 'dialog',
                  'aria-label': t.value('context.used'),
                },
                [
                  h(
                    'div',
                    {
                      class: css.header,
                    },
                    [
                      h(
                        'span',
                        {
                          class: css.headline,
                        },
                        [headline.value[0] ?? ''],
                      ),
                      h(
                        'span',
                        {
                          class: css.percent,
                        },
                        [reading.value],
                      ),
                      h(
                        'span',
                        {
                          class: css.headline,
                        },
                        [headline.value[1] ?? ''],
                      ),
                      h(
                        'span',
                        {
                          class: css.figures,
                        },
                        [
                          `~${formatTokens(context.value.usedTokens, t.value)} / ${formatTokens(context.value.contextWindow, t.value)}`,
                        ],
                      ),
                    ],
                  ),
                  h(
                    'div',
                    {
                      class: css.bar,
                    },
                    [
                      segments.value.map(segment =>
                        h('div', {
                          key: segment.key,
                          class:
                            segment.color === undefined
                              ? css.segment
                              : `${css.segment} ${segment.color}`,
                          style: { width: `${segment.width}%` },
                        }),
                      ),
                    ],
                  ),
                  breakdown.value !== undefined &&
                    h(
                      'dl',
                      {
                        class: css.rows,
                      },
                      [
                        ROWS.map(row =>
                          h(
                            'div',
                            {
                              key: row.key,
                              class: css.row,
                            },
                            [
                              h('dt', null, [
                                h('span', {
                                  class: `${css.swatch} ${row.color}`,
                                  'aria-hidden': true,
                                }),
                                t.value(row.label),
                              ]),
                              h('dd', null, [
                                `~${formatTokens(breakdown.value?.[row.key] ?? 0, t.value)}`,
                              ]),
                            ],
                          ),
                        ),
                      ],
                    ),
                ],
              ),
            ]),
        ],
      )
    }
  },
  {
    props: ['useProjection', 't'],
    inheritAttrs: false,
  },
)
