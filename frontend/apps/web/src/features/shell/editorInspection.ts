export interface EditorInspectionTarget {
  instanceId: string
  documentId: string
  sourceRef: string
  revision: number
}

export interface EditorInspectionDraft {
  title: string
  project: unknown
  selection: unknown
}

export type EditorInspectionResult =
  | { status: 'ok'; target: EditorInspectionTarget; draft: EditorInspectionDraft }
  | { status: 'unavailable' | 'conflict' | 'too-large' | 'failed' }

export function sameInspectionTarget(
  a: EditorInspectionTarget,
  b: EditorInspectionTarget,
): boolean {
  return (
    a.instanceId === b.instanceId &&
    a.documentId === b.documentId &&
    a.sourceRef === b.sourceRef &&
    a.revision === b.revision
  )
}

/** Local synchronous read only: no persistence, registry, transport or retained editor reference. */
export function readEditorInspection(
  expected: EditorInspectionTarget,
  current: () => EditorInspectionTarget | null,
  read: () => EditorInspectionDraft,
): EditorInspectionResult {
  const before = current()
  if (!before) return { status: 'unavailable' }
  if (!sameInspectionTarget(expected, before)) return { status: 'conflict' }
  try {
    const serialized = JSON.stringify(read())
    const after = current()
    if (!after) return { status: 'unavailable' }
    if (!sameInspectionTarget(expected, after)) return { status: 'conflict' }
    // Never show a truncated project as a complete draft. Limit is UTF-16 code units.
    if (serialized.length > 24_000) return { status: 'too-large' }
    return { status: 'ok', target: { ...expected }, draft: JSON.parse(serialized) }
  } catch {
    return { status: 'failed' }
  }
}
