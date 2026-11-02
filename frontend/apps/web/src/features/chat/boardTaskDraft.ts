import type { TaskContext } from '@eap/runtime-client'
import type { BoardTaskDraft } from '../shell/workbench'

/** Explicit adoption replaces text, task and prototype as one unit; never guesses a target path. */
export function adoptBoardTaskDraft(draft: BoardTaskDraft): { text: string; context: TaskContext } {
  return {
    text: draft.title,
    context: {
      mode: draft.taskRef ? 'code' : 'chat',
      expert: draft.taskRef ? 'frontend' : 'general',
      instructions: '',
      reasoning: 'default',
      approval: 'review',
      files: [],
      prototypeVersionId: draft.prototypeVersionId ?? '',
      targetPath: '',
      ...(draft.taskRef ? { taskRef: { ...draft.taskRef } } : {}),
    },
  }
}
