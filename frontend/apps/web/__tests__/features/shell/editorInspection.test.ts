import { describe, expect, it, vi } from 'vite-plus/test'
import {
  readEditorInspection,
  type EditorInspectionTarget,
} from '../../../src/features/shell/editorInspection'

const target: EditorInspectionTarget = {
  instanceId: 'instance-alpha',
  documentId: 'draft-1',
  sourceRef: 'builder-alpha',
  revision: 3,
}

describe('bounded editor instance inspection', () => {
  it.each([
    { ...target, instanceId: 'instance-beta' },
    { ...target, documentId: 'other-document' },
    { ...target, sourceRef: 'builder-beta' },
    { ...target, revision: 4 },
  ])('rejects stale or misrouted targets before reading: %j', (current) => {
    const read = vi.fn()
    expect(readEditorInspection(target, () => current, read)).toEqual({ status: 'conflict' })
    expect(read).not.toHaveBeenCalled()
  })
  it('rejects closed instances and discards results if closed during capture', () => {
    const read = vi.fn()
    expect(readEditorInspection(target, () => null, read)).toEqual({ status: 'unavailable' })
    expect(read).not.toHaveBeenCalled()
    let live: EditorInspectionTarget | null = target
    expect(
      readEditorInspection(
        target,
        () => live,
        () => {
          live = null
          return { title: 'lost', project: {}, selection: null }
        },
      ),
    ).toEqual({ status: 'unavailable' })
  })
  it('discards revision races rather than returning a mixed snapshot', () => {
    let current = target
    expect(
      readEditorInspection(
        target,
        () => current,
        () => {
          current = { ...target, revision: 4 }
          return { title: '', project: {}, selection: null }
        },
      ),
    ).toEqual({ status: 'conflict' })
  })
  it('rejects oversized and failed reads without substituted or partial data', () => {
    expect(
      readEditorInspection(
        target,
        () => target,
        () => ({ title: 'x'.repeat(24_001), project: {}, selection: null }),
      ),
    ).toEqual({ status: 'too-large' })
    expect(
      readEditorInspection(
        target,
        () => target,
        () => {
          throw new Error('lost')
        },
      ),
    ).toEqual({ status: 'failed' })
  })
  it('returns a detached current draft and selection without saving', () => {
    const project = { pages: [{ content: 'unsaved' }] }
    const selection = { id: 'selected-1', content: '<script>not executed</script>' }
    const result = readEditorInspection(
      target,
      () => target,
      () => ({ title: 'Draft', project, selection }),
    )
    expect(result).toMatchObject({ status: 'ok', target, draft: { project, selection } })
    project.pages[0]!.content = 'later edit'
    expect(result.status === 'ok' && result.draft.project).toEqual({
      pages: [{ content: 'unsaved' }],
    })
  })
})
