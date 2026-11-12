import type { CodeTaskRef } from './boardModels.ts'
import type { CodeProposalStatus } from './codeProposal.ts'

/** Read-only generation-prep baseline. Never includes file contents. */
export type WorkspaceBaseline = {
  path: string
  exists: boolean
  baseHash: string
  denial: string
}

/** Read-only workspace excerpt for generation prep. Does not grant write authorization. */
export type WorkspaceSource = {
  path: string
  exists: boolean
  baseHash: string
  bytes: number
  excerpt: string
  denial: string
}

export type WorkspaceFiles = {
  path: string
  entries: Array<{ name: string; path: string; directory: boolean }>
  truncated: boolean
  denial: string
}

/** Read-only dirty-file summary. requested=false means git was not run. */
export type WorkspaceDirty = {
  requested: boolean
  denial: string
  count: number
  paths: string[]
  detail: string
}

/**
 * Safe verification probe. requested=false means the probe did not run.
 * Never marks apply verification as passed; never enables configured heavy checks.
 */
export type VerificationProbe = {
  requested: boolean
  denial: string
  name: string
  exitCode: number | null
  summary: string
}

export type CodeGenerationSnapshot = {
  companionFiles: Array<{ path: string; baseHash: string }>
  taskBinding?: CodeTaskRef | null
  id: string
  targetPath: string
  baseHash: string
  capturedAt: string
  prototypeVersionId: string
  prototypeContentHash: string
}

export type CodeProposal = {
  id: string
  conversationId: string
  workspace: string
  summary: string
  files: Array<{ path: string; before: string | null; content: string; baseHash: string }>
  generation?: CodeGenerationSnapshot | null
  applied: boolean
  writeAllowed: boolean
  verification: string
}

export type CodeApplied = {
  id: string
  written: string[]
  verification: string
  checks: Array<{ name: string; exitCode: number | null; summary: string }>
  status?: string
  afterHash?: string
  reason?: string
}

export type CodePreparation = {
  workspace: string
  files: Array<{ path: string; exists: boolean; baseHash: string; bytes: number }>
  totalBytes: number
}

export type CodeProposalState = {
  proposal: CodeProposal
  dependencies: import('./sourceDependency').SourceDependency[]
  status: CodeProposalStatus
  result: CodeApplied | null
  reason: string
}
