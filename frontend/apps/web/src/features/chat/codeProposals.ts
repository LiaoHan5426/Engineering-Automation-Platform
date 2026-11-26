import {
  CodeErrors,
  proposalRefused,
  type CodeProposal,
  type runtimeApi,
} from '@eap/runtime-client'
import { ref, watch, type Ref } from 'vue'
import { errorMessage } from '../../lib/presentation'
import { applyFailureCode, applyFailureMessage } from './applyError'
import type { ChatTurn } from './chatSession'
import { pendingWrite } from './pendingWrite'
import { refusedFromState } from './proposalRefusal'

type VerificationCheck = { name: string; exitCode: number | null; summary: string }

/** Per-proposal write state for the chat transcript: refuse, confirm, apply, conflict. */
export function useCodeProposals(options: {
  api: Pick<typeof runtimeApi, 'codeProposal' | 'refuseCodeProposal' | 'applyCodeProposal'>
  turns: Ref<ChatTurn[]>
  approval: () => string
  t: (key: string) => string
}) {
  const { api, turns, approval, t } = options
  const refused = ref<Record<string, boolean>>({})
  const refusing = ref<string | null>(null)
  const refuseNote = ref('')
  const conflicted = ref<Record<string, boolean>>({})
  const applied = ref<Record<string, string[]>>({})
  const appliedVerification = ref<Record<string, string>>({})
  const appliedChecks = ref<Record<string, VerificationCheck[]>>({})
  const applying = ref<string | null>(null)
  const proposalNote = ref('')
  const writeConfirmed = ref<Record<string, boolean>>({})

  function syncRefused(id: string, value: boolean) {
    refused.value = { ...refused.value, [id]: value }
  }

  async function hydrateRefusal(proposal: CodeProposal) {
    if (refused.value[proposal.id]) return
    try {
      const state = await api.codeProposal(proposal.conversationId, proposal.id)
      if (refusedFromState(state)) syncRefused(proposal.id, true)
    } catch {
      /* durable status unavailable in this mode */
    }
  }
  watch(
    () =>
      turns.value
        .map((turn) => turn.proposal)
        .filter((proposal): proposal is CodeProposal => !!proposal),
    (proposals) => {
      for (const proposal of proposals) void hydrateRefusal(proposal)
    },
    { immediate: true },
  )

  async function refuse(turn: { proposal?: CodeProposal | null; executionId?: string | null }) {
    const proposal = turn.proposal
    if (!proposal || refused.value[proposal.id] || refusing.value) return
    refusing.value = proposal.id
    refuseNote.value = ''
    try {
      const state = await api.refuseCodeProposal(proposal.conversationId, proposal.id, {
        executionId: turn.executionId ?? null,
      })
      syncRefused(proposal.id, proposalRefused(state.status))
    } catch (error) {
      refuseNote.value = errorMessage(error)
    } finally {
      if (refusing.value === proposal.id) refusing.value = null
    }
  }

  function baselineReady(proposal: CodeProposal) {
    return (
      proposal.files.length > 0 && proposal.files.every((file) => file.baseHash.trim().length > 0)
    )
  }

  function recordApplied(
    proposalId: string,
    result: { written: string[]; verification: string; checks?: VerificationCheck[] },
  ) {
    applied.value = { ...applied.value, [proposalId]: result.written }
    appliedVerification.value = { ...appliedVerification.value, [proposalId]: result.verification }
    appliedChecks.value = { ...appliedChecks.value, [proposalId]: result.checks ?? [] }
  }

  async function apply(proposal: CodeProposal) {
    if (
      !baselineReady(proposal) ||
      !writeConfirmed.value[proposal.id] ||
      applying.value ||
      approval() === 'read_only'
    )
      return
    applying.value = proposal.id
    proposalNote.value = ''
    try {
      const result = await api.applyCodeProposal(proposal.conversationId, proposal.id)
      conflicted.value = { ...conflicted.value, [proposal.id]: false }
      recordApplied(proposal.id, result)
      proposalNote.value = t('task.written')
    } catch (error) {
      if (applyFailureCode(error) === CodeErrors.FILE_CHANGED_SINCE_PROPOSAL) {
        conflicted.value = { ...conflicted.value, [proposal.id]: true }
        writeConfirmed.value = { ...writeConfirmed.value, [proposal.id]: false }
      }
      proposalNote.value = applyFailureMessage(error, t)
    } finally {
      applying.value = null
    }
  }

  /** i18n key describing what still blocks the write for this turn's proposal. */
  function pendingKey(turn: { proposal?: CodeProposal | null }) {
    if (!turn.proposal) return 'desktop.pendingNone'
    const state = pendingWrite({
      policy: approval(),
      files: turn.proposal.files,
      applied: !!applied.value[turn.proposal.id]?.length,
      refused: !!refused.value[turn.proposal.id],
      conflict: !!conflicted.value[turn.proposal.id],
    })
    return `desktop.pending${state.charAt(0).toUpperCase()}${state.slice(1)}`
  }

  return {
    refused,
    refusing,
    refuseNote,
    applied,
    appliedVerification,
    appliedChecks,
    applying,
    proposalNote,
    writeConfirmed,
    refuse,
    apply,
    baselineReady,
    recordApplied,
    pendingKey,
  }
}

export type CodeProposals = ReturnType<typeof useCodeProposals>
