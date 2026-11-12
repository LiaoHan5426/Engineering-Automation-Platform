import { expect, it } from 'vite-plus/test'
import { adoptBoardTaskDraft } from '../../../src/features/chat/boardTaskDraft'
const draft = {
  executionMode: 'chat' as const,
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
it('does not invent binding for an unbound discussion draft', () => {
  const adopted = adoptBoardTaskDraft({
    executionMode: 'chat',
    sessionId: '',
    title: 'Discuss first',
  })
  expect(adopted.context.mode).toBe('chat')
  expect(adopted.context.taskRef).toBeUndefined()
})
it('keeps a planning draft on the original task without selecting an implementation target', () => {
  const adopted = adoptBoardTaskDraft({ ...draft, executionMode: 'plan' })
  expect(adopted.executionMode).toBe('plan')
  expect(adopted.context.taskRef).toEqual(draft.taskRef)
  expect(adopted.context.targetPath).toBe('')
})
it('adopts an explicit checked file selection together with the original task identity', () => {
  const paths = ['frontend/form.css', 'frontend/copy.json']
  const referenceFiles = [
    { name: 'read-only:frontend/Host.ts', content: "export const route = '#/detail'" },
  ]
  const adopted = adoptBoardTaskDraft({
    ...draft,
    targetPath: 'frontend/Form.vue',
    componentPaths: paths,
    referenceFiles,
  })
  expect(adopted.context).toMatchObject({
    targetPath: 'frontend/Form.vue',
    componentPaths: paths,
    taskRef: draft.taskRef,
  })
  paths.push('frontend/other.ts')
  referenceFiles[0]!.content = 'changed later'
  expect(adopted.context.componentPaths).toHaveLength(2)
  expect(adopted.context.files[0]!.content).toBe("export const route = '#/detail'")
})
