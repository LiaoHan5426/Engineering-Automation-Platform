import type { RequestClient } from '@eap/request'
import type { CodeProposalState, TaskObservation } from './index'

import type { ExpertAgentState } from './contracts/expertAgent'
export type { ExpertAgentState } from './contracts/expertAgent'

export type ExpertAgentInput = {
  sql: string
  question: string
  databaseId?: string | null
  explainPlan?: Record<string, unknown> | null
  targetPath?: string | null
}
export type ExpertAgentSummary = {
  id: string
  expertId: string
  expertName: string
  state: ExpertAgentState
  attempts: number
  automatic: boolean
  createdAt: string
  updatedAt: string
  expiresAt: string
}
export type ExpertAgentRun = {
  id: string
  snapshot: { manifest: { id: string; name: string }; revision: number }
  request: string
  checkpoint: string
  state: ExpertAgentState
  attempts: number
  automatic: boolean
  leaseUntil: string | null
  expiresAt: string
  result: string | null
}
export type ExpertAgentDetail = {
  run: ExpertAgentRun
  approval: {
    proposal_id: string | null
    approval_digest: string | null
    approval_expires_at: string | null
    decision: string | null
    decided_by: string | null
    decided_at: string | null
  }
  candidate?: CodeProposalState
}
export type ExpertAgentResult = {
  status?: string
  summary?: string
  error?: string
  observations?: TaskObservation[]
  verification?: string
  citations?: Array<{
    id: string
    source: string
    excerpt: string
    knowledgeBase?: string
    knowledgeBaseId?: string
    retrievalMode?: string
  }>
}
export function createExpertAgentApi(client: RequestClient) {
  const path = (expert: string, id: string) =>
    '/experts/' + encodeURIComponent(expert) + '/agent-runs/' + encodeURIComponent(id)
  return {
    expertAgentRuns: () =>
      client
        .get<{ items: ExpertAgentSummary[]; automaticScheduling: boolean }>('/expert-agent-runs', {
          params: { limit: 100 },
        })
        .then((r) => r.data),
    queueExpertAgent: (expert: string, id: string, input: ExpertAgentInput) =>
      client.post<ExpertAgentRun>(path(expert, id) + '/queue', input).then((r) => r.data),
    expertAgentRun: (expert: string, id: string) =>
      client.get<ExpertAgentDetail>(path(expert, id)).then((r) => r.data),
    cancelExpertAgent: (expert: string, id: string) =>
      client.delete<{ cancelRequested: boolean }>(path(expert, id)).then((r) => r.data),
    reviewExpertAgent: (
      expert: string,
      id: string,
      review: { proposalId: string; digest: string; approve: boolean },
    ) => client.post<ExpertAgentDetail>(path(expert, id) + '/approval', review).then((r) => r.data),
  }
}
