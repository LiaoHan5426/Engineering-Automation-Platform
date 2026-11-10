import type { MissionExecutionStatus } from './missionExecution.ts'

export type MissionRecord = {
  id: string
  handoffId: string
  source: 'chat' | 'builder' | 'board'
  sourceRef: string
  summary: string
  status: 'created'
  execution:
    | 'not_started'
    | 'running'
    | 'cancelling'
    | 'succeeded'
    | 'failed'
    | 'timed_out'
    | 'cancelled'
    | 'interrupted'
  approval: 'not_requested'
  grant: 'none'
  verification: 'not_requested'
  createdAt?: string
}

export type MissionExecutionRecord = {
  id: string
  missionId: string
  status: MissionExecutionStatus
  capability: 'git-status'
  principal: 'local-operator'
  exitCode?: number | null
  exitEvidence?: string | null
  unconfirmedReason?: string | null
  approval: 'NOT_REQUIRED'
  cancelRequested?: boolean
}

export type PrototypeVersionRecord = {
  id: string
  requestId: string
  sourceRef: 'builder-alpha' | 'builder-beta'
  title: string
  body: string
  acceptance: string[]
  contentHash: string
  createdAt?: string
}

export type PrototypePublicationRequest = {
  requestId: string
  sourceRef: 'builder-alpha' | 'builder-beta'
  title: string
  body: string
  acceptance: string[]
}

export type PrototypeDeliveryRecord = {
  id: string
  versionId: string
  createdAt?: string
}

export type HandoffRecord = {
  id: string
  source: 'chat' | 'builder' | 'board'
  sourceRef: string
  summary: string
  status: 'recorded'
  execution: 'not_started'
  approval: 'not_requested'
  grant: 'none'
  createdAt?: string
}
