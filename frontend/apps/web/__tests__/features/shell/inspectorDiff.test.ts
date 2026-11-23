// @vitest-environment happy-dom
import { describe, expect, it } from 'vite-plus/test'
import { buildInspectorDiffs } from '../../../src/features/shell/inspectorDiff'

describe('buildInspectorDiffs', () => {
  it('counts real added and removed lines from before/after content', () => {
    const [file] = buildInspectorDiffs([
      { path: 'src/a.ts', before: 'line a\nline b\nline c', content: 'line a\nline B\nline c\nline d' },
    ])
    expect(file!.path).toBe('src/a.ts')
    expect(file!.added).toBe(2)
    expect(file!.removed).toBe(1)
  })

  it('treats a missing before as a new file whose lines are all additions', () => {
    const [file] = buildInspectorDiffs([{ path: 'src/new.ts', before: null, content: 'a\nb' }])
    expect(file!.added).toBe(2)
    expect(file!.removed).toBe(0)
    expect(file!.rows.map((row) => row.kind)).toEqual(['add', 'add'])
  })

  it('keeps context, remove and add rows in real order', () => {
    const [file] = buildInspectorDiffs([{ path: 'a', before: 'x\ny\nz', content: 'x\nY\nz' }])
    expect(file!.rows.map((row) => `${row.kind}:${row.text}`)).toEqual([
      'context:x',
      'remove:y',
      'add:Y',
      'context:z',
    ])
  })

  it('flags truncation for very large files instead of hiding the limit', () => {
    const before = Array.from({ length: 600 }, (_, i) => `old ${i}`).join('\n')
    const content = Array.from({ length: 600 }, (_, i) => `new ${i}`).join('\n')
    const [file] = buildInspectorDiffs([{ path: 'big', before, content }])
    expect(file!.truncated).toBe(true)
  })

  it('reports zero changes for identical content', () => {
    const [file] = buildInspectorDiffs([{ path: 'same', before: 'a\nb', content: 'a\nb' }])
    expect(file!.added).toBe(0)
    expect(file!.removed).toBe(0)
  })
})
