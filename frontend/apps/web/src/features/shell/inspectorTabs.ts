import type { InspectorArea } from '../../lib/inspectorMessages'

/**
 * Prototype board 18: each activity area owns its own inspector tab set.
 * Kept outside the SFC so both the component and its tests share one contract.
 */
export const INSPECTOR_TABS: Record<InspectorArea, readonly string[]> = {
  code: ['changes', 'files', 'git', 'browser', 'memory'],
  work: ['outline', 'references', 'preview', 'browser', 'history'],
  scenes: ['versions', 'dependencies', 'verification', 'history', 'configure'],
  experts: ['detail', 'instructions', 'capabilities', 'memory', 'tasks'],
  settings: ['detail'],
}

/** Read-only values already held by the current session; no invented evidence. */
export type InspectorSnapshot = {
  references: string[]
  localFiles: string[]
  proposalFiles: string[]
  appliedFiles: string[]
  /** Real CodeProposal files; the changes tab derives line diffs from these. */
  proposalDiffs?: Array<{ path: string; before: string | null; content: string; baseHash: string }>
  memory: string
  workspaceLabel: string
  model: string
  connectionName: string
  verification: string
  verificationChecks?: Array<{ name: string; exitCode: number | null; summary: string }>
  runtimeStatus: string
  title: string
  contextLabel: string
}
