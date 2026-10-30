import { expect, it } from 'vite-plus/test';
import { readBoardEdit, writeBoardEdit } from './boardEdits';
it('isolates local unsent edits by task and service source and clears saved drafts', () => {
  const data = new Map<string, string>();
  const store = { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => { data.set(key, value); }, removeItem: (key: string) => { data.delete(key); } };
  const edit = { notes: 'unsaved', priority: 'p1' as const, revision: 3 };
  writeBoardEdit(store, 'a', false, edit);
  expect(readBoardEdit(store, 'a', false)).toEqual(edit);
  expect(readBoardEdit(store, 'b', false)).toBeNull();
  expect(readBoardEdit(store, 'a', true)).toBeNull();
  writeBoardEdit(store, 'a', false, null); expect(readBoardEdit(store, 'a', false)).toBeNull();
  data.set('eap.board-edit.v1.a', '{invalid'); expect(readBoardEdit(store, 'a', false)).toBeNull();
});
