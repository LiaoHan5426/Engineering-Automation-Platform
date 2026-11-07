import type {
  AiConversation,
  AiMessageResult,
  AiStatus,
  CodeProposal,
  ModelConnectionList,
  TaskContext,
  VerificationProbe,
  WorkspaceBaseline,
  WorkspaceDirty,
  WorkspaceSource,
  SkillContext,
} from '@eap/runtime-client'
import { createHash, randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createModelBackend } from './modelBackend'
import { createKnowledgeBackend } from './knowledgeBackend'
import { createDatabaseBackend } from './databaseBackend'
import { createBoardBackend } from './boardBackend'
import { createSkillBackend, validSkillTaskFields } from './skillBackend'
import { createScenarioBackend } from './scenarioBackend'
import { createMockCapabilityBackend } from './capabilityBackend'
import {
  mockExpertPage,
  mockExpertContext,
  mockExpertPreview,
  validMockExpertRef,
} from './expertContext'

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..')

export function createMockChatBackend() {
  const capabilityBackend = createMockCapabilityBackend()
  let sequence = 0
  const instanceId = randomUUID()
  const conversations = new Map<string, AiConversation>()
  const bindingRevisions = new Map<string, number>()
  const busy = new Set<string>()
  const sensitiveConversations = new Set<string>()
  const proposals = new Map<string, CodeProposal>()
  const proposalStates = new Map<string, { status: string; reason: string }>()
  const versions: Array<Record<string, unknown>> = []

  const models = [
    {
      id: 'reasoning-demo',
      reasoningEfforts: ['low', 'medium', 'high'] as Array<'low' | 'medium' | 'high'>,
    },
    { id: 'general-demo', reasoningEfforts: [] },
  ]
  const connections: ModelConnectionList = {
    effectiveDefaultId: 'mock-local',
    items: [
      {
        id: 'mock-local',
        name: 'Mock · 本地模拟',
        kind: 'mock',
        enabled: true,
        baseUrl: 'http://mock.local',
        defaultModel: models[0]!.id,
        models,
        allowedModels: models.map((item) => item.id),
        discoveredAt: '',
        discoveryError: '',
        secretPresent: false,
        revision: 1,
        defaultSelected: true,
        configurationRevision: 'mock-1',
      },
    ],
  }
  function result(status: number, data: unknown) {
    return { status, data }
  }
  const modelBackend = createModelBackend(connections)
  const knowledgeBackend = createKnowledgeBackend()
  const skillBackend = createSkillBackend()
  const scenarioBackend = createScenarioBackend()
  const databaseBackend = createDatabaseBackend()
  const boardBackend = createBoardBackend((id) => versions.some((version) => version.id === id))
  const effective = () =>
    connections.items.find(
      (item) =>
        item.id === connections.effectiveDefaultId &&
        item.enabled &&
        item.allowedModels.includes(item.defaultModel),
    ) ??
    connections.items.find((item) => item.enabled && item.allowedModels.includes(item.defaultModel))
  return {
    async handle(method: string, path: string, body: Record<string, unknown> = {}) {
      const requestUrl = new URL(path, 'http://mock.local')
      path = requestUrl.pathname
      const scenario = scenarioBackend.handle(method, requestUrl, body)
      if (scenario) return scenario
      const skill = skillBackend.handle(method, path, body)
      if (skill) return skill
      if (method === 'GET' && path === '/experts') return result(200, mockExpertPage)
      if (method === 'POST' && path === '/ai/expert-context/preview') return mockExpertPreview(body)
      const knowledge = knowledgeBackend.handle(method, requestUrl, body)
      if (knowledge) return knowledge
      const database = databaseBackend.handle(method, requestUrl, body)
      if (database) return database
      if (requestUrl.searchParams.has('connectionId'))
        body.connectionId = requestUrl.searchParams.get('connectionId')
      const configured = modelBackend.handle(method, path, body)
      if (configured) return configured
      const board = boardBackend.handle(method, requestUrl, body)
      if (board) return board
      const capability = capabilityBackend.handle(method, path)
      if (capability) return capability
      if (path === '/prototype-versions' && method === 'GET')
        return result(200, {
          items: versions.filter(
            (item) => item.sourceRef === requestUrl.searchParams.get('sourceRef'),
          ),
        })
      if (path === '/prototype-versions' && method === 'POST') {
        if (
          !['builder-alpha', 'builder-beta'].includes(String(body.sourceRef)) ||
          typeof body.body !== 'string' ||
          body.body.length > 160000
        )
          return result(400, { error: 'INVALID_PROTOTYPE' })
        const version = {
          ...body,
          id: randomUUID(),
          interaction: '语义原型交互',
          contentHash: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
          createdAt: new Date().toISOString(),
        }
        versions.unshift(version)
        return result(200, version)
      }
      if (path.startsWith('/prototype-versions/') && method === 'GET') {
        const version = versions.find(
          (item) => item.id === path.slice('/prototype-versions/'.length),
        )
        return version ? result(200, version) : result(404, { error: 'VERSION_NOT_FOUND' })
      }
      if (method === 'GET' && path === '/ai/status')
        return result(200, {
          state: effective() ? 'available' : 'not_configured',
          provider: 'mock',
          model: effective()?.defaultModel ?? '',
          configurationRevision: 'mock-1',
          lastObservedAt: null,
          errorCode: '',
          tools: { git_status: false },
          workspaceLabel: 'ws-mock-local',
          workspacePath: repoRoot,
          authorizedRootPath: '',
          authorizedRootDenial: 'AUTHORIZED_ROOT_MISSING',
          storesUserDirectoryGrants: false,
          verificationEnabled: false,
          verificationCommands: [],
        } satisfies AiStatus)
      if (method === 'GET' && path.startsWith('/ai/workspace/baseline')) {
        const query = requestUrl.searchParams
        const target = query.get('path') ?? ''
        return result(200, {
          path: target,
          exists: false,
          baseHash: '',
          denial: 'AUTHORIZED_ROOT_MISSING',
        } satisfies WorkspaceBaseline)
      }
      if (method === 'GET' && path.startsWith('/ai/workspace/source')) {
        const query = requestUrl.searchParams
        const target = query.get('path') ?? ''
        return result(200, {
          path: target,
          exists: true,
          baseHash: 'mock-source-hash',
          bytes: 42,
          excerpt: '<!-- mock excerpt: not repository content -->',
          denial: '',
        } satisfies WorkspaceSource)
      }
      if (method === 'GET' && path === '/ai/workspace/dirty') {
        return result(200, {
          requested: false,
          denial: 'AUTHORIZED_ROOT_MISSING',
          count: 0,
          paths: [],
          detail: '',
        } satisfies WorkspaceDirty)
      }
      if (method === 'GET' && path === '/ai/workspace/files') {
        const folder = requestUrl.searchParams.get('path') ?? ''
        const tree: Record<string, Array<{ name: string; path: string; directory: boolean }>> = {
          '': [{ name: 'frontend', path: 'frontend', directory: true }],
          frontend: [{ name: 'Example.vue', path: 'frontend/Example.vue', directory: false }],
        }
        return result(200, {
          path: folder,
          entries: tree[folder] ?? [],
          truncated: false,
          denial: tree[folder] ? '' : 'DIRECTORY_NOT_FOUND',
        })
      }
      if (method === 'POST' && path === '/ai/workspace/verification/probe') {
        return result(200, {
          requested: false,
          denial: 'AUTHORIZED_ROOT_MISSING',
          name: '',
          exitCode: null,
          summary: '',
        } satisfies VerificationProbe)
      }
      if (method === 'GET' && path === '/ai/connections') return result(200, connections)
      if (method === 'POST' && path === '/ai/conversations') {
        const target = effective()
        if (!target) return result(503, { error: 'MODEL_NOT_CONFIGURED' })
        const item: AiConversation = {
          conversationId: `mock-${instanceId}-${++sequence}`,
          workspaceLabel: 'ws-mock-local',
          memory: '展示历史≠模型窗口≠任务工作记忆≠绑定（模拟）',
          connectionId: target.id,
          model: target.defaultModel,
          workingMemory: {
            goal: '',
            constraints: ['示例约束：复用现有组件'],
            facts: [],
            evidenceRefs: [],
            dependencyKeys: [],
            invalidation: '',
            updatedAt: new Date().toISOString(),
            layers: ['display_history', 'model_window', 'task_working', 'binding'],
          },
        }
        conversations.set(item.conversationId, item)
        bindingRevisions.set(item.conversationId, target.revision)
        return result(200, item)
      }
      const match = path.match(/^\/ai\/conversations\/([^/]+)(.*)$/)
      if (!match) return result(404, { error: 'MOCK_ENDPOINT_NOT_IMPLEMENTED' })
      const id = decodeURIComponent(match[1]!),
        suffix = match[2]
      let item = conversations.get(id)
      if (method === 'POST' && suffix === '/reconnect') {
        if (
          Object.keys(body).length !== 2 ||
          body.confirmContextReset !== true ||
          typeof body.expectedWorkspaceLabel !== 'string'
        )
          return result(400, { detail: 'INVALID_RECONNECT_REQUEST' })
        if (body.expectedWorkspaceLabel !== 'ws-mock-local')
          return result(409, { detail: 'CONVERSATION_WORKSPACE_CHANGED' })
        if (busy.has(id)) return result(409, { detail: 'CONVERSATION_BUSY' })
        const contextReset = !item
        if (!item) {
          item = {
            conversationId: id,
            workspaceLabel: 'ws-mock-local',
            memory: '模拟数据，不调用模型、不读写仓库',
            connectionId: null,
            model: null,
          }
          conversations.set(id, item)
        }
        return result(200, { ...item, contextReset })
      }
      if (!item) return result(404, { error: 'MOCK_CONVERSATION_NOT_FOUND' })
      if (method !== 'GET' && busy.has(id)) return result(409, { detail: 'CONVERSATION_BUSY' })
      if (method === 'GET' && !suffix) return result(200, item)
      if (method === 'PUT' && suffix === '/working-memory') {
        const allowed = new Set(['goal', 'constraints', 'facts', 'evidenceRefs', 'dependencyKeys'])
        if (Object.keys(body).some((key) => !allowed.has(key)))
          return result(400, { detail: 'INVALID_CHAT_REQUEST' })
        const snapshot = {
          goal: typeof body.goal === 'string' ? body.goal : '',
          constraints: Array.isArray(body.constraints)
            ? body.constraints.filter((value): value is string => typeof value === 'string')
            : [],
          facts: Array.isArray(body.facts)
            ? body.facts.filter(
                (value): value is { kind: string; id: string; revisionOrDigest: string } =>
                  !!value &&
                  typeof value === 'object' &&
                  typeof (value as { kind?: unknown }).kind === 'string' &&
                  typeof (value as { id?: unknown }).id === 'string' &&
                  typeof (value as { revisionOrDigest?: unknown }).revisionOrDigest === 'string',
              )
            : [],
          evidenceRefs: Array.isArray(body.evidenceRefs)
            ? body.evidenceRefs.filter((value): value is string => typeof value === 'string')
            : [],
          dependencyKeys: Array.isArray(body.dependencyKeys)
            ? body.dependencyKeys.filter((value): value is string => typeof value === 'string')
            : [],
          invalidation: '',
          updatedAt: new Date().toISOString(),
          layers: ['display_history', 'model_window', 'task_working', 'binding'],
        }
        item.workingMemory = snapshot
        return result(200, snapshot)
      }
      if (method === 'DELETE' && !suffix) {
        conversations.delete(id)
        bindingRevisions.delete(id)
        sensitiveConversations.delete(id)
        return result(200, {})
      }
      if (method === 'POST' && suffix === '/connection') {
        const target = connections.items.find(
          (value) => value.id === body.connectionId && value.enabled,
        )
        if (!target || !target.allowedModels.includes(String(body.model)))
          return result(403, { error: 'MODEL_NOT_ALLOWED' })
        const memoryCleared =
          item.connectionId !== target.id ||
          item.model !== String(body.model) ||
          bindingRevisions.get(id) !== target.revision
        if (memoryCleared && body.confirmTargetChange !== true)
          return result(409, { detail: 'TARGET_CHANGE_CONFIRMATION_REQUIRED' })
        item.model = String(body.model)
        item.connectionId = target.id
        bindingRevisions.set(id, target.revision)
        if (memoryCleared && item.workingMemory) {
          item.workingMemory = {
            ...item.workingMemory,
            goal: '',
            constraints: [],
            facts: [],
            evidenceRefs: [],
            dependencyKeys: [],
            invalidation: 'MODEL_OR_BINDING_SWITCH',
            updatedAt: new Date().toISOString(),
          }
        }
        return result(200, { ...item, connectionName: target.name, memoryCleared })
      }
      if (method === 'POST' && suffix === '/cancel') {
        const wasBusy = busy.has(id)
        busy.delete(id)
        return result(200, { cancelled: wasBusy, executionId: wasBusy ? `mock-exec-${id}` : '' })
      }
      if (method === 'GET' && suffix?.startsWith('/executions/') && suffix.endsWith('/snapshot')) {
        return result(200, {
          executionId: suffix.split('/')[2],
          conversationId: id,
          latestSequence: 0,
          complete: true,
          status: 'SUCCEEDED',
          events: [],
        })
      }
      if (method === 'POST' && suffix === '/messages') {
        busy.add(id)
        try {
          // Yield a microtask only: mock turns are exclusive, without timers or model calls.
          await Promise.resolve()
          const context = body.context as TaskContext | undefined
          let cleared = sensitiveConversations.has(id)
          const reply = (status: number, data: Record<string, unknown>) =>
            result(status, {
              ...data,
              contextMemoryCleared: cleared,
              knowledgeMemoryCleared: cleared,
            })
          const hasSkill = !!context && typeof context === 'object' && 'skillRef' in context
          const hasPaths =
            !!context && typeof context === 'object' && 'skillResourcePaths' in context
          if (
            (hasSkill || hasPaths) &&
            Object.keys(context!).some(
              (key) =>
                ![
                  'mode',
                  'expert',
                  'instructions',
                  'reasoning',
                  'approval',
                  'files',
                  'prototypeVersionId',
                  'targetPath',
                  'taskRef',
                  'knowledgeExpertRef',
                  'skillRef',
                  'skillResourcePaths',
                ].includes(key),
            )
          )
            return reply(400, { detail: 'INVALID_TASK_CONTEXT' })
          if (
            (hasSkill || hasPaths) &&
            !validSkillTaskFields(context as unknown as Record<string, unknown>)
          )
            return reply(400, { detail: 'INVALID_TASK_CONTEXT' })
          const selection = {
            skillRef: context?.skillRef,
            resourcePaths: hasPaths ? context!.skillResourcePaths : [],
          }
          if (hasSkill) {
            const invalid = skillBackend.validate({ ...selection, resourcePaths: [] })
            if (invalid) return reply(invalid.status, invalid.data)
            if (
              (context.mode !== undefined && context.mode !== 'chat') ||
              'knowledgeExpertRef' in context ||
              'taskRef' in context
            )
              return reply(400, { detail: 'SKILL_CONTEXT_MODE_UNSUPPORTED' })
            const invalidPaths = skillBackend.validate(selection)
            if (invalidPaths) return reply(invalidPaths.status, invalidPaths.data)
            sensitiveConversations.add(id)
            cleared = true
            if (
              typeof body.message !== 'string' ||
              !body.message.trim() ||
              body.message.length > 32000 ||
              typeof body.toolMode !== 'string'
            )
              return reply(400, { detail: 'INVALID_CHAT_REQUEST' })
            if (body.toolMode !== 'none')
              return reply(400, { detail: 'SKILL_CONTEXT_MODE_UNSUPPORTED' })
          } else if (hasPaths) return reply(400, { detail: 'INVALID_SKILL_RESOURCE_PATHS' })
          const hasKnowledge = context && 'knowledgeExpertRef' in context
          if (hasKnowledge) {
            // Runtime parses the identity/mode before send fields, and resolves only after both checks.
            if (
              ('mode' in context && context.mode !== 'chat') ||
              !validMockExpertRef(context.knowledgeExpertRef)
            )
              return reply(400, { detail: 'INVALID_EXPERT_CONTEXT' })
            if (
              typeof body.message !== 'string' ||
              !body.message.trim() ||
              body.message.length > 32000 ||
              typeof body.toolMode !== 'string'
            )
              return reply(400, { detail: 'INVALID_CHAT_REQUEST' })
            if (body.toolMode !== 'none')
              return reply(400, { detail: 'EXPERT_CONTEXT_MODE_UNSUPPORTED' })
          }
          const target = connections.items.find(
            (value) =>
              value.id === item.connectionId &&
              value.enabled &&
              value.allowedModels.includes(item.model ?? ''),
          )
          if (!target) return reply(403, { error: 'MODEL_NOT_ALLOWED' })
          if (bindingRevisions.get(id) !== target.revision)
            return reply(409, { detail: 'MODEL_TARGET_CHANGED' })
          if (
            body.toolMode !== undefined &&
            !['none', 'git_status'].includes(String(body.toolMode))
          )
            return reply(400, { detail: 'INVALID_CHAT_REQUEST' })
          if (
            body.toolMode === 'git_status' &&
            (target.kind === 'chatgpt-plan' || target.wireApi === 'responses')
          )
            return reply(400, { detail: 'AI_PROTOCOL_TOOLS_UNAVAILABLE' })
          const knowledge = hasKnowledge
            ? mockExpertContext(context.knowledgeExpertRef, body.message)
            : undefined
          if (knowledge && knowledge.status !== 200) return reply(knowledge.status, knowledge.data)
          if (context && 'taskRef' in context)
            return reply(409, { detail: 'MOCK_TASK_BINDING_UNAVAILABLE' })
          if (typeof body.message !== 'string' || !body.message.trim())
            return reply(400, { error: 'EMPTY_MESSAGE' })
          const skill = hasSkill
            ? skillBackend.handle('POST', '/skills/context/preview', selection)
            : undefined
          if (skill && skill.status !== 200)
            return reply(skill.status, skill.data as Record<string, unknown>)
          const proposal: CodeProposal | null =
            context?.mode === 'code' && context.approval !== 'read_only'
              ? {
                  id: `proposal-${++sequence}`,
                  conversationId: id,
                  workspace: repoRoot,
                  summary: '模拟候选：仅供交互验收',
                  files: [
                    {
                      path: 'Example.vue',
                      before: '<h1>Workspace</h1>',
                      content: '<h1>EAP Workspace</h1>',
                      baseHash: '',
                    },
                  ],
                  applied: false,
                  writeAllowed: false,
                  verification: 'not_requested',
                }
              : null
          if (proposal) {
            proposals.set(proposal.id, proposal)
            proposalStates.set(proposal.id, { status: 'PROPOSED', reason: '' })
          }
          return reply(200, {
            skillContext: skill ? (skill.data as SkillContext) : null,
            knowledgeContext: knowledge && 'expertRef' in knowledge.data ? knowledge.data : null,
            executionId: `mock-exec-${++sequence}`,
            answer: proposal
              ? '模拟候选已准备，请查看变更并确认。不会修改真实文件。'
              : '这是 mock 服务返回的模拟回答。场景、专家和模型选择使用与真实服务相同的交互流程；未调用真实模型。',
            error: '',
            status: 'mock_completed',
            approval: context?.approval ?? 'review',
            verification: 'not_requested',
            toolEvents: [],
            artifactError: '',
            artifacts: [],
            proposal,
          } satisfies AiMessageResult)
        } finally {
          busy.delete(id)
        }
      }
      const proposalRoute = suffix?.match(/^\/proposals\/([^/]+)(?:\/(apply|refuse))?$/)
      if (method === 'GET' && proposalRoute && !proposalRoute[2]) {
        const proposal = proposals.get(decodeURIComponent(proposalRoute[1]!))
        if (!proposal || proposal.conversationId !== id)
          return result(404, { error: 'MOCK_PROPOSAL_NOT_FOUND' })
        const saved = proposalStates.get(proposal.id) ?? { status: 'PROPOSED', reason: '' }
        return result(200, {
          proposal,
          status: saved.status,
          result: null,
          reason: saved.reason,
        })
      }
      const apply = proposalRoute?.[2] === 'apply' ? proposalRoute : null
      if (method === 'POST' && apply) {
        const proposal = proposals.get(decodeURIComponent(apply[1]!))
        if (!proposal || proposal.conversationId !== id)
          return result(404, { error: 'MOCK_PROPOSAL_NOT_FOUND' })
        const saved = proposalStates.get(proposal.id) ?? { status: 'PROPOSED', reason: '' }
        if (saved.status === 'REFUSED') return result(409, { detail: 'CODE_APPLICATION_REFUSED' })
        if (body.confirmed !== true) return result(403, { error: 'CONFIRMATION_REQUIRED' })
        if (proposal.files.some((file) => !file.baseHash.trim()))
          return result(409, { error: 'BASELINE_UNKNOWN' })
        proposal.applied = true
        proposalStates.set(proposal.id, { status: 'APPLIED', reason: '' })
        return result(200, {
          id: proposal.id,
          written: proposal.files.map((file) => file.path),
          verification: 'mock_only_not_executed',
          checks: [],
        })
      }
      const refuse = proposalRoute?.[2] === 'refuse' ? proposalRoute : null
      if (method === 'POST' && refuse) {
        const proposal = proposals.get(decodeURIComponent(refuse[1]!))
        if (!proposal || proposal.conversationId !== id)
          return result(404, { error: 'MOCK_PROPOSAL_NOT_FOUND' })
        const saved = proposalStates.get(proposal.id) ?? { status: 'PROPOSED', reason: '' }
        if (saved.status !== 'PROPOSED')
          return result(409, { detail: `CODE_APPLICATION_${saved.status}` })
        proposalStates.set(proposal.id, { status: 'REFUSED', reason: 'OPERATOR_REFUSED' })
        return result(200, {
          proposal,
          status: 'REFUSED',
          result: null,
          reason: 'OPERATOR_REFUSED',
        })
      }
      return result(404, { error: 'MOCK_ENDPOINT_NOT_IMPLEMENTED' })
    },
  }
}
