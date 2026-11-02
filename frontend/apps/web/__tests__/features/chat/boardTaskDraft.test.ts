import { expect, it } from 'vite-plus/test'
import { adoptBoardTaskDraft } from '../../../src/features/chat/boardTaskDraft'
const draft = {
  sessionId: '',
  title: 'Saved goal and criteria',
  taskRef: { projectId: 'p', taskId: '12345678-1234-1234-1234-123456789abc', revision: 3 },
  prototypeVersionId: 'design-id',
}
it('adopts task text and identity together with an explicitly empty target', () => {
  expect(adoptBoardTaskDraft(draft)).toMatchObject({
    text: draft.title,
    context: {
      mode: 'code',
      taskRef: draft.taskRef,
      prototypeVersionId: 'design-id',
      targetPath: '',
      files: [],
    },
  })
})
it('does not invent binding for a planning-only legacy draft', () => {
  const adopted = adoptBoardTaskDraft({ sessionId: '', title: 'Discuss first' })
  expect(adopted.context.mode).toBe('chat')
  expect(adopted.context.taskRef).toBeUndefined()
})
