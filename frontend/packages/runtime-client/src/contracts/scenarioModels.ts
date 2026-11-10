import type { ScenarioStatus } from './scenario.ts'
import type { ScenarioDependencyStatus } from './scenario.ts'

/** Configuration, never runtime permission or execution evidence. */
export type ScenarioConfiguration = {
  name: string
  status: ScenarioStatus
  modes: Array<'code' | 'work'>
  summary: string
  instructions: string
  tools: string[]
  skills: string[]
  mcp: string[]
  dependencies: Array<{
    name: string
    state: ScenarioDependencyStatus
    where: string
  }>
  workflow?: 'prototype-to-code' | null
}

export type ScenarioSnapshot = { id: string; revision: number; definition: ScenarioConfiguration }

export type ScenarioWorkflowDependencies = {
  contractVersion: 1
  workflow: 'prototype-to-code'
  observedAt: string
  plugins: Array<{ id: 'builder' | 'board'; required: boolean }>
  services: Array<{ id: 'prototype-versions'; state: 'READABLE' }>
  resources: Array<{ id: 'prototype-version'; required: boolean; count: number }>
}
