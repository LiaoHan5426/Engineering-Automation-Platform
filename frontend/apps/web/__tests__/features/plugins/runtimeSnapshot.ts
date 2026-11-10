import type { BoardRuntimeSnapshot } from '@eap/runtime-client'
export function runtimeSnapshot(
  projectId: string,
  overrides: Partial<BoardRuntimeSnapshot> = {},
): BoardRuntimeSnapshot {
  return {
    projectId,
    observedAt: '2026-11-10T04:00:00Z',
    taskCount: 0,
    runCount: 0,
    activeRunCount: 0,
    unknownRunCount: 0,
    activeVerificationCount: 0,
    unknownVerificationCount: 0,
    activeWriteCount: 0,
    unknownWriteCount: 0,
    items: [],
    truncated: false,
    ...overrides,
  }
}
