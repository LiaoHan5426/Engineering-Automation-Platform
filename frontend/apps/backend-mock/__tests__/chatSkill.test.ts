import { expect, it } from 'vite-plus/test'
import { createChatGraphFixture as createMockChatBackend } from './graphRequests.fixture'
import { mockSkillText } from '../src/skillFixture'
import type { SkillSnapshot } from '@eap/runtime-client'
it.each([
  [
    {
      skillRef: { id: 'mock-review', version: '1.0.0', digest: 'a'.repeat(64), stateRevision: 2 },
      injected: true,
    },
    'INVALID_TASK_CONTEXT',
  ],
  [{ skillRef: null, skillResourcePaths: null }, 'INVALID_SKILL_REF'],
  [{ skillRef: null, mode: null }, 'INVALID_TASK_CONTEXT'],
  [{ skillRef: null, instructions: null }, 'INVALID_TASK_CONTEXT'],
  [{ skillRef: null, expert: 'injected' }, 'INVALID_TASK_CONTEXT'],
  [{ skillRef: null, files: null }, 'INVALID_TASK_CONTEXT'],
  [{ skillRef: null, files: [{ name: 'a', content: 'b', extra: 'c' }] }, 'INVALID_TASK_CONTEXT'],
  [
    {
      skillRef: { id: 'mock-review', version: '1.0.0', digest: 'a'.repeat(64), stateRevision: 2 },
      mode: 'code',
      skillResourcePaths: null,
    },
    'SKILL_CONTEXT_MODE_UNSUPPORTED',
  ],
  [{ skillResourcePaths: [] }, 'INVALID_SKILL_RESOURCE_PATHS'],
  [
    {
      skillRef: { id: 'mock-review', version: '1.0.0', digest: 'a'.repeat(64), stateRevision: 2 },
      skillResourcePaths: ['notes.txt', 'NOTES.txt'],
    },
    'INVALID_SKILL_RESOURCE_PATHS',
  ],
] as const)(
  'uses runtime field validation order for malformed Skill contexts %j',
  async (context, detail) => {
    const api = createMockChatBackend()
    const c = (await api.handle('POST', '/ai/conversations')).data as { conversationId: string }
    const response = await api.handle('POST', `/ai/conversations/${c.conversationId}/messages`, {
      message: 'question',
      toolMode: 'none',
      context,
    })
    expect(response.status).toBe(400)
    expect(response.data).toMatchObject({ code: detail, contextMemoryCleared: false })
  },
)
it('resolves selected Skill on each send, rejects combinations and clears removed or rejected sensitive turns', async () => {
  const api = createMockChatBackend(),
    input = {
      rawSkillMd: mockSkillText,
      version: '1.0.0',
      sourceLabel: 'mock',
      resources: [],
      requiredCapabilities: [],
    }
  const p = (await api.handle('POST', '/skills/preview', input)).data as SkillSnapshot
  await api.handle('POST', '/skills', { input, expectedDigest: p.digest, confirmed: true })
  await api.handle('POST', '/skills/mock-review/versions/1.0.0/activation', {
    enabled: true,
    stateRevision: 1,
  })
  const c = (await api.handle('POST', '/ai/conversations')).data as { conversationId: string }
  const route = `/ai/conversations/${c.conversationId}/messages`,
    skillRef = { id: p.id, version: p.version, digest: p.digest, stateRevision: 2 }
  const send = await api.handle('POST', route, {
    message: 'question',
    toolMode: 'none',
    context: { mode: 'chat', skillRef, skillResourcePaths: [] },
  })
  expect(send.status).toBe(200)
  expect(send.data).toMatchObject({
    skillContext: { skillRef, instructions: p.instructions, resources: [] },
    contextMemoryCleared: true,
    toolEvents: [],
  })
  for (const context of [
    { mode: 'chat', skillRef, knowledgeExpertRef: { id: 'mock-knowledge-expert', revision: 1 } },
    { mode: 'code', skillRef },
    {
      mode: 'chat',
      skillRef,
      taskRef: { projectId: 'p', taskId: '00000000-0000-0000-0000-000000000001', revision: 1 },
    },
  ]) {
    const result = await api.handle('POST', route, {
      message: 'question',
      toolMode: 'none',
      context,
    })
    expect(result.status).toBe(400)
    expect(result.data).toMatchObject({
      code: 'SKILL_CONTEXT_MODE_UNSUPPORTED',
      contextMemoryCleared: true,
    })
  }
  expect(
    (
      await api.handle('POST', route, {
        message: 'question',
        toolMode: 'git_status',
        context: { skillRef },
      })
    ).data,
  ).toMatchObject({ code: 'SKILL_CONTEXT_MODE_UNSUPPORTED', contextMemoryCleared: true })
  await api.handle('POST', '/skills/mock-review/versions/1.0.0/activation', {
    enabled: false,
    stateRevision: 2,
  })
  expect(
    (
      await api.handle('POST', route, {
        message: 'question',
        toolMode: 'none',
        context: { skillRef },
      })
    ).data,
  ).toMatchObject({ code: 'SKILL_REF_STALE', contextMemoryCleared: true })
  expect((await api.handle('POST', route, { message: '', toolMode: 'none' })).data).toMatchObject({
    contextMemoryCleared: true,
  })
  expect(
    (await api.handle('POST', route, { message: 'plain', toolMode: 'none' })).data,
  ).toMatchObject({ skillContext: null, contextMemoryCleared: true })
  expect(
    (
      await api.handle('POST', route, {
        message: 'plain',
        toolMode: 'none',
        context: { skillRef: null },
      })
    ).data,
  ).toMatchObject({ code: 'INVALID_SKILL_REF', contextMemoryCleared: true })
})
