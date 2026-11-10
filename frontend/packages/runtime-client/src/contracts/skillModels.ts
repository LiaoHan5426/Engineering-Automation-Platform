import type { SkillDependencyStatus } from './skill.ts'

export type SkillRef = { id: string; version: string; digest: string; stateRevision: number }

export type SkillResource = {
  path: string
  mediaType: 'text/markdown' | 'text/plain'
  content: string
}

export type SkillImportInput = {
  rawSkillMd: string
  version: string
  sourceLabel: string
  resources: SkillResource[]
  requiredCapabilities: string[]
}

export type SkillDependency = { id: string; status: SkillDependencyStatus }

export type SkillSummary = SkillRef & {
  description: string
  enabled: boolean
  sourceLabel: string
  createdAt: string
  dependencies: SkillDependency[]
}

export type SkillSnapshot = Omit<SkillSummary, 'createdAt'> &
  SkillImportInput & {
    createdAt: string | null
    schemaVersion: 1
    entry: 'SKILL.md'
    instructions: string
    scope: string
    trust: { operator: string; confirmedAt: string } | null
  }

export type SkillSaveRequest = { input: SkillImportInput; expectedDigest: string; confirmed: true }

export type SkillContext = {
  skillRef: SkillRef
  instructions: string
  resources: SkillResource[]
  dependencies: SkillDependency[]
}
