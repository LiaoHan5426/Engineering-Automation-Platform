import type { TaskContext } from '@eap/runtime-client'
import type { BoardTaskDraft } from '../shell/workbench'

/** Explicit adoption replaces text, task and prototype as one unit; never guesses a target path. */
export function adoptBoardTaskDraft(draft: BoardTaskDraft): {
  text: string
  context: TaskContext
  executionMode: BoardTaskDraft['executionMode']
} {
  return {
    executionMode: draft.executionMode,
    text: draft.title,
    context: {
      mode: draft.taskRef ? 'code' : 'chat',
      expert: draft.taskRef ? 'frontend' : 'general',
      instructions: '',
      reasoning: 'default',
      approval: 'review',
      files: draft.taskRef ? (draft.referenceFiles ?? []).map((file) => ({ ...file })) : [],
      prototypeVersionId: draft.prototypeVersionId ?? '',
      targetPath: draft.taskRef ? (draft.targetPath ?? '') : '',
      componentPaths: draft.taskRef ? [...(draft.componentPaths ?? [])] : [],
      ...(draft.taskRef ? { taskRef: { ...draft.taskRef } } : {}),
    },
  }
}
