import type { RequestClient } from '@eap/request'
export type TaskDetailOptimizationRequest = {
  goal: string
  acceptanceCriteria: string
  connectionId?: string
  model?: string
}
export type TaskDetailOptimization = TaskDetailOptimizationRequest & {
  connectionId: string
  model: string
}
export function isTaskDetailFields(value: unknown): value is TaskDetailOptimizationRequest {
  if (!value || typeof value !== 'object') return false
  const row = value as Record<string, unknown>
  return ['goal', 'acceptanceCriteria'].every(
    (key) => typeof row[key] === 'string' && !!row[key].trim() && row[key].length <= 2000,
  )
}
export function createTaskDetailApi(client: RequestClient) {
  const path = (id: string) => '/ai/task-detail/optimizations/' + encodeURIComponent(id)
  return {
    optimizeTaskDetail: async (
      id: string,
      request: TaskDetailOptimizationRequest,
      options?: { signal?: AbortSignal },
    ): Promise<TaskDetailOptimization> => {
      if (!isTaskDetailFields(request)) throw new Error('INVALID_REQUEST')
      const { data } = await client.post<TaskDetailOptimization>(path(id), request, {
        signal: options?.signal,
        timeout: 65_000,
      })
      if (
        !isTaskDetailFields(data) ||
        typeof data.connectionId !== 'string' ||
        !data.connectionId ||
        typeof data.model !== 'string' ||
        !data.model
      )
        throw new Error('AI_RESPONSE_INVALID')
      return data
    },
    cancelTaskDetailOptimization: (id: string) =>
      client.delete<void>(path(id)).then(() => undefined),
  }
}
