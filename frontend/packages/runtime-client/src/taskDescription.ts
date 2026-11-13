import type { RequestClient } from '@eap/request'

export type TaskDescriptionOptimizationRequest = {
  text: string
  connectionId?: string
  model?: string
}
export type TaskDescriptionOptimization = { text: string; connectionId: string; model: string }

/** Task-form suggestions only; adoption and original-text protection belong to the caller. */
export function createTaskDescriptionApi(client: RequestClient) {
  const path = (requestId: string) =>
    '/ai/task-description/optimizations/' + encodeURIComponent(requestId)
  return {
    optimizeTaskDescription: (
      requestId: string,
      request: TaskDescriptionOptimizationRequest,
      options?: { signal?: AbortSignal },
    ) =>
      client
        .post<TaskDescriptionOptimization>(path(requestId), request, {
          signal: options?.signal,
          timeout: 65_000,
        })
        .then(({ data }) => data),
    // Send independently after aborting POST: an aborted signal must never cancel this DELETE.
    cancelTaskDescriptionOptimization: (requestId: string) =>
      client.delete<void>(path(requestId)).then(() => undefined),
  }
}
