import { defineComponent, h, Fragment } from 'vue'
/** General Settings row for work-details presentation. */

import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { TRANSCRIPT_VIEW_MODES, type TranscriptViewMode } from '../../chat-settings.ts'
import type { ChatKey } from '../locale.ts'
import { COLLAPSE_TIMINGS, FOLDED_REPLIES, type CollapseTiming, type FoldedReplies } from '../presentation-policy.ts'
import { PreferenceRow } from './PreferenceRow.tsx'

/** Registration-side work-details preference face. */
export interface TranscriptViewRowInjected {
  hooks: {
    /** Persisted work-details preference bound as useTranscriptView. */
    transcriptView: SnapshotStore<TranscriptViewMode>
    /** Persisted collapse timing bound as useCollapseTiming. */
    collapseTiming: SnapshotStore<CollapseTiming>
    /** Persisted folded-reply choice bound as useFoldedReplies. */
    foldedReplies: SnapshotStore<FoldedReplies>
  }
  /** Change the work-details presentation. */
  setTranscriptView: (mode: TranscriptViewMode) => void
  /** Persist collapse timing independently of the work-details mode. */
  setCollapseTiming: (timing: CollapseTiming) => void
  /** Persist which Assistant replies stay visible in a folded Turn. */
  setFoldedReplies: (replies: FoldedReplies) => void
}

/** Full Settings-row props. */
export type TranscriptViewRowProps =
  PropsRuntime<'settings.general.item'>
  & PropsLocale<'chat'>
  & InjectFace<TranscriptViewRowInjected>

const LABELS = {
  compact: 'settings.transcript.compact',
  standard: 'settings.transcript.standard',
  detailed: 'settings.transcript.detailed',
  verbose: 'settings.transcript.verbose',
} as const satisfies Record<TranscriptViewMode, ChatKey>

const COLLAPSE_LABELS = {
  completion: 'settings.collapse.completion',
  'next-input': 'settings.collapse.nextInput',
} as const satisfies Record<CollapseTiming, ChatKey>

const FOLDED_REPLY_LABELS = {
  all: 'settings.foldedReplies.all',
  final: 'settings.foldedReplies.final',
} as const satisfies Record<FoldedReplies, ChatKey>

/**
 * Render the independent, Host-backed work-details, collapse-timing, and folded-reply selectors.
 * Verbose never folds a Turn, so it omits the folded-reply selector.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export const TranscriptViewRow = defineComponent((props: TranscriptViewRowProps) => {
  const mode = props.useTranscriptView(value => value)
  const timing = props.useCollapseTiming(value => value)
  const replies = props.useFoldedReplies(value => value)
  return () => h(Fragment, [
    h(PreferenceRow, { title: props.t('settings.transcript.title'), description: props.t('settings.transcript.description'),
      value: mode.value, selectedLabel: props.t(LABELS[mode.value]),
      options: TRANSCRIPT_VIEW_MODES.map(id => ({ id, label: props.t(LABELS[id]) })),
      onSelect: (value: string) => { const option = TRANSCRIPT_VIEW_MODES.find(id => id === value); if (option !== undefined) props.setTranscriptView(option) },
    }),
    h(PreferenceRow, { title: props.t('settings.collapse.title'), description: props.t('settings.collapse.description'),
      value: timing.value, selectedLabel: props.t(COLLAPSE_LABELS[timing.value]),
      options: COLLAPSE_TIMINGS.map(id => ({ id, label: props.t(COLLAPSE_LABELS[id]) })),
      onSelect: (value: string) => { const option = COLLAPSE_TIMINGS.find(id => id === value); if (option !== undefined) props.setCollapseTiming(option) },
    }),
    mode.value === 'verbose' ? null : h(PreferenceRow, {
      title: props.t('settings.foldedReplies.title'), description: props.t('settings.foldedReplies.description'),
      value: replies.value, selectedLabel: props.t(FOLDED_REPLY_LABELS[replies.value]),
      options: FOLDED_REPLIES.map(id => ({ id, label: props.t(FOLDED_REPLY_LABELS[id]) })),
      onSelect: (value: string) => { const option = FOLDED_REPLIES.find(id => id === value); if (option !== undefined) props.setFoldedReplies(option) },
    }),
  ])
}, { name: 'TranscriptViewRow', inheritAttrs: false, props: ['useTranscriptView', 'setTranscriptView', 'useCollapseTiming', 'setCollapseTiming', 'useFoldedReplies', 'setFoldedReplies', 't'] })
