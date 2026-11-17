import type {} from '@deepseek-ai/dsh-session-stats/types'
import { computed, defineComponent, Fragment, h, Teleport, type VNodeChild } from 'vue'
// Composer statistics pills, each its own 'conversation.composer.dock' list
// entry (activity, usage) so a plugin can replace or add one pill by id.
// Compact keeps speed and cache hit as plain readings; Detailed adds counts,
// token totals, and click-open dialogs. Settled-node identity prevents
// stream-delta updates from rerendering the pills.
import {
  IconDatabaseOutlineRegular,
  IconGaugeOutlineRegular,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { UseProjection } from '@deepseek-ai/dsh-api-session-controller/client'
import type { InjectFace, SnapshotSelectorHook } from '@deepseek-ai/dsh-client-ui-slots'
import type { TokenUsageProjection } from '@deepseek-ai/dsh-token-meter/client'
import type { ChatViewSlotProps, PerformanceUsageInjected } from '../contract/slots.ts'
import type { ChatSnapshot } from '../contract/snapshot.ts'
import { formatTokensPerSecond } from './message-chrome.ts'
import { assistantStepReading } from '../contract/turn-metrics.ts'
import { formatCacheHitPercent, formatExactTokens, formatTokens } from './token-format.ts'
import { useStatDialog } from './stat-dialog.ts'
import css from './StatsPills.module.css'
import dialogCss from './stat-dialog.module.css'
interface WindowStats {
  turns: number
  steps: number
  /** Summed request wall time (step/start → assistant/message); 0 when no node carries timing. */
  llmMs: number
  /** Summed tool wall time (tool/call → tool/result); 0 when no pair is in-window. */
  toolMs: number
  /** Summed first-token latency over `ttftSteps`; 0 when no step records it. */
  ttftMs: number
  /** Steps carrying a recorded TTFT. */
  ttftSteps: number
  /** Summed decode wall time over steps that also report output tokens. */
  decodeMs: number
  /** Summed output tokens over the same decode-timed steps. */
  decodeTokens: number
}
/**
 * Fold assistant and tool-result nodes into window-scoped display totals —
 * the FALLBACK for assemblies without the `sessionStats` projection.
 *
 * Every displayed figure rides that durable whole-log projection (and token
 * accounting rides `tokenUsage`) because the window is paged and compaction
 * rewrites it; this fold answers "what is on screen" only when no projection
 * value is served. Its field names deliberately mirror the projection's so
 * the two swap wholesale.
 * @param nodes - snapshot nodes.
 * @returns fallback counts and summed wall times.
 */
export function deriveStats(nodes: ChatSnapshot['legacy']['nodes']): WindowStats {
  const turns = new Set<number>()
  let steps = 0
  let llmMs = 0
  let toolMs = 0
  let ttftMs = 0
  let ttftSteps = 0
  let decodeMs = 0
  let decodeTokens = 0
  for (const node of nodes) {
    if (node.kind === 'tool-result') {
      if (node.callTime !== null) toolMs += Math.max(0, node.time - node.callTime)
      continue
    }
    if (node.kind !== 'assistant') continue
    turns.add(node.turn)
    steps += 1
    if (node.timing !== undefined && node.timing.stepStartTime !== null) {
      llmMs += Math.max(0, node.timing.completedTime - node.timing.stepStartTime)
    }
    const reading = assistantStepReading(node)
    if (reading.ttftMs !== null) {
      ttftMs += reading.ttftMs
      ttftSteps += 1
    }
    if (reading.decodeMs !== null && reading.outputTokens !== null) {
      decodeMs += reading.decodeMs
      decodeTokens += reading.outputTokens
    }
  }
  return { turns: turns.size, steps, llmMs, toolMs, ttftMs, ttftSteps, decodeMs, decodeTokens }
}
/**
 * Compact duration: 45.2s under a minute, 2m42s from there on.
 * @param ms - duration in milliseconds.
 * @returns display string.
 */
export function formatDuration(ms: number, t: ChatViewSlotProps['t']): string {
  const s = ms / 1000
  if (s < 60) return t('duration.compactSeconds', { seconds: Math.round(s * 10) / 10 })
  const whole = Math.round(s)
  return t('duration.compactMinutes', {
    minutes: Math.floor(whole / 60),
    seconds: whole % 60,
  })
}
/**
 * Display-ready cache-hit share of prompt-side input over the whole durable log.
 * @param usage - the session's token-usage projection value.
 * @returns integer text when integer rounding stays below 100, otherwise the
 * minimum decimal precision that still rounds below 100; a full hit returns
 * 100, and no billed input returns null.
 */
export function cacheHitPercent(usage: TokenUsageProjection): string | null {
  const denominator = billedInputTokens(usage)
  return formatCacheHitPercent(usage.cacheReadTokens, denominator)
}
/**
 * Sum the three disjoint prompt-side billing buckets.
 * @param usage - the session's token-usage projection value.
 * @returns billed input tokens.
 */
export function billedInputTokens(usage: TokenUsageProjection): number {
  return usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}
type Translate = ChatViewSlotProps['t']
/** Props shared by every composer stats pill: the conversation-snapshot selector plus the projection read seat. */
export interface StatPillProps extends InjectFace<PerformanceUsageInjected> {
  useChat: SnapshotSelectorHook<ChatSnapshot>
  useProjection: UseProjection
  /** The owning dock's locale seat. */
  t: Translate
}
/** Dock entry id carried as `data-composer-stat` on each pill. */
type StatId = 'activity' | 'usage'
interface PillContent {
  stat: StatId
  icon: VNodeChild
  label: VNodeChild
  /** The full reading as plain text: the accessible name and the tooltip shown while the label is cut off. */
  text: string
}
function exactCount(value: number, t: Translate): string {
  return t('message.turnUsage.count', { count: formatExactTokens(value, t) })
}
/** One or two reading segments, visually joined by a separator glyph. */
function reading(first: string, second: string | null): Pick<PillContent, 'label' | 'text'> {
  if (second === null) return { label: first, text: first }
  return {
    label: h(Fragment, null, [
      first,
      h('span', { class: css.sep, 'aria-hidden': true }, ['\u00B7']),
      second,
    ]),
    text: `${first} · ${second}`,
  }
}
// Every figure rides the durable sessionStats projection, so paging and
// compaction cannot change any of them; an assembly without the unit falls
// back to the window-scoped fold wholesale (same field names), paid only
// while no projection value is served.
function useSessionStats(useChat: StatPillProps['useChat'], useProjection: UseProjection) {
  const settledNodes = useChat(s => s.legacy.nodes)
  const projected = useProjection('sessionStats')
  return computed(() => projected.value ?? deriveStats(settledNodes.value))
}
function decodeSpeed(stats: WindowStats, t: Translate): string {
  return t('message.tokensPerSecond', {
    tps: formatTokensPerSecond(stats.decodeTokens / (stats.decodeMs / 1000)),
  })
}
/** The full reading above a pill, only while an ellipsis cuts its label; the delay matches the dock's context meter. */
const FULL_READING_TOOLTIP = {
  side: 'top',
  portal: true,
  delayMs: 200,
  onlyWhenClipped: true,
} as const
const PlainPill = defineComponent(
  (props: PillContent) => {
    return () => {
      const { stat, icon, label, text } = props
      return h('span', { class: css.anchor, 'data-composer-stat': stat }, [
        h(
          Tooltip,
          { label: text, ...FULL_READING_TOOLTIP, openOnClick: true },
          {
            default: () => [
              h('span', { class: css.pill }, [icon, h('span', { class: css.label }, [label])]),
            ],
          },
        ),
      ])
    }
  },
  { name: 'PlainPill', inheritAttrs: false, props: ['stat', 'icon', 'label', 'text'] },
)
const DialogPill = defineComponent(
  (
    props: PillContent & {
      title: string
      titleValue?: string
    },
    { slots },
  ) => {
    const { open, setOpen, rootRef, panelRef, anchorName } = useStatDialog()
    return () => {
      const { stat, icon, label, text, title, titleValue } = props
      return h(
        'span',
        { ref: rootRef, style: { anchorName }, class: css.anchor, 'data-composer-stat': stat },
        [
          h(
            Tooltip,
            { label: text, ...FULL_READING_TOOLTIP, disabled: open.value },
            {
              default: () => [
                h(
                  'button',
                  {
                    type: 'button',
                    class: css.pill,
                    'aria-haspopup': 'dialog',
                    'aria-expanded': open.value,
                    'aria-label': text,
                    onClick: () => {
                      setOpen(!open.value)
                    },
                  },
                  [icon, h('span', { class: css.label }, [label])],
                ),
              ],
            },
          ),
          open.value &&
            portal(
              h(
                'div',
                {
                  ref: panelRef,
                  class: dialogCss.panel,
                  role: 'dialog',
                  'aria-label': title,
                  style: { positionAnchor: anchorName },
                },
                [
                  h('div', { class: dialogCss.title }, [
                    h('span', { class: dialogCss.titleLabel }, [icon, title]),
                    titleValue !== undefined &&
                      h('span', { class: dialogCss.titleValue }, [titleValue]),
                  ]),
                  h('div', { class: dialogCss.titleRule, 'aria-hidden': true }),
                  slots.default?.(),
                ],
              ),
              document.body,
            ),
        ],
      )
    }
  },
  {
    name: 'DialogPill',
    inheritAttrs: false,
    props: ['stat', 'icon', 'label', 'text', 'title', 'titleValue'],
  },
)
/**
 * Turn and step counts with whole-session speed, opening the time and speed
 * dialog; Compact keeps only the speed reading.
 */
export const ActivityPill = defineComponent(
  (props: StatPillProps) => {
    const mode = props.usePerformanceUsage(value => value)
    const stats = useSessionStats(props.useChat, props.useProjection)
    return () => {
      const { t } = props
      const speed = stats.value.decodeMs > 0 ? decodeSpeed(stats.value, t) : null
      const icon = h(IconGaugeOutlineRegular, null)
      if (mode.value === 'compact')
        return speed === null
          ? null
          : h(PlainPill, { stat: 'activity', icon: icon, ...reading(speed, null) })
      if (stats.value.steps === 0) return null
      const counts = t('stats.counts', { turns: stats.value.turns, steps: stats.value.steps })
      const content: PillContent = { stat: 'activity', icon, ...reading(counts, speed) }
      // A window without one timed figure has no dialog rows to show, so the pill
      // stays a plain reading instead of a button opening an empty dialog.
      if (
        stats.value.llmMs <= 0 &&
        stats.value.toolMs <= 0 &&
        stats.value.ttftSteps <= 0 &&
        speed === null
      )
        return h(PlainPill, { ...content })
      return h(
        DialogPill,
        { ...content, title: t('stats.dialog.title'), titleValue: counts },
        {
          default: () => [
            h('dl', { class: dialogCss.details, 'data-session-stats-details': true }, [
              stats.value.llmMs > 0 &&
                h(Fragment, null, [
                  h('dt', null, [t('stats.dialog.llmTime')]),
                  h('dd', null, [formatDuration(stats.value.llmMs, t)]),
                ]),
              stats.value.toolMs > 0 &&
                h(Fragment, null, [
                  h('dt', null, [t('stats.dialog.toolTime')]),
                  h('dd', null, [formatDuration(stats.value.toolMs, t)]),
                ]),
              stats.value.ttftSteps > 0 &&
                h(Fragment, null, [
                  h('dt', null, [t('stats.dialog.ttft')]),
                  h('dd', null, [formatDuration(stats.value.ttftMs / stats.value.ttftSteps, t)]),
                ]),
              speed !== null &&
                h(Fragment, null, [
                  h('dt', null, [t('stats.dialog.speed')]),
                  h('dd', null, [speed]),
                ]),
            ]),
          ],
        },
      )
    }
  },
  {
    name: 'ActivityPill',
    inheritAttrs: false,
    props: ['useChat', 'useProjection', 'usePerformanceUsage', 't'],
  },
)
/** Whole-log token total and cache hit; Compact keeps only the cache hit. */
export const UsagePill = defineComponent(
  (props: StatPillProps) => {
    const mode = props.usePerformanceUsage(value => value)
    const usage = props.useProjection('tokenUsage')
    return () => {
      const { t } = props
      const currentUsage = usage.value
      // Gated on actual token activity: a session whose steps all settled without
      // billing (e.g. every request failed) shows no usage pill.
      if (
        currentUsage === undefined ||
        (billedInputTokens(currentUsage) === 0 && currentUsage.outputTokens === 0)
      )
        return null
      const cacheHit = cacheHitPercent(currentUsage)
      const cacheHitText = cacheHit !== null ? t('stats.cacheHit', { percent: cacheHit }) : null
      const icon = h(IconDatabaseOutlineRegular, null)
      if (mode.value === 'compact') {
        return cacheHitText === null
          ? null
          : h(PlainPill, { stat: 'usage', icon: icon, ...reading(cacheHitText, null) })
      }
      // Same aggregate as the Turn pill's totalTokens: every prompt-side billing bucket plus output.
      const total = billedInputTokens(currentUsage) + currentUsage.outputTokens
      const totalText = t('message.turnUsage.count', { count: formatTokens(total, t) })
      return h(
        DialogPill,
        {
          stat: 'usage',
          icon: icon,
          ...reading(totalText, cacheHitText),
          title: t('stats.dialog.usageTitle'),
          titleValue: exactCount(total, t),
        },
        {
          default: () => [
            h('dl', { class: dialogCss.details, 'data-session-stats-usage': true }, [
              cacheHit !== null &&
                h(Fragment, null, [
                  h('dt', null, [t('message.turnUsage.cacheHit')]),
                  h('dd', null, [`${cacheHit}%`]),
                ]),
              h('dt', null, [t('message.turnUsage.input')]),
              h('dd', null, [exactCount(currentUsage.uncachedInputTokens, t)]),
              h('dt', null, [t('message.turnUsage.cacheRead')]),
              h('dd', null, [exactCount(currentUsage.cacheReadTokens, t)]),
              currentUsage.cacheWriteTokens !== 0 &&
                h(Fragment, null, [
                  h('dt', null, [t('message.turnUsage.cacheWrite')]),
                  h('dd', null, [exactCount(currentUsage.cacheWriteTokens, t)]),
                ]),
              h('dt', null, [t('message.turnUsage.output')]),
              h('dd', null, [exactCount(currentUsage.outputTokens, t)]),
            ]),
          ],
        },
      )
    }
  },
  { name: 'UsagePill', inheritAttrs: false, props: ['useProjection', 'usePerformanceUsage', 't'] },
)
function portal(content: VNodeChild, target: Element): VNodeChild {
  return h(Teleport, { to: target }, [content])
}
