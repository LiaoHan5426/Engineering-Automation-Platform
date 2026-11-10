import { AgentErrors } from '@eap/runtime-client/contracts'
import type { KnowledgeContext } from '@eap/runtime-client/contracts'

/** Fixed fixtures only: never falls back to the runtime or grants production access. */
const expertRef = { id: 'mock-knowledge-expert', revision: 1 }
export const mockExpertPage = {
  items: [
    JSON.stringify({
      id: expertRef.id,
      apiVersion: 'eap/v1',
      kind: 'Expert',
      behavior: { id: 'sql-analysis', version: 1 },
      name: 'Mock · 模拟知识专家',
      description: 'Fixed simulated knowledge; not a production grant',
      role: 'Mock guidance',
      knowledgeBases: ['mock-base'],
      permissions: [],
      steps: [],
      edges: [],
    }),
  ],
  states: { [expertRef.id]: { enabled: true, builtin: false, revision: 1 } },
}
function exactFields(value: unknown, keys: string[]): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  )
}
export function mockExpertPreview(body: unknown) {
  if (!exactFields(body, ['expertRef', 'query']))
    return { status: 400, data: { code: AgentErrors.INVALID_EXPERT_CONTEXT } }
  return mockExpertContext(body.expertRef, body.query)
}
export function validMockExpertRef(ref: unknown): ref is { id: string; revision: number } {
  return (
    exactFields(ref, ['id', 'revision']) &&
    typeof ref.id === 'string' &&
    ref.id.length <= 120 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(ref.id) &&
    typeof ref.revision === 'number' &&
    Number.isInteger(ref.revision) &&
    ref.revision >= 1 &&
    ref.revision < 2 ** 63
  )
}
export function mockExpertContext(
  ref: unknown,
  query: unknown,
): { status: number; data: KnowledgeContext | { code: string } } {
  const failure = (status: number, detail: string) => ({ status, data: { code: detail } })
  if (!validMockExpertRef(ref)) return failure(400, AgentErrors.INVALID_EXPERT_CONTEXT)
  if (typeof query !== 'string' || !query.trim())
    return failure(400, AgentErrors.INVALID_EXPERT_CONTEXT)
  if (query.length > 500) return failure(400, 'EXPERT_CONTEXT_QUERY_TOO_LARGE')
  if (ref.id !== expertRef.id) return failure(404, 'EXPERT_CONTEXT_NOT_FOUND')
  if (ref.revision !== expertRef.revision) return failure(409, 'EXPERT_CONTEXT_STALE')
  const references = /review|审查/i.test(query)
    ? [
        {
          id: 'mock-K1',
          source: 'Mock review guide',
          knowledgeBase: 'Mock authorized fixture',
          knowledgeBaseId: 'mock-base',
          documentId: 'mock-document',
          excerpt:
            'Mock excerpt: review changes and verify tests. This is fixed simulated content, not repository or production knowledge.',
          retrievalMode: 'mock-keyword',
        },
      ]
    : []
  return {
    status: 200,
    data: {
      expertRef: { ...expertRef },
      status: references.length ? 'ready' : 'no_matches',
      references,
    },
  }
}
