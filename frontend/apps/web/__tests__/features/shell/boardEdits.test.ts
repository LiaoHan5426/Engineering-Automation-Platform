import { expect, it } from 'vite-plus/test'
import { readBoardEdit, writeBoardEdit } from '../../../src/features/shell/boardEdits'
it('isolates local unsent edits by task and service source and clears saved drafts', () => {
  const data = new Map<string, string>()
  const store = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
    removeItem: (key: string) => {
      data.delete(key)
    },
  }
  const edit = {
    notes: 'unsaved',
    priority: 'p1' as const,
    revision: 3,
    goal: 'goal',
    acceptanceCriteria: 'check',
  }
  writeBoardEdit(store, 'a', 'api-a', edit)
  expect(readBoardEdit(store, 'a', 'api-a')).toEqual(edit)
  expect(readBoardEdit(store, 'b', 'api-a')).toBeNull()
  expect(readBoardEdit(store, 'a', 'api-b')).toBeNull()
  writeBoardEdit(store, 'a', 'api-a', null)
  expect(readBoardEdit(store, 'a', 'api-a')).toBeNull()
  data.set('api-a.eap.board-edit.v1.a', '{invalid')
  expect(readBoardEdit(store, 'a', 'api-a')).toBeNull()
})
