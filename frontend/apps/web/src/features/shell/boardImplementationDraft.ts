import { BoardTaskColumn, type BoardTask } from '@eap/runtime-client'
import type { BoardTaskDraft, CodePreparationSelection } from './workbench'

export function boardImplementationDraft(
  task: BoardTask,
  criteriaLabel: string,
  selection?: CodePreparationSelection,
): BoardTaskDraft {
  return {
    executionMode: 'chat',
    sessionId: task.sessionId || '',
    title: [
      task.title,
      task.goal,
      task.acceptanceCriteria ? criteriaLabel + ':\n' + task.acceptanceCriteria : '',
      task.notes,
    ]
      .filter(Boolean)
      .join('\n\n'),
    ...(task.column === BoardTaskColumn.READY && !task.preparationIssues.length
      ? {
          taskRef: { projectId: task.projectId, taskId: task.id, revision: task.revision },
          prototypeVersionId: task.prototypeVersionId ?? '',
          ...selection,
        }
      : {}),
  }
}

/** Planning carries the original task identity without claiming implementation readiness. */
export function boardPlanningDraft(task: BoardTask, criteriaLabel: string): BoardTaskDraft {
  return {
    ...boardImplementationDraft(task, criteriaLabel),
    executionMode: 'plan',
    taskRef: { projectId: task.projectId, taskId: task.id, revision: task.revision },
    prototypeVersionId: task.prototypeVersionId ?? '',
  }
}
