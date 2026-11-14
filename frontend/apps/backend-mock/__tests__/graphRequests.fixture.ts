import { randomUUID } from 'node:crypto'
import { createMockChatBackend } from '../src/chatBackend'
import type { ChatGraph } from '@eap/runtime-client/contracts'
/** Domain tests submit the current graph revision and selected assistant, just as a real caller. */
export function createChatGraphFixture() {
  const backend = createMockChatBackend()
  return {
    ...backend,
    async handle(method: string, route: string, body: Record<string, unknown> = {}) {
      if (method === 'POST' && route.endsWith('/messages')) {
        const graphRoute = route.slice(0, -'/messages'.length) + '/graph'
        const graph = (await backend.handle('GET', graphRoute)).data as ChatGraph
        body = {
          operationId: randomUUID(),
          expectedRevision: graph.revision,
          kind: 'send',
          targetMessageId: null,
          parentMessageId: graph.nodes.at(-1)?.id ?? null,
          ...body,
        }
      }
      if (method === 'POST' && route.endsWith('/model-history/summary'))
        body = { operationId: randomUUID(), ...body }
      return backend.handle(method, route, body)
    },
  }
}
