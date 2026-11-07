import { expect, it } from 'vite-plus/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createMockChatBackend } from '../../mock/chatBackend'
import type {
  AiConversation,
  AiMessageResult,
  AiStatus,
  ModelConnectionList,
} from '@eap/runtime-client'

it('refuses task-bound generation instead of simulating durable PREBOUND evidence', async () => {
  const api = createMockChatBackend()
  const conversation = (await api.handle('POST', '/ai/conversations')).data as AiConversation
  const reply = await api.handle(
    'POST',
    '/ai/conversations/' + conversation.conversationId + '/messages',
    {
      message: 'Bound task',
      context: {
        mode: 'code',
        taskRef: { projectId: 'p', taskId: '12345678-1234-1234-1234-123456789abc', revision: 1 },
      },
    },
  )
  expect(reply).toMatchObject({ status: 409, data: { detail: 'MOCK_TASK_BINDING_UNAVAILABLE' } })
})

it('serves the chat contract and model whitelist without an external backend', async () => {
  const api = createMockChatBackend()
  const list = (await api.handle('GET', '/ai/connections')).data as ModelConnectionList
  expect(list.items[0]?.models).toHaveLength(2)
  const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../../..')
  const status = (await api.handle('GET', '/ai/status')).data as AiStatus
  expect(status.workspaceLabel).toBe('ws-mock-local')
  expect(status.workspacePath).toBe(repoRoot)
  expect(status.authorizedRootPath).toBe('')
  expect(status.authorizedRootDenial).toBe('AUTHORIZED_ROOT_MISSING')
  expect(status.storesUserDirectoryGrants).toBe(false)
  const baseline = (
    await api.handle(
      'GET',
      '/ai/workspace/baseline?path=frontend/apps/web/src/features/chat/TaskComposer.vue',
    )
  ).data as { denial: string }
  expect(baseline.denial).toBe('AUTHORIZED_ROOT_MISSING')
  const source = (
    await api.handle(
      'GET',
      '/ai/workspace/source?path=frontend/apps/web/src/features/chat/TaskComposer.vue',
    )
  ).data as { exists: boolean; excerpt: string; denial: string }
  expect(source.exists).toBe(true)
  expect(source.excerpt).toContain('mock excerpt')
  expect(source.denial).toBe('')
  const dirty = (await api.handle('GET', '/ai/workspace/dirty')).data as {
    requested: boolean
    denial: string
    count: number
  }
  expect(dirty.requested).toBe(false)
  expect(dirty.denial).toBe('AUTHORIZED_ROOT_MISSING')
  expect(dirty.count).toBe(0)
  const probe = (await api.handle('POST', '/ai/workspace/verification/probe')).data as {
    requested: boolean
    denial: string
    name: string
  }
  expect(probe.requested).toBe(false)
  expect(probe.denial).toBe('AUTHORIZED_ROOT_MISSING')
  expect(probe.name).toBe('')
  const conversation = (await api.handle('POST', '/ai/conversations')).data as AiConversation
  expect(conversation.workspaceLabel).toBe('ws-mock-local')
  const conversationPath = '/ai/conversations/' + conversation.conversationId
  expect(
    (
      await api.handle('POST', conversationPath + '/connection', {
        connectionId: 'mock-local',
        model: 'not-allowed',
      })
    ).status,
  ).toBe(403)
  const switched = await api.handle('POST', conversationPath + '/connection', {
    connectionId: 'mock-local',
    model: 'general-demo',
    confirmTargetChange: true,
  })
  expect(switched.status).toBe(200)
  expect((switched.data as { memoryCleared: boolean }).memoryCleared).toBe(true)
  expect(
    (
      await api.handle('POST', conversationPath + '/connection', {
        connectionId: 'mock-local',
        model: 'general-demo',
      })
    ).data,
  ).toMatchObject({ memoryCleared: false })
  expect(((await api.handle('GET', conversationPath)).data as AiConversation).model).toBe(
    'general-demo',
  )
  const response = (
    await api.handle('POST', conversationPath + '/messages', {
      message: 'Generate a candidate',
      context: { mode: 'code', approval: 'review' },
    })
  ).data as AiMessageResult
  expect(response.proposal?.conversationId).toBe(conversation.conversationId)
  expect(response.proposal?.files[0]?.baseHash).toBe('')
  const apply = conversationPath + '/proposals/' + response.proposal!.id + '/apply'
  expect((await api.handle('POST', apply)).status).toBe(403)
  expect((await api.handle('POST', apply, { confirmed: true })).status).toBe(409)
  const readOnly = (
    await api.handle('POST', conversationPath + '/messages', {
      message: 'Read only',
      context: { mode: 'code', approval: 'read_only' },
    })
  ).data as AiMessageResult
  expect(readOnly.proposal).toBeNull()
  expect(readOnly.contextBudget?.metering).toBe('CHAR_ESTIMATE')
  expect(readOnly.contextBudget?.usedChars).toBeGreaterThan(0)
  const exceeded = await api.handle('POST', conversationPath + '/messages', {
    message: '预算超限验收',
  })
  expect(exceeded.status).toBe(400)
  expect(exceeded.data).toMatchObject({
    detail: 'CONTEXT_BUDGET_EXCEEDED',
    contextBudget: { remainingChars: 0, metering: 'CHAR_ESTIMATE' },
  })
  const historyNotMetered = (
    await api.handle('POST', conversationPath + '/messages', {
      message: '历史未计量验收',
    })
  ).data as AiMessageResult
  expect(historyNotMetered.contextBudget?.metering).toBe('UNKNOWN')
  expect(historyNotMetered.contextBudget?.notes).toContain('CHAT_MEMORY_NOT_METERED')
  expect(
    historyNotMetered.contextBudget?.sources.some(
      (source) => source.source === 'history' && source.metering === 'UNKNOWN',
    ),
  ).toBe(true)
  const derivedCleared = (
    await api.handle('POST', conversationPath + '/messages', {
      message: '派生清空验收',
    })
  ).data as AiMessageResult
  expect(derivedCleared.contextMemoryCleared).toBe(true)
  expect(derivedCleared.contextBudget?.notes).toContain('DERIVED_CLEARED_BEFORE_SEND')
  await api.handle('PUT', conversationPath + '/working-memory', {
    goal: '记忆失效前目标',
    constraints: ['示例约束：复用现有组件'],
  })
  const invalidated = await api.handle('POST', conversationPath + '/messages', {
    message: '记忆失效验收',
  })
  expect(invalidated.status).toBe(200)
  const afterInvalidate = (await api.handle('GET', conversationPath)).data as AiConversation
  expect(afterInvalidate.workingMemory?.invalidation).toBe('DEPENDENCY_CHANGED')
  expect(afterInvalidate.workingMemory?.goal).toBe('')
  expect(afterInvalidate.workingMemory?.constraints).toEqual([])
  await api.handle('DELETE', conversationPath)
  expect((await api.handle('GET', conversationPath)).status).toBe(404)
  expect((await api.handle('POST', '/unknown')).status).toBe(404)
})
