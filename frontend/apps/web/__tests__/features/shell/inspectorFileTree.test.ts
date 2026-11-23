import { describe, expect, it } from 'vite-plus/test'
import {
  buildInspectorFileTree,
  collectInspectorFolders,
} from '../../../src/features/shell/inspectorFileTree'

describe('inspector file tree', () => {
  it('groups real session paths into folders with deterministic ordering', () => {
    const tree = buildInspectorFileTree({
      references: ['src/App.vue', 'notes/readme.md'],
      localFiles: ['notes/local.md'],
      proposalFiles: ['src/features/chat/ChatWorkspace.vue'],
      appliedFiles: ['src/lib/i18n.ts'],
    })

    expect(tree.map((node) => node.name)).toEqual(['notes', 'src'])
    expect(tree.every((node) => node.kind === 'folder')).toBe(true)
    expect(tree[0]!.children?.map((node) => node.path)).toEqual([
      'notes/local.md',
      'notes/readme.md',
    ])
    expect(tree[1]!.children?.map((node) => node.name)).toEqual(['App.vue', 'features', 'lib'])
    expect(tree[1]!.children?.[1]!.children?.[0]!.children?.[0]!.path).toBe(
      'src/features/chat/ChatWorkspace.vue',
    )
    expect(collectInspectorFolders(tree)).toEqual([
      'notes',
      'src',
      'src/features',
      'src/features/chat',
      'src/lib',
    ])
  })

  it('labels each file with its strongest real source without inventing content', () => {
    const tree = buildInspectorFileTree({
      references: ['src/App.vue', 'src/features/chat/ChatWorkspace.vue'],
      localFiles: ['src/App.vue'],
      proposalFiles: ['src/features/chat/ChatWorkspace.vue'],
      appliedFiles: ['src/lib/i18n.ts'],
    })

    const app = tree[0]!.children!.find((node) => node.name === 'App.vue')!
    const chat = tree[0]!.children!.find((node) => node.name === 'features')!.children![0]!
      .children![0]!
    const i18n = tree[0]!.children!.find((node) => node.name === 'lib')!.children![0]!
    expect(app.source).toBe('reference' as const)
    expect(chat.source).toBe('proposal' as const)
    expect(i18n.source).toBe('applied' as const)
    expect(app.path).toBe('src/App.vue')
  })

  it('normalizes separators and drops empty or duplicate paths', () => {
    const tree = buildInspectorFileTree({
      references: ['src\\lib\\i18n.ts', '', 'src/App.vue'],
      localFiles: ['src/App.vue'],
      proposalFiles: [],
      appliedFiles: ['/src/lib/i18n.ts'],
    })

    expect(tree).toHaveLength(1)
    const app = tree[0]!.children!.find((node) => node.name === 'App.vue')!
    const i18n = tree[0]!.children!.find((node) => node.name === 'lib')!.children![0]!
    expect([app.path, i18n.path]).toEqual(['src/App.vue', 'src/lib/i18n.ts'])
    expect(i18n.source).toBe('applied' as const)
  })

  it('returns nothing when no real source holds a path', () => {
    expect(
      buildInspectorFileTree({
        references: [],
        localFiles: [],
        proposalFiles: [],
        appliedFiles: [],
      }),
    ).toEqual([])
  })
})
