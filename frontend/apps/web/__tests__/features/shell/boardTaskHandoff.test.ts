import { expect, it } from 'vite-plus/test'
import {
  readTaskHandoff,
  writeTaskHandoff,
  type TaskHandoff,
} from '../../../src/features/shell/boardTaskHandoff'
const draft = (): TaskHandoff => ({
  source: {
    conversationId: 'conversation',
    executionId: 'execution',
    text: 'Complete original answer',
  },
  draft: {
    projectId: 'project',
    title: 'Review the plan',
    goal: 'Complete original answer',
    acceptanceCriteria: '',
  },
  linkSource: true,
})
function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
    removeItem: (key: string) => {
      values.delete(key)
    },
  }
}
it('preserves the full answer independently of edited requirements and across API scopes', () => {
  const store = storage(),
    before = draft()
  before.draft.goal = 'x'.repeat(6000)
  writeTaskHandoff(store, 'one', before, null)
  const edited = {
    ...before,
    draft: { ...before.draft, goal: 'Reviewed goal', acceptanceCriteria: 'Check the page' },
  }
  writeTaskHandoff(store, 'one', edited, before)
  expect(readTaskHandoff(store, 'one')).toEqual(edited)
  expect(readTaskHandoff(store, 'one')!.source.text).toBe('Complete original answer')
  expect(readTaskHandoff(store, 'two')).toBeNull()
})
it('refuses to overwrite or discard a draft changed by another editor', () => {
  const store = storage(),
    before = draft()
  writeTaskHandoff(store, 'one', before, null)
  const next = { ...before, linkSource: false }
  writeTaskHandoff(store, 'one', next, before)
  expect(() => writeTaskHandoff(store, 'one', before, before)).toThrow()
  expect(() => writeTaskHandoff(store, 'one', null, before)).toThrow()
  expect(readTaskHandoff(store, 'one')).toEqual(next)
})
it('does not replace malformed stored content or report success when readback fails', () => {
  const store = storage()
  store.setItem('one.eap.board-task-handoff.v1', '{broken')
  expect(() => writeTaskHandoff(store, 'one', draft(), null)).toThrow()
  expect(store.getItem('one.eap.board-task-handoff.v1')).toBe('{broken')
  expect(() =>
    writeTaskHandoff({ ...storage(), setItem: () => {} }, 'one', draft(), null),
  ).toThrow()
})
