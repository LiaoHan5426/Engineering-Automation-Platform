import { describe, expect, it } from 'vite-plus/test'
import {
  createChatSession as createSession,
  type ChatApi,
} from '../../../src/features/chat/chatSession'
import type {
  AiMessageResult,
  AiStatus,
  ContextBudgetObservation,
  ChatGraph,
  ChatGraphOperation,
} from '@eap/runtime-client'

type SessionApiFixture = Partial<ChatApi>
// Explicit canonical readback fixture for these API-isolated session regressions.
// It supplies graph nodes/operation associations; local storage never supplies turns.
const graphFixtures = new WeakMap<SessionApiFixture, ChatApi>()
function createChatSession(
  fixture: SessionApiFixture,
  storage?: Pick<Storage, 'getItem' | 'setItem'>,
) {
  let api = graphFixtures.get(fixture)
  if (!api) {
    const graphs = new Map<string, ChatGraph>()
    const operations = new Map<string, ChatGraphOperation>()
    const conversations = new Map<string, Awaited<ReturnType<ChatApi['openAiConversation']>>>()
    const graph = (id: string) => {
      if (!graphs.has(id))
        graphs.set(id, { conversationId: id, revision: 0, nodes: [], operations: [] })
      return graphs.get(id)!
    }
    api = {
      aiStatus: async () => status(),
      cancelAiExecution: async (_id, executionId) => ({ cancelled: false, executionId }),
      ...fixture,
      openAiConversation: async () => {
        const conversation = await fixture.openAiConversation!()
        conversations.set(conversation.conversationId, conversation)
        return conversation
      },
      aiConversation:
        fixture.aiConversation ??
        (async (id) => {
          const conversation = conversations.get(id)
          if (!conversation) throw { response: { status: 404 } }
          return structuredClone(conversation)
        }),
      chatGraph: async (id) => structuredClone(graph(id)),
      chatOperation: async (id, operationId) => {
        const operation = operations.get(id + ':' + operationId)
        if (!operation) throw { response: { status: 404 } }
        return structuredClone(operation)
      },
      sendAiMessage: async (id, request, options) => {
        const state = graph(id)
        expect(request.expectedRevision).toBe(state.revision)
        expect(request.operationId).toBeTruthy()
        let operation: ChatGraphOperation | undefined
        const publish = (executionId: string, response: AiMessageResult | null = null) => {
          if (!operation) {
            const userMessageId = request.operationId + '-user'
            const assistantMessageId = request.operationId + '-assistant'
            operation = {
              operationId: request.operationId,
              userMessageId,
              assistantMessageId,
              executionId,
              graphRevision: ++state.revision,
              status: 'RUNNING',
              response: null,
            }
            operations.set(id + ':' + request.operationId, operation)
            const { status: _status, response: _response, ...binding } = operation
            state.operations.push(binding)
            state.nodes.push(
              {
                id: userMessageId,
                parentId: request.parentMessageId,
                role: 'user',
                content: request.message,
                executionId: null,
                operationId: request.operationId,
                status: 'SUCCEEDED',
                response: null,
              },
              {
                id: assistantMessageId,
                parentId: userMessageId,
                role: 'assistant',
                content: '',
                executionId,
                operationId: request.operationId,
                status: 'RUNNING',
                response: null,
              },
            )
          }
          if (response) {
            operation.executionId = response.executionId
            operation.status = response.status
            operation.response = response
            const node = state.nodes.find((item) => item.id === operation!.assistantMessageId)!
            Object.assign(node, {
              executionId: response.executionId,
              status: response.status,
              response,
              content: response.answer || node.content,
            })
          }
        }
        const response = await fixture.sendAiMessage!(id, request, {
          ...options,
          onEvent(event) {
            if (event.conversationId === id) {
              publish(event.executionId)
              const node = state.nodes.find((item) => item.id === operation!.assistantMessageId)!
              if (event.executionId === operation!.executionId) {
                if (event.type === 'answer.delta') node.content += event.text
                if (event.status) node.status = event.status
                if (event.type === 'error')
                  publish(
                    event.executionId,
                    result({
                      executionId: event.executionId,
                      status: event.status,
                      error: event.code,
                      answer: node.content,
                    }),
                  )
              }
            }
            options?.onEvent?.(event)
          },
        })
        publish(response.executionId, response)
        return response
      },
    }
    graphFixtures.set(fixture, api)
  }
  return createSession(api, storage)
}

function status(state: AiStatus['state'] = 'disabled'): AiStatus {
  return {
    state,
    provider: 'none',
    model: '',
    configurationRevision: 'rev',
    lastObservedAt: null,
    errorCode: '',
    tools: { git_status: false },
    workspaceLabel: 'ws-abc',
  }
}

function result(partial: Partial<AiMessageResult> = {}): AiMessageResult {
  return {
    executionId: 'exec-1',
    answer: 'real',
    error: '',
    status: 'SUCCEEDED',
    approval: 'NOT_REQUIRED',
    verification: 'UNVERIFIED',
    toolEvents: [],
    artifactError: '',
    artifacts: [],
    ...partial,
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

describe('chat session', () => {
  it.each(['SUCCEEDED', 'CANCELLED'] as const)(
    'retains streamed plan through final reconstruction (%s) and rejects foreign events before sequence',
    async (finalStatus) => {
      const id = '11111111-1111-4111-8111-111111111111'
      const executionId = '22222222-2222-4222-8222-222222222222'
      const snapshot: import('@eap/runtime-client').ChatPlanSnapshot = {
        schemaVersion: 1,
        planId: '33333333-3333-4333-8333-333333333333',
        conversationId: id,
        executionId,
        revision: 1,
        updatedAt: '2026-11-14T12:00:00Z',
        items: [
          { id: '44444444-4444-4444-8444-444444444444', content: 'Review', status: 'in_progress' },
        ],
      }
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({ conversationId: id, workspaceLabel: '', memory: '' }),
        chatPlan: async () => snapshot,
        sendAiMessage: async (_id, _request, options) => {
          const event = {
            type: 'plan.updated',
            text: '',
            status: 'RUNNING',
            code: '',
            executionId,
            conversationId: id,
            sequence: 1,
            payload: snapshot,
          }
          options?.onEvent?.({ ...event, conversationId: executionId, sequence: 999 })
          options?.onEvent?.(event)
          options?.onEvent?.({ ...event, executionId: id, sequence: 998 })
          options?.onEvent?.({ ...event, type: 'answer.delta', text: 'answer', sequence: 2 })
          return result({ executionId, status: finalStatus })
        },
      })
      await session.openConversation()
      session.draft.value = 'hello'
      await session.send()
      expect(session.turns.value[1]).toMatchObject({
        executionId,
        status: finalStatus,
        plan: { snapshot },
      })
      expect(session.turns.value[1]?.plan?.snapshot?.items[0]?.status).toBe('in_progress')
    },
  )
  it.each([false, true])(
    'accepts saved connection settings without extra reads, selection changes or stale overwrite (stale failure=%s)',
    async (staleFailure) => {
      const connection = {
        id: 'saved',
        name: 'Saved connection',
        kind: 'openai-compatible' as const,
        enabled: true,
        baseUrl: 'https://127.0.0.1:9/v1',
        defaultModel: 'saved-model',
        models: [{ id: 'saved-model', reasoningEfforts: [] }],
        allowedModels: ['saved-model'],
        discoveredAt: '',
        discoveryError: '',
        secretPresent: true,
        revision: 1,
        defaultSelected: true,
        configurationRevision: 'r1',
      }
      let requests = 0
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
        sendAiMessage: async () => result(),
        modelConnections: async () => {
          requests += 1
          return { items: [{ ...connection }], effectiveDefaultId: 'saved' }
        },
      })
      session.draft.value = 'Keep this draft'
      session.applyConnectionDirectory([{ ...connection }])
      expect(requests).toBe(0)
      expect(session.connections.value[0]?.name).toBe('Saved connection')
      expect(session.conversationId.value).toBeNull()
      expect(session.pendingConnectionId.value).toBeNull()
      expect(session.boundConnectionId.value).toBeNull()
      expect(session.pendingModel.value).toBe('')
      expect(session.draft.value).toBe('Keep this draft')
      // Startup retains its intentional default selection through the same loader.
      await session.refreshConnections()
      expect(requests).toBe(1)
      expect(session.pendingConnectionId.value).toBe('saved')
      session.pendingModel.value = 'keep-pending-model'
      connection.name = 'Edited connection'
      session.applyConnectionDirectory([{ ...connection }])
      expect(requests).toBe(1)
      expect(session.connections.value[0]?.name).toBe('Edited connection')
      expect(session.pendingConnectionId.value).toBe('saved')
      expect(session.pendingModel.value).toBe('keep-pending-model')
      expect(session.draft.value).toBe('Keep this draft')
      const stale = deferred<Awaited<ReturnType<NonNullable<ChatApi['modelConnections']>>>>()
      const concurrent = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
        sendAiMessage: async () => result(),
        modelConnections: () => stale.promise,
      })
      const oldRead = concurrent.refreshConnections()
      concurrent.applyConnectionDirectory([{ ...connection, name: 'Accepted editor readback' }])
      if (staleFailure) stale.reject(new Error('Obsolete catalog failure'))
      else
        stale.resolve({
          items: [{ ...connection, name: 'Stale catalog' }],
          effectiveDefaultId: 'saved',
        })
      await oldRead
      expect(concurrent.connections.value[0]?.name).toBe('Accepted editor readback')
      expect(concurrent.pendingConnectionId.value).toBeNull()
      expect(concurrent.pendingModel.value).toBe('')
    },
  )
  it('sends explicit planning without tools and preserves the selected implementation settings', async () => {
    let sent: unknown[] = []
    const session = createChatSession({
      openAiConversation: async () => ({
        conversationId: 'plan',
        workspaceLabel: 'ws',
        memory: '',
      }),
      sendAiMessage: async (...args) => {
        sent = args
        return result({ answer: 'Read-only plan' })
      },
    })
    await session.openConversation()
    session.context.value.mode = 'code'
    session.toolMode.value = 'git_status'
    session.draft.value = 'Plan the page'
    await session.send({ ...session.context.value, mode: 'plan' })
    expect(sent[1]).toMatchObject({
      toolMode: 'none',
      context: { mode: 'plan' },
      kind: 'send',
      expectedRevision: 0,
      parentMessageId: null,
      targetMessageId: null,
    })
    expect(session.context.value.mode).toBe('code')
    expect(session.toolMode.value).toBe('git_status')
    expect(session.turns.value.at(-1)?.text).toBe('Read-only plan')
  })
  it.each(['code', 'knowledge', 'tool', 'task'])(
    'blocks incompatible Skill %s without sending or mutating its draft',
    async (mode) => {
      let called = false
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({
          conversationId: 'guard',
          workspaceLabel: '',
          memory: '',
        }),
        sendAiMessage: async () => {
          called = true
          return result()
        },
      })
      await session.openConversation()
      session.draft.value = 'retain'
      session.context.value.skillRef = {
        id: 'guide',
        version: '1.0.0',
        digest: 'a'.repeat(64),
        stateRevision: 2,
      }
      if (mode === 'code') session.context.value.mode = 'code'
      if (mode === 'knowledge')
        session.context.value.knowledgeExpertRef = { id: 'expert', revision: 1 }
      if (mode === 'tool') session.toolMode.value = 'git_status'
      if (mode === 'task')
        session.context.value.taskRef = {
          projectId: 'p',
          taskId: '00000000-0000-0000-0000-000000000001',
          revision: 1,
        }
      await session.send()
      expect(called).toBe(false)
      expect(session.failure.value).toBe('skill-unavailable')
      expect(session.draft.value).toBe('retain')
      expect(session.context.value.skillRef?.version).toBe('1.0.0')
    },
  )
  it.each([false, true])(
    'records Skill context clearing without leaking a late turn into another conversation (rejected=%s)',
    async (rejected) => {
      let resolve!: (value: AiMessageResult) => void,
        reject!: (error: unknown) => void,
        sequence = 0
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({
          conversationId: `s${++sequence}`,
          workspaceLabel: '',
          memory: '',
        }),
        sendAiMessage: () =>
          new Promise<AiMessageResult>((ok, fail) => {
            resolve = ok
            reject = fail
          }),
      })
      await session.openConversation()
      session.draft.value = 'retain'
      const skillRef = { id: 'guide', version: '1.0.0', digest: 'a'.repeat(64), stateRevision: 2 }
      session.context.value.skillRef = skillRef
      const pending = session.send()
      await session.openConversation()
      session.draft.value = 'other'
      const evidence = { skillRef, instructions: 'prepared only', resources: [], dependencies: [] }
      if (rejected)
        reject({
          response: {
            status: 404,
            data: { code: 'SKILL_NOT_FOUND', contextMemoryCleared: true },
          },
        })
      else resolve(result({ skillContext: evidence, contextMemoryCleared: true }))
      await pending
      expect(session.contextMemoryCleared.value).toBe(false)
      expect(session.draft.value).toBe('other')
      expect(session.turns.value).toEqual([])
      await session.selectConversation('s1')
      expect(session.contextMemoryCleared.value).toBe(true)
      expect(session.expired.value).toBe(false)
      if (rejected) {
        expect(session.draft.value).toBe('retain')
        expect(session.turns.value).toEqual([])
      } else
        expect(session.turns.value[1]).toMatchObject({
          skillContext: evidence,
          contextMemoryCleared: true,
        })
    },
  )
  it.each([false, true])(
    'records rejected-request memory clearing only for its conversation (switched=%s)',
    async (switched) => {
      let reject!: (reason: unknown) => void
      let sequence = 0
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({
          conversationId: `c${++sequence}`,
          workspaceLabel: '',
          memory: '',
        }),
        sendAiMessage: () =>
          new Promise<AiMessageResult>((_resolve, fail) => {
            reject = fail
          }),
      })
      await session.openConversation()
      session.draft.value = 'keep draft'
      session.context.value.knowledgeExpertRef = { id: 'saved', revision: 4 }
      const pending = session.send()
      if (switched) {
        await session.openConversation()
        session.draft.value = 'other draft'
      }
      reject({
        response: {
          status: 409,
          data: { code: 'EXPERT_CONTEXT_STALE', knowledgeMemoryCleared: true },
        },
      })
      await pending
      if (switched) {
        expect(session.knowledgeMemoryCleared.value).toBe(false)
        expect(session.draft.value).toBe('other draft')
        expect(session.failure.value).toBe('')
        await session.selectConversation('c1')
      } else expect(session.failure.value).toBe('knowledge-failed')
      expect(session.knowledgeMemoryCleared.value).toBe(true)
      expect(session.turns.value).toEqual([])
      expect(session.expired.value).toBe(false)
      expect(session.pendingConnectionId.value).toBeNull()
      expect(session.draft.value).toBe('keep draft')
      expect(session.context.value.knowledgeExpertRef).toEqual({ id: 'saved', revision: 4 })
    },
  )
  it.each([400, 403, 404, 409, 503])(
    'classifies INVALID_EXPERT_CONTEXT before transport recovery (%s)',
    async (http) => {
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
        sendAiMessage: async () => {
          throw { response: { status: http, data: { code: 'INVALID_EXPERT_CONTEXT' } } }
        },
      })
      await session.openConversation()
      session.draft.value = 'keep draft'
      session.context.value.knowledgeExpertRef = { id: 'saved', revision: 4 }
      await session.send()
      expect(session.failure.value).toBe('knowledge-failed')
      expect(session.expired.value).toBe(false)
      expect(session.pendingConnectionId.value).toBeNull()
      expect(session.turns.value).toEqual([])
      expect(session.draft.value).toBe('keep draft')
      expect(session.context.value.knowledgeExpertRef).toEqual({ id: 'saved', revision: 4 })
    },
  )
  it.each([404, 409, 403, 503])(
    'treats EXPERT_CONTEXT errors as knowledge failures, not model/expiry (%s)',
    async (http) => {
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
        sendAiMessage: async () => {
          throw { response: { status: http, data: { code: 'EXPERT_CONTEXT_UNAVAILABLE' } } }
        },
      })
      await session.openConversation()
      session.draft.value = 'keep draft'
      session.context.value.knowledgeExpertRef = { id: 'saved', revision: 4 }
      await session.send()
      expect(session.failure.value).toBe('knowledge-failed')
      expect(session.expired.value).toBe(false)
      expect(session.pendingConnectionId.value).toBeNull()
      expect(session.draft.value).toBe('keep draft')
      expect(session.context.value.knowledgeExpertRef).toEqual({ id: 'saved', revision: 4 })
    },
  )
  it('preserves returned resource evidence and safety clearing on the assistant turn and canonical graph reload', async () => {
    const evidence = {
      expertRef: { id: 'saved', revision: 4 },
      status: 'no_matches' as const,
      references: [],
    }
    let saved = ''
    const storage = {
      getItem: () => saved || null,
      setItem: (_key: string, value: string) => {
        saved = value
      },
    }
    const api = {
      aiStatus: async () => status(),
      openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
      sendAiMessage: async () =>
        result({ knowledgeContext: evidence, knowledgeMemoryCleared: true }),
    }
    const session = createChatSession(api, storage)
    await session.openConversation()
    session.draft.value = 'question'
    await session.send()
    expect(session.turns.value[1]).toMatchObject({
      knowledgeContext: evidence,
      knowledgeMemoryCleared: true,
    })
    session.flushPersistence()
    expect(JSON.parse(saved).transcripts).toBeUndefined()
    const replay = createChatSession(api, storage)
    await replay.restoreLastConversation()
    expect(replay.turns.value[1]).toMatchObject({
      knowledgeContext: evidence,
      knowledgeMemoryCleared: true,
    })
  })
  it.each([
    [409, 'CODE_GENERATION_BASELINE_CHANGED', 'generation-stale'],
    [400, 'CODE_GENERATION_TARGET_REQUIRED', 'generation-blocked'],
    [400, 'CODE_GENERATION_SCOPE_MISMATCH', 'generation-blocked'],
    [503, 'CODE_GENERATION_CONTEXT_UNAVAILABLE', 'generation-unavailable'],
    [400, 'CODE_PROPOSAL_TOO_LARGE', 'generation-too-large'],
    [409, 'BOARD_REVISION_CONFLICT', 'generation-task-stale'],
    [409, 'CODE_TASK_PROTOTYPE_MISMATCH', 'generation-task-stale'],
    [409, 'CODE_TASK_SNAPSHOT_CHANGED', 'generation-task-stale'],
    [409, 'CODE_WORKSPACE_BUSY', 'generation-task-blocked'],
    [409, 'BOARD_EXECUTION_ACTIVE', 'generation-task-blocked'],
    [409, 'BOARD_PREPARATION_REQUIRED', 'generation-task-blocked'],
    [404, 'BOARD_TASK_NOT_FOUND', 'generation-task-stale'],
  ])(
    'keeps the draft and distinguishes source preparation failure %s %s from a model switch',
    async (http, code, expected) => {
      const api: SessionApiFixture = {
        aiStatus: async () => status('configured_unverified'),
        openAiConversation: async () => ({
          conversationId: 'c1',
          workspaceLabel: 'ws-abc',
          memory: 'memory',
        }),
        sendAiMessage: async () => {
          throw {
            response: { status: http, data: { code, detail: 'Localized preparation failure' } },
          }
        },
      }
      const session = createChatSession(api)
      await session.openConversation()
      session.context.value.mode = 'code'
      session.context.value.targetPath = 'frontend/App.vue'
      session.draft.value = 'Keep my source edits'
      session.context.value.taskRef = {
        projectId: 'p',
        taskId: '12345678-1234-1234-1234-123456789abc',
        revision: 2,
      }
      await session.send()
      expect(session.failure.value).toBe(expected)
      expect(session.draft.value).toBe('Keep my source edits')
      expect(session.turns.value).toEqual([])
      expect(session.pendingConnectionId.value).toBeNull()
      expect(session.expired.value).toBe(false)
      expect(session.context.value.taskRef?.revision).toBe(2)
    },
  )
  it('keeps an oversized code response as an explicit failure without a partial candidate', async () => {
    const api: SessionApiFixture = {
      aiStatus: async () => status('configured_unverified'),
      openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: 'ws', memory: '' }),
      sendAiMessage: async () =>
        result({ error: 'CODE_PROPOSAL_TOO_LARGE', status: 'FAILED', answer: '', proposal: null }),
    }
    const session = createChatSession(api)
    await session.openConversation()
    session.draft.value = 'Keep draft'
    await session.send()
    expect(session.failure.value).toBe('generation-too-large')
    expect(session.draft.value).toBe('Keep draft')
    expect(session.turns.value.at(-1)?.proposal).toBeNull()
  })
  it('loads status without sending a message', async () => {
    let sent = 0
    const api: SessionApiFixture = {
      aiStatus: async () => status('configured_unverified'),
      openAiConversation: async () => {
        throw new Error('no')
      },
      sendAiMessage: async () => {
        sent += 1
        return result()
      },
    }
    const session = createChatSession(api)
    await session.refreshStatus()
    expect(session.phase.value).toBe('ready')
    expect(session.status.value?.state).toBe('configured_unverified')
    expect(sent).toBe(0)
    expect(session.turns.value).toEqual([])
  })

  it('blocks a second send and keeps a failed draft', async () => {
    const pending = deferred<AiMessageResult>()
    let sent = 0
    const api: SessionApiFixture = {
      aiStatus: async () => status(),
      openAiConversation: async () => ({
        conversationId: 'c1',
        workspaceLabel: 'ws-abc',
        memory: 'memory',
      }),
      sendAiMessage: async () => {
        sent += 1
        return pending.promise
      },
    }
    const session = createChatSession(api)
    await session.openConversation()
    session.draft.value = 'hello'
    const first = session.send()
    session.draft.value = 'hello'
    await session.send()
    expect(sent).toBe(1)
    pending.resolve(result({ error: 'TOOL_PERMISSION_DENIED', answer: 'denied' }))
    await first
    expect(session.draft.value).toBe('hello')
    expect(session.failure.value).toBe('kept')
    expect(session.turns.value.some((turn) => turn.text === 'denied')).toBe(true)
  })

  it('writes a late response only to the conversation that sent it', async () => {
    const pending = deferred<AiMessageResult>()
    const api: SessionApiFixture = {
      aiStatus: async () => status(),
      openAiConversation: async () => ({
        conversationId: session.conversationId.value ? 'c2' : 'c1',
        workspaceLabel: 'ws-abc',
        memory: 'memory',
      }),
      sendAiMessage: async () => pending.promise,
    }
    const session = createChatSession(api)
    await session.openConversation()
    session.draft.value = 'first'
    const first = session.send()
    await session.openConversation()
    session.draft.value = 'second draft'
    pending.resolve(result({ answer: 'from-c1' }))
    await first
    expect(session.conversationId.value).toBe('c2')
    expect(session.draft.value).toBe('second draft')
    expect(session.transcripts.value.c1?.some((turn) => turn.text === 'from-c1')).toBe(true)
    expect(session.transcripts.value.c2 ?? []).toEqual([])
  })

  it('does not show a simulated answer when the model is not configured', async () => {
    const api: SessionApiFixture = {
      aiStatus: async () => status('disabled'),
      openAiConversation: async () => ({
        conversationId: 'c1',
        workspaceLabel: 'ws-abc',
        memory: 'memory',
      }),
      sendAiMessage: async () => {
        throw { response: { status: 503, data: { code: 'AI_NOT_CONFIGURED' } } }
      },
    }
    const session = createChatSession(api)
    await session.refreshStatus()
    await session.openConversation()
    session.draft.value = 'hello'
    await session.send()
    expect(session.failure.value).toBe('not-configured')
    expect(session.draft.value).toBe('hello')
    expect(session.turns.value).toEqual([])
    expect(JSON.stringify(session.transcripts.value)).not.toContain('模拟')
  })

  it('clears the failed send once the same draft succeeds', async () => {
    let calls = 0
    const api: SessionApiFixture = {
      aiStatus: async () => status('configured_unverified'),
      openAiConversation: async () => ({
        conversationId: 'c1',
        workspaceLabel: 'ws-abc',
        memory: 'memory',
      }),
      sendAiMessage: async () => {
        calls += 1
        if (calls === 1) throw { response: { status: 400 } }
        return result({ answer: 'retried' })
      },
    }
    const session = createChatSession(api)
    await session.refreshStatus()
    await session.openConversation()
    session.draft.value = 'hello'
    await session.send()
    expect(session.failure.value).toBe('failed')
    expect(session.draft.value).toBe('hello')
    await session.send()
    expect(session.failure.value).toBe('')
    expect(session.draft.value).toBe('')
    expect(session.turns.value.map((turn) => turn.text)).toEqual(['hello', 'retried'])
  })

  it('keeps a lost response pending and blocks duplicate sends until operation readback', async () => {
    let calls = 0
    const session = createChatSession({
      openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
      sendAiMessage: async (_id, _request, options) => {
        calls++
        options?.onEvent?.({
          type: 'answer.delta',
          text: 'partial',
          status: 'RUNNING',
          code: '',
          conversationId: 'c1',
          executionId: 'exec-partial',
          sequence: 1,
        })
        throw { response: { status: 502, data: { code: 'AI_RESPONSE_INCOMPLETE' } } }
      },
    })
    await session.openConversation()
    session.draft.value = 'hello'
    await session.send()
    expect(session.failure.value).toBe('response-uncertain')
    expect(session.draft.value).toBe('hello')
    expect(session.turns.value[1]).toMatchObject({
      text: 'partial',
      status: 'RUNNING',
      executionId: 'exec-partial',
    })
    await session.send()
    expect(calls).toBe(1)
    await session.recoverOperation()
    expect(session.pendingOperations.value).toEqual({})
    // The canonical RUNNING graph still interlocks another execution.
    await session.send()
    expect(calls).toBe(1)
    expect(session.draft.value).toBe('hello')
  })

  it.each(['FAILED', 'UNKNOWN', 'RUNNING'])(
    'retains streamed output and the draft when the final result is %s without an error code',
    async (terminalStatus) => {
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
        sendAiMessage: async (_id, _request, options) => {
          options?.onEvent?.({
            type: 'answer.delta',
            text: 'partial',
            status: 'RUNNING',
            code: '',
            executionId: 'exec-partial',
            conversationId: 'c1',
            sequence: 1,
          })
          return result({ answer: '', status: terminalStatus })
        },
      })
      await session.openConversation()
      session.draft.value = 'retain'
      await session.send()
      expect(session.turns.value[1]).toMatchObject({
        text: 'partial',
        status: terminalStatus,
      })
      expect(session.draft.value).toBe('retain')
      expect(session.failure.value).toBe('kept')
      expect(session.sending.value).toBe(false)
    },
  )

  it('accepts SUCCEEDED without promoting unknown statuses to success', async () => {
    let calls = 0
    const session = createChatSession({
      aiStatus: async () => status(),
      openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
      sendAiMessage: async () => {
        calls++
        if (calls === 1)
          throw { response: { status: 400, data: { code: 'CONTEXT_BUDGET_EXCEEDED' } } }
        return result({ answer: '模拟回答', status: 'SUCCEEDED' })
      },
    })
    await session.openConversation()
    session.draft.value = 'oversized'
    await session.send()
    expect(session.failure.value).toBe('context-budget-exceeded')
    session.draft.value = 'ordinary edited draft'
    await session.send()
    expect(session.failure.value).toBe('')
    expect(session.draft.value).toBe('')
    expect(session.turns.value[1]).toMatchObject({ text: '模拟回答', status: 'SUCCEEDED' })
  })

  it('does not promote an unconfirmed cancel acknowledgement to backend cancellation', async () => {
    const pending = deferred<AiMessageResult>()
    const accepted = deferred<void>()
    let cancelledExecution = ''
    const session = createChatSession({
      openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
      sendAiMessage: async (_id, _request, options) => {
        options?.onEvent?.({
          type: 'accepted',
          text: '',
          code: '',
          status: 'RUNNING',
          conversationId: 'c1',
          executionId: 'exec-1',
          sequence: 0,
        })
        accepted.resolve()
        return pending.promise
      },
      cancelAiExecution: async (_id, executionId) => {
        cancelledExecution = executionId
        return { cancelled: false, executionId }
      },
    })
    await session.openConversation()
    session.draft.value = 'retain'
    const sending = session.send()
    await accepted.promise
    // Let the queued accepted frame read the operation association.
    await Promise.resolve()
    await session.cancelSend()
    expect(cancelledExecution).toBe('exec-1')
    expect(session.turns.value[1]?.status).toBe('RUNNING')
    expect(session.draft.value).toBe('retain')
    pending.resolve(result({ status: 'CANCELLED', answer: '' }))
    await sending
    expect(session.turns.value[1]?.status).toBe('CANCELLED')
    expect(session.draft.value).toBe('retain')
  })

  it.each([false, true])(
    'isolates late streamed failure and budget from another conversation (rejected=%s)',
    async (rejected) => {
      const pending = deferred<AiMessageResult>()
      let serial = 0
      const budget: ContextBudgetObservation = {
        platformLimit: 96000,
        outputReserve: 16384,
        inputMaterialLimit: 64000,
        usedChars: 1200,
        materialChars: 800,
        remainingChars: 78416,
        metering: 'CHAR_ESTIMATE',
        sources: [],
        notes: [],
      }
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({
          conversationId: `c${++serial}`,
          workspaceLabel: '',
          memory: '',
        }),
        sendAiMessage: async (id, _request, options) => {
          if (id === 'c2') return result({ contextBudget: { ...budget, usedChars: 500 } })
          options?.onEvent?.({
            type: 'answer.delta',
            text: 'partial-c1',
            status: 'RUNNING',
            code: '',
            executionId: 'exec-c1',
            conversationId: 'c1',
            sequence: 1,
          })
          return pending.promise
        },
      })
      await session.openConversation()
      session.draft.value = 'first'
      const first = session.send()
      await session.openConversation()
      session.draft.value = 'second'
      await session.send()
      session.draft.value = 'new second draft'
      if (rejected)
        pending.reject({
          response: {
            status: 502,
            data: { code: 'AI_RESPONSE_INCOMPLETE', contextBudget: budget },
          },
        })
      else
        pending.resolve(
          result({
            answer: '',
            error: 'AI_PROVIDER_ERROR',
            status: 'FAILED',
            contextBudget: budget,
          }),
        )
      await first
      expect(session.lastContextBudget.value?.usedChars).toBe(500)
      expect(session.draft.value).toBe('new second draft')
      expect(session.failure.value).toBe('')
      expect(session.turns.value.map((turn) => turn.text)).toEqual(['second', 'real'])
      await session.selectConversation('c1')
      expect(session.draft.value).toBe('first')
      expect(session.turns.value[1]).toMatchObject({
        text: 'partial-c1',
        status: rejected ? 'RUNNING' : 'FAILED',
        executionId: rejected ? 'exec-c1' : 'exec-1',
      })
    },
  )

  it.each(['FAILED', 'CANCELLED', 'UNKNOWN'])(
    'retains server terminal %s evidence when the transport subsequently fails',
    async (terminalStatus) => {
      const session = createChatSession({
        aiStatus: async () => status(),
        openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
        sendAiMessage: async (_id, _request, options) => {
          options?.onEvent?.({
            type: 'error',
            text: '',
            status: terminalStatus,
            code: 'SERVER_TERMINAL',
            executionId: 'exec-1',
            conversationId: 'c1',
            sequence: 1,
          })
          throw new Error('socket closed')
        },
      })
      await session.openConversation()
      session.draft.value = 'retain'
      await session.send()
      expect(session.turns.value).toHaveLength(2)
      expect(session.turns.value[1]).toMatchObject({
        status: terminalStatus,
        error: 'SERVER_TERMINAL',
      })
      expect(session.draft.value).toBe('retain')
      expect(session.sending.value).toBe(false)
    },
  )

  it('rolls back only a rejected attempt and ignores its events after explicit retry', async () => {
    let calls = 0
    let lateEvent: NonNullable<
      NonNullable<Parameters<ChatApi['sendAiMessage']>[2]>['onEvent']
    > = () => {}
    const session = createChatSession({
      aiStatus: async () => status(),
      openAiConversation: async () => ({ conversationId: 'c1', workspaceLabel: '', memory: '' }),
      sendAiMessage: async (_id, _request, options) => {
        calls++
        if (calls === 2) {
          lateEvent = options!.onEvent!
          throw { response: { status: 400 } }
        }
        return result({ answer: calls === 1 ? 'previous answer' : 'retry answer' })
      },
    })
    await session.openConversation()
    session.draft.value = 'previous request'
    await session.send()
    session.draft.value = 'retry request'
    await session.send()
    expect(session.turns.value.map((turn) => turn.text)).toEqual([
      'previous request',
      'previous answer',
    ])
    await session.send()
    lateEvent({
      type: 'answer.delta',
      text: 'stale',
      code: '',
      status: 'RUNNING',
      executionId: 'stale',
      sequence: 1,
    })
    expect(session.turns.value.map((turn) => turn.text)).toEqual([
      'previous request',
      'previous answer',
      'retry request',
      'retry answer',
    ])
    expect(calls).toBe(3)
  })

  it('holds the old conversation until a target change is confirmed', async () => {
    let sent = 0
    let confirmed = 0
    const api: SessionApiFixture = {
      aiStatus: async () => status('configured_unverified'),
      openAiConversation: async () => ({
        conversationId: 'c1',
        workspaceLabel: 'ws-abc',
        memory: 'memory',
        connectionId: 'old',
      }),
      sendAiMessage: async () => {
        sent += 1
        return result()
      },
      modelConnections: async () => ({
        items: [
          {
            id: 'old',
            name: '旧连接',
            kind: 'openai-compatible',
            enabled: true,
            baseUrl: 'https://127.0.0.1:9/v1',
            defaultModel: 'old-model',
            models: [{ id: 'old-model', reasoningEfforts: [] }],
            allowedModels: ['old-model'],
            discoveredAt: '',
            discoveryError: '',
            secretPresent: true,
            revision: 1,
            defaultSelected: true,

            configurationRevision: 'a',
          },
          {
            id: 'next',
            name: '新连接',
            kind: 'openai-compatible',
            enabled: true,
            baseUrl: 'https://127.0.0.1:10/v1',
            defaultModel: 'next-model',
            models: [{ id: 'next-model', reasoningEfforts: [] }],
            allowedModels: ['next-model'],
            discoveredAt: '',
            discoveryError: '',
            secretPresent: true,
            revision: 2,
            defaultSelected: false,

            configurationRevision: 'b',
          },
        ],
        effectiveDefaultId: 'old',
      }),
      assignConversationConnection: async () => {
        confirmed += 1
        return {
          connectionId: 'next',
          memoryCleared: true,
          connectionName: '新连接',
          model: 'next-model',
        }
      },
    }
    const session = createChatSession(api)
    await session.openConversation()
    await session.refreshConnections()
    session.chooseConversationConnection('next', 'next-model')
    session.draft.value = 'stay here'
    await session.send()
    expect(sent).toBe(0)
    expect(confirmed).toBe(0)
    expect(session.pendingConnectionId.value).toBe('next')
    expect(session.targetNotice.value).toContain('新连接')
    await session.confirmConnectionChange()
    expect(confirmed).toBe(1)
    expect(session.boundConnectionId.value).toBe('next')
    expect(session.targetNotice.value).toBe('cleared')
    await session.send()
    expect(sent).toBe(1)
  })

  it('says when a confirmed switch keeps server memory', async () => {
    const api: SessionApiFixture = {
      aiStatus: async () => status('configured_unverified'),
      openAiConversation: async () => ({
        conversationId: 'c1',
        workspaceLabel: 'ws',
        memory: 'memory',
        connectionId: 'old',
        model: 'same-model',
      }),
      modelConnections: async () => ({
        effectiveDefaultId: 'old',
        items: [
          {
            id: 'old',
            name: '旧连接',
            kind: 'openai-compatible',
            enabled: true,
            baseUrl: 'https://127.0.0.1:9/v1',
            defaultModel: 'same-model',
            models: [{ id: 'same-model', reasoningEfforts: [] }],
            allowedModels: ['same-model'],
            discoveredAt: '',
            discoveryError: '',
            secretPresent: true,
            revision: 1,
            defaultSelected: true,
            configurationRevision: 'a',
          },
          {
            id: 'next',
            name: '新连接',
            kind: 'openai-compatible',
            enabled: true,
            baseUrl: 'https://127.0.0.1:10/v1',
            defaultModel: 'same-model',
            models: [{ id: 'same-model', reasoningEfforts: [] }],
            allowedModels: ['same-model'],
            discoveredAt: '',
            discoveryError: '',
            secretPresent: true,
            revision: 1,
            defaultSelected: false,
            configurationRevision: 'b',
          },
        ],
      }),
      assignConversationConnection: async () => ({
        connectionId: 'next',
        memoryCleared: false,
        connectionName: '新连接',
        model: 'same-model',
      }),
    }
    const session = createChatSession(api)
    await session.openConversation()
    await session.refreshConnections()
    session.chooseConversationConnection('next', 'same-model')
    await session.confirmConnectionChange()
    expect(session.boundConnectionId.value).toBe('next')
    expect(session.targetNotice.value).toBe('kept')
  })
})

it('keeps independent drafts, binding and transcripts through switching, reload, archive and deletion', async () => {
  let serial = 0
  const deleted: string[] = []
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
  const api: SessionApiFixture = {
    aiStatus: async () => status(),
    openAiConversation: async () => ({
      conversationId: 'chat-' + ++serial,
      workspaceLabel: 'ws',
      memory: 'memory',
      connectionId: 'model-' + serial,
    }),
    sendAiMessage: async () => result(),
    deleteAiConversation: async (id) => {
      deleted.push(id)
    },
  }
  const session = createChatSession(api, storage)
  await session.openConversation()
  session.draft.value = 'First request'
  await session.send()
  session.draft.value = 'First draft'
  await session.openConversation()
  session.draft.value = 'Second draft'
  await session.selectConversation('chat-1')
  expect(session.draft.value).toBe('First draft')
  expect(session.boundConnectionId.value).toBe('model-1')
  expect(session.turns.value).toHaveLength(2)
  session.renameConversation('chat-1', 'Renamed')
  session.archiveConversation('chat-1', true)
  expect(session.conversationId.value).toBeNull()
  const restored = createChatSession(api, storage)
  expect(restored.history.value.find((x) => x.id === 'chat-1')?.archived).toBe(true)
  restored.archiveConversation('chat-1', false)
  await restored.selectConversation('chat-1')
  expect(restored.draft.value).toBe('First draft')
  expect(restored.history.value.find((x) => x.id === 'chat-1')?.title).toBe('Renamed')
  await restored.deleteConversation('chat-1')
  expect(deleted).toEqual(['chat-1'])
  expect(restored.transcripts.value['chat-1']).toBeUndefined()
  await restored.selectConversation('chat-2')
  expect(restored.draft.value).toBe('Second draft')
})
it('keeps expired history readable without sending or silently creating a replacement', async () => {
  let sent = 0
  const api: SessionApiFixture = {
    aiStatus: async () => status(),
    openAiConversation: async () => ({
      conversationId: 'old',
      workspaceLabel: 'ws',
      memory: 'memory',
    }),
    aiConversation: async () => {
      throw { response: { status: 404 } }
    },
    sendAiMessage: async () => {
      sent++
      return result()
    },
  }
  const session = createChatSession(api)
  await session.openConversation()
  session.draft.value = 'kept'
  await session.selectConversation('old')
  await session.send()
  expect(session.expired.value).toBe(true)
  expect(session.draft.value).toBe('kept')
  expect(sent).toBe(0)
})

it('creates the first conversation on send and assigns an explicitly selected model without losing prototype context', async () => {
  const requests: unknown[] = []
  const api: SessionApiFixture = {
    aiStatus: async () => status(),
    openAiConversation: async () => ({
      conversationId: 'first',
      workspaceLabel: 'ws',
      memory: 'memory',
    }),
    assignConversationConnection: async (id, connection, confirmed, model) => {
      requests.push([id, connection, confirmed, model])
      return { connectionId: connection, connectionName: 'desk', model, memoryCleared: false }
    },
    sendAiMessage: async (id, request) => {
      requests.push([id, request.message, request.toolMode, request.context?.prototypeVersionId])
      return result()
    },
  }
  const session = createChatSession(api)
  session.draft.value = 'Implement this prototype'
  session.context.value.prototypeVersionId = 'saved-version'
  session.context.value.mode = 'code'
  session.chooseConversationConnection('desk', 'model-b')
  await session.send()
  expect(requests).toEqual([
    ['first', 'desk', true, 'model-b'],
    ['first', 'Implement this prototype', 'none', 'saved-version'],
  ])
  expect(session.boundModel.value).toBe('model-b')
  expect(session.turns.value[0]?.text).toBe('Implement this prototype')
})

it('preserves per-conversation context and restores the active conversation after returning from settings', async () => {
  let serial = 0
  const store = new Map<string, string>()
  const storage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
  }
  const api: SessionApiFixture = {
    aiStatus: async () => status(),
    openAiConversation: async () => ({
      conversationId: 'c' + ++serial,
      workspaceLabel: 'ws',
      memory: 'memory',
      connectionId: 'desk',
      model: 'model-a',
    }),
    sendAiMessage: async () => result(),
  }
  const session = createChatSession(api, storage)
  await session.openConversation()
  session.context.value.instructions = 'Keep project conventions'
  session.context.value.files = [{ name: 'reference.md', content: 'Reference' }]
  await session.openConversation()
  session.context.value.instructions = 'Another task'
  await session.selectConversation('c1')
  expect(session.context.value.instructions).toBe('Keep project conventions')
  expect(session.context.value.files[0].name).toBe('reference.md')
  const restored = createChatSession(api, storage)
  await restored.restoreLastConversation()
  expect(restored.conversationId.value).toBe('c1')
  expect(restored.boundModel.value).toBe('model-a')
  expect(restored.context.value.instructions).toBe('Keep project conventions')
})

it('keeps a new draft local until the first message', async () => {
  let opened = 0
  const api: SessionApiFixture = {
    aiStatus: async () => status(),
    openAiConversation: async () => {
      opened += 1
      return { conversationId: 'made', workspaceLabel: 'ws', memory: 'memory' }
    },
    sendAiMessage: async () => result(),
  }
  const session = createChatSession(api)
  await session.openConversation()
  session.draft.value = '已有草稿'
  session.beginDraft()
  expect(opened).toBe(1)
  expect(session.conversationId.value).toBeNull()
  expect(session.draft.value).toBe('')
  session.draft.value = '第一条'
  await session.send()
  expect(opened).toBe(2)
  expect(session.history.value[0]?.title).toBe('第一条')
})

it('keeps legacy v1 observations exportable without promoting them to canonical messages', async () => {
  const legacy = JSON.stringify({
    version: 1,
    items: [],
    transcripts: {
      old: [{ role: 'assistant', text: 'legacy local observation', status: 'SUCCEEDED' }],
    },
  })
  const values = new Map([['eap.chat.history.v1', legacy]])
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
  const session = createChatSession(
    {
      openAiConversation: async () => ({ conversationId: 'new', workspaceLabel: '', memory: '' }),
      sendAiMessage: async () => result(),
    },
    storage,
  )
  expect(session.legacyHistoryExport()).toBe(legacy)
  expect(session.turns.value).toEqual([])
  await session.openConversation()
  expect(session.turns.value).toEqual([])
  session.draft.value = 'unsent draft'
  session.flushPersistence()
  expect(values.get('eap.chat.history.v1')).toBe(legacy)
  expect(JSON.parse(values.get('eap.chat.preferences.v2')!).transcripts).toBeUndefined()
})

it('rejects an illegal canonical execution status without inventing business UNKNOWN', async () => {
  const session = createChatSession({
    openAiConversation: async () => ({ conversationId: 'invalid', workspaceLabel: '', memory: '' }),
    sendAiMessage: async () => result({ status: 'unrecognized' }),
  })
  await session.openConversation()
  session.draft.value = 'retain malformed response draft'
  await session.send()
  expect(session.turns.value).toEqual([])
  expect(session.graphUnavailable.value).toBe(true)
  expect(session.draft.value).toBe('retain malformed response draft')
  expect(session.failure.value).toBe('response-uncertain')
})
