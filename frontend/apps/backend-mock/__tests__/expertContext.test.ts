import { expect, it } from 'vite-plus/test'
import { createChatGraphFixture } from './graphRequests.fixture'
const expertRef = { id: 'mock-knowledge-expert', revision: 1 }
it('serializes ordinary chat knowledgeContext as null, including after removing an expert', async () => {
  const backend = createChatGraphFixture()
  const opened = await backend.handle('POST', '/ai/conversations')
  const id = (opened.data as { conversationId: string }).conversationId
  const message = (context?: unknown) =>
    backend.handle('POST', `/ai/conversations/${id}/messages`, {
      message: 'review',
      toolMode: 'none',
      ...(context ? { context } : {}),
    })
  expect((await message()).data).toHaveProperty('knowledgeContext', null)
  expect((await message({ mode: 'chat', knowledgeExpertRef: expertRef })).data).toHaveProperty(
    'knowledgeContext.expertRef',
    expertRef,
  )
  expect((await message({ mode: 'chat' })).data).toHaveProperty('knowledgeContext', null)
})
it('exposes a clearly simulated saved expert and same-contract scoped preview/message without production claims', async () => {
  const backend = createChatGraphFixture()
  const page = await backend.handle('GET', '/experts')
  expect(page.status).toBe(200)
  expect(page.data).toMatchObject({ states: { [expertRef.id]: { enabled: true, revision: 1 } } })
  const manifest = JSON.parse((page.data as { items: string[] }).items[0]!)
  expect(manifest.knowledgeBases).toEqual(['mock-base'])
  const preview = await backend.handle('POST', '/ai/expert-context/preview', {
    expertRef,
    query: 'review',
  })
  expect(preview.status).toBe(200)
  expect(preview.data).toMatchObject({
    expertRef,
    status: 'ready',
    references: [
      expect.objectContaining({
        retrievalMode: 'mock-keyword',
        source: expect.stringContaining('Mock'),
      }),
    ],
  })
  const conversation = await backend.handle('POST', '/ai/conversations')
  const id = (conversation.data as { conversationId: string }).conversationId
  const answer = await backend.handle('POST', `/ai/conversations/${id}/messages`, {
    message: 'review',
    toolMode: 'none',
    context: { mode: 'chat', knowledgeExpertRef: expertRef },
  })
  expect(answer.data).toMatchObject({ status: 'SUCCEEDED', knowledgeContext: preview.data })
  expect(answer.data).not.toHaveProperty('knowledgeMemoryCleared', true)
  expect(
    (
      await backend.handle('POST', '/ai/expert-context/preview', {
        expertRef,
        query: 'unmatched-z',
      })
    ).data,
  ).toMatchObject({ status: 'no_matches', references: [] })
})
it.each([
  { name: 'blank message', fields: { message: ' \t\n', toolMode: 'none' } },
  { name: 'non-string message', fields: { message: 1, toolMode: 'none' } },
  { name: 'message over 32000', fields: { message: 'x'.repeat(32001), toolMode: 'none' } },
  { name: 'missing toolMode', fields: { message: 'review' } },
  { name: 'non-string toolMode', fields: { message: 'review', toolMode: null } },
])('validates send parameters before knowledge resolution: $name', async ({ fields }) => {
  const backend = createChatGraphFixture()
  const opened = await backend.handle('POST', '/ai/conversations')
  const id = (opened.data as { conversationId: string }).conversationId
  for (const ref of [expertRef, { ...expertRef, revision: 2 }]) {
    expect(
      await backend.handle('POST', `/ai/conversations/${id}/messages`, {
        ...fields,
        context: { knowledgeExpertRef: ref },
      }),
    ).toMatchObject({ status: 400, data: { code: 'INVALID_CHAT_REQUEST' } })
  }
})
it('parses expert identity before send fields, then validates fields before tool compatibility', async () => {
  const backend = createChatGraphFixture()
  const opened = await backend.handle('POST', '/ai/conversations')
  const id = (opened.data as { conversationId: string }).conversationId
  for (const [context, message, detail] of [
    [{ knowledgeExpertRef: null }, '', 'INVALID_EXPERT_CONTEXT'],
    [{ mode: 'code', knowledgeExpertRef: expertRef }, '', 'INVALID_EXPERT_CONTEXT'],
    [{ knowledgeExpertRef: expertRef }, '', 'INVALID_CHAT_REQUEST'],
    [{ knowledgeExpertRef: expertRef }, 'review', 'EXPERT_CONTEXT_MODE_UNSUPPORTED'],
  ] as const) {
    expect(
      await backend.handle('POST', `/ai/conversations/${id}/messages`, {
        message,
        toolMode: 'git_status',
        context,
      }),
    ).toMatchObject({ status: 400, data: { code: detail } })
  }
})
// Counterexamples mirror KnowledgeExpertRef.parse: identity only, positive integer revision.
it.each(
  [
    null,
    {},
    [],
    'mock-knowledge-expert',
    { id: expertRef.id },
    ...[0, -1, 1.5, '1', null, true, 1e20].map((revision) => ({ ...expertRef, revision })),
    ...[
      '',
      ' mock-knowledge-expert',
      'mock-knowledge-expert\n',
      'Mock-knowledge',
      'mock--knowledge',
      'a'.repeat(121),
    ].map((id) => ({ ...expertRef, id })),
    ...['grants', 'instructions', 'excerpt', 'knowledgeBases'].map((field) => ({
      ...expertRef,
      [field]: ['forged'],
    })),
  ].map((ref) => ({ ref })),
)('rejects malformed/authority-bearing references in preview and send: $ref', async ({ ref }) => {
  const backend = createChatGraphFixture()
  const opened = await backend.handle('POST', '/ai/conversations')
  const id = (opened.data as { conversationId: string }).conversationId
  for (const reply of [
    await backend.handle('POST', '/ai/expert-context/preview', { expertRef: ref, query: 'review' }),
    await backend.handle('POST', `/ai/conversations/${id}/messages`, {
      message: 'review',
      toolMode: 'none',
      context: { mode: 'chat', knowledgeExpertRef: ref },
    }),
  ])
    expect(reply).toMatchObject({ status: 400, data: { code: 'INVALID_EXPERT_CONTEXT' } })
})
it.each([
  {},
  { expertRef },
  { query: 'review' },
  { expertRef, query: null },
  { expertRef, query: 1 },
  { expertRef, query: '' },
  { expertRef, query: ' \t\n' },
  { expertRef, query: 'review', grants: ['forged'] },
  { expertRef, query: 'review', excerpt: 'forged' },
])('requires exactly expertRef/query with a nonblank string preview query: %j', async (body) => {
  expect(
    await createChatGraphFixture().handle('POST', '/ai/expert-context/preview', body),
  ).toMatchObject({ status: 400, data: { code: 'INVALID_EXPERT_CONTEXT' } })
})
it.each([
  [{ ...expertRef, revision: 2 }, 'review', 409, 'EXPERT_CONTEXT_STALE'],
  [{ id: 'ungranted', revision: 1 }, 'review', 404, 'EXPERT_CONTEXT_NOT_FOUND'],
  [expertRef, 'x'.repeat(501), 400, 'EXPERT_CONTEXT_QUERY_TOO_LARGE'],
  [expertRef, '😀'.repeat(251), 400, 'EXPERT_CONTEXT_QUERY_TOO_LARGE'],
  [{ ...expertRef, revision: 2 }, 'x'.repeat(501), 400, 'EXPERT_CONTEXT_QUERY_TOO_LARGE'],
] as const)(
  'matches resolve validation/error codes for preview and send (%j)',
  async (ref, query, status, detail) => {
    const backend = createChatGraphFixture()
    const opened = await backend.handle('POST', '/ai/conversations')
    const id = (opened.data as { conversationId: string }).conversationId
    for (const reply of [
      await backend.handle('POST', '/ai/expert-context/preview', { expertRef: ref, query }),
      await backend.handle('POST', `/ai/conversations/${id}/messages`, {
        message: query,
        toolMode: 'none',
        context: { mode: 'chat', knowledgeExpertRef: ref },
      }),
    ])
      expect(reply).toMatchObject({ status, data: { code: detail } })
  },
)
it('allows the 500 UTF-16 boundary, defaults omitted context mode to chat and rejects code/PREBOUND', async () => {
  const backend = createChatGraphFixture()
  expect(
    (
      await backend.handle('POST', '/ai/expert-context/preview', {
        expertRef,
        query: '😀'.repeat(250),
      })
    ).status,
  ).toBe(200)
  const opened = await backend.handle('POST', '/ai/conversations')
  const id = (opened.data as { conversationId: string }).conversationId
  expect(
    (
      await backend.handle('POST', `/ai/conversations/${id}/messages`, {
        message: 'review',
        toolMode: 'none',
        context: { knowledgeExpertRef: expertRef },
      })
    ).status,
  ).toBe(200)
  for (const [mode, toolMode, detail] of [
    ['code', 'none', 'INVALID_EXPERT_CONTEXT'],
    ['chat', 'git_status', 'EXPERT_CONTEXT_MODE_UNSUPPORTED'],
  ]) {
    expect(
      await backend.handle('POST', `/ai/conversations/${id}/messages`, {
        message: 'review',
        toolMode,
        context: { mode, knowledgeExpertRef: expertRef },
      }),
    ).toMatchObject({ status: 400, data: { code: detail } })
  }
})
