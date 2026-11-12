import type { CodeTaskRef } from '@eap/runtime-client'

/** A view location only. The board always reads the current task; URL data grants no authority. */
export type BoardLocation = Pick<CodeTaskRef, 'projectId' | 'taskId'>

export function boardTaskLocation(target: BoardLocation): string {
  return '#board?' + new URLSearchParams({ projectId: target.projectId, taskId: target.taskId })
}

export function readBoardLocation(hash: string): BoardLocation | null {
  if (!hash.startsWith('#board?')) return null
  const query = new URLSearchParams(hash.slice(hash.indexOf('?') + 1))
  const projectId = query.get('projectId'),
    taskId = query.get('taskId')
  if (
    !projectId?.trim() ||
    projectId.length > 120 ||
    !taskId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(taskId) ||
    [...query.keys()].some(
      (key) => !['projectId', 'taskId'].includes(key) || query.getAll(key).length !== 1,
    )
  )
    return null
  return { projectId, taskId }
}
