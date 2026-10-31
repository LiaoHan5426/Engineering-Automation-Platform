import type { AiConversation, AiMessageResult, AiStatus, CodeProposal, ModelConnectionList, TaskContext, VerificationProbe, WorkspaceBaseline, WorkspaceDirty, WorkspaceSource } from '@eap/runtime-client';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModelBackend } from './modelBackend';
import { createKnowledgeBackend } from './knowledgeBackend';
import { createDatabaseBackend } from './databaseBackend';
import { createBoardBackend } from './boardBackend';

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');

export function createMockChatBackend() {
  let sequence = 0;
  const instanceId = randomUUID();
  const conversations = new Map<string, AiConversation>();
  const proposals = new Map<string, CodeProposal>();
  const versions: Array<Record<string, unknown>> = [];

  const models = [{ id: 'reasoning-demo', reasoningEfforts: ['low', 'medium', 'high'] as Array<'low' | 'medium' | 'high'> }, { id: 'general-demo', reasoningEfforts: [] }];
  const connections: ModelConnectionList = { effectiveDefaultId: 'mock-local', items: [{ id: 'mock-local', name: 'Mock · 本地模拟', kind: 'mock', enabled: true, baseUrl: 'http://mock.local', defaultModel: models[0]!.id, models, allowedModels: models.map(item => item.id), discoveredAt: '', discoveryError: '', secretPresent: false, revision: 1, defaultSelected: true, configurationRevision: 'mock-1' }] };
  function result(status: number, data: unknown) { return { status, data }; }
  const modelBackend = createModelBackend(connections);
  const knowledgeBackend = createKnowledgeBackend();
  const databaseBackend = createDatabaseBackend();
  const boardBackend = createBoardBackend();
  const effective = () => connections.items.find(item => item.id === connections.effectiveDefaultId && item.enabled && item.allowedModels.includes(item.defaultModel))
    ?? connections.items.find(item => item.enabled && item.allowedModels.includes(item.defaultModel));
  return {
    async handle(method: string, path: string, body: Record<string, unknown> = {}) {
      const requestUrl = new URL(path, 'http://mock.local');
      path = requestUrl.pathname;
      const knowledge = knowledgeBackend.handle(method, requestUrl, body);
      if (knowledge) return knowledge;
      const database = databaseBackend.handle(method, requestUrl, body);
      if (database) return database;
      if (requestUrl.searchParams.has('connectionId')) body.connectionId = requestUrl.searchParams.get('connectionId');
      const configured = modelBackend.handle(method, path, body);
      if (configured) return configured;
      const board = boardBackend.handle(method, requestUrl, body);
      if (board) return board;
      if (path === '/prototype-versions' && method === 'GET') return result(200, { items: versions.filter(item => item.sourceRef === requestUrl.searchParams.get('sourceRef')) });
      if (path === '/prototype-versions' && method === 'POST') {
        if (!['builder-alpha', 'builder-beta'].includes(String(body.sourceRef)) || typeof body.body !== 'string' || body.body.length > 160000) return result(400, { error: 'INVALID_PROTOTYPE' });
        const version = { ...body, id: randomUUID(), interaction: '语义原型交互', contentHash: createHash('sha256').update(JSON.stringify(body)).digest('hex'), createdAt: new Date().toISOString() };
        versions.unshift(version); return result(200, version);
      }
      if (path.startsWith('/prototype-versions/') && method === 'GET') {
        const version = versions.find(item => item.id === path.slice('/prototype-versions/'.length));
        return version ? result(200, version) : result(404, { error: 'VERSION_NOT_FOUND' });
      }
      if (method === 'GET' && path === '/ai/status') return result(200, {
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
      } satisfies AiStatus);
      if (method === 'GET' && path.startsWith('/ai/workspace/baseline')) {
        const query = requestUrl.searchParams;
        const target = query.get('path') ?? '';
        return result(200, { path: target, exists: false, baseHash: '', denial: 'AUTHORIZED_ROOT_MISSING' } satisfies WorkspaceBaseline);
      }
      if (method === 'GET' && path.startsWith('/ai/workspace/source')) {
        const query = requestUrl.searchParams;
        const target = query.get('path') ?? '';
        return result(200, {
          path: target,
          exists: true,
          baseHash: 'mock-source-hash',
          bytes: 42,
          excerpt: '<!-- mock excerpt: not repository content -->',
          denial: '',
        } satisfies WorkspaceSource);
      }
      if (method === 'GET' && path === '/ai/workspace/dirty') {
        return result(200, {
          requested: false,
          denial: 'AUTHORIZED_ROOT_MISSING',
          count: 0,
          paths: [],
          detail: '',
        } satisfies WorkspaceDirty);
      }
      if (method === 'GET' && path === '/ai/workspace/files') {
        const folder = requestUrl.searchParams.get('path') ?? '';
        const tree: Record<string, Array<{ name: string; path: string; directory: boolean }>> = {
          '': [{ name: 'frontend', path: 'frontend', directory: true }],
          frontend: [{ name: 'Example.vue', path: 'frontend/Example.vue', directory: false }],
        };
        return result(200, { path: folder, entries: tree[folder] ?? [], truncated: false, denial: tree[folder] ? '' : 'DIRECTORY_NOT_FOUND' });
      }
      if (method === 'POST' && path === '/ai/workspace/verification/probe') {
        return result(200, {
          requested: false,
          denial: 'AUTHORIZED_ROOT_MISSING',
          name: '',
          exitCode: null,
          summary: '',
        } satisfies VerificationProbe);
      }
      if (method === 'GET' && path === '/ai/connections') return result(200, connections);
      if (method === 'POST' && path === '/ai/conversations') {
        const target = effective();
        if (!target) return result(503, { error: 'MODEL_NOT_CONFIGURED' });
        const item: AiConversation = { conversationId: `mock-${instanceId}-${++sequence}`, workspaceLabel: 'ws-mock-local', memory: '模拟数据，不调用模型、不读写仓库', connectionId: target.id, model: target.defaultModel };
        conversations.set(item.conversationId, item); return result(200, item);
      }
      const match = path.match(/^\/ai\/conversations\/([^/]+)(.*)$/);
      if (!match) return result(404, { error: 'MOCK_ENDPOINT_NOT_IMPLEMENTED' });
      const id = decodeURIComponent(match[1]!), suffix = match[2];
      const item = conversations.get(id);
      if (!item) return result(404, { error: 'MOCK_CONVERSATION_NOT_FOUND' });
      if (method === 'GET' && !suffix) return result(200, item);
      if (method === 'DELETE' && !suffix) { conversations.delete(id); return result(200, {}); }
      if (method === 'POST' && suffix === '/connection') {
        const target = connections.items.find(value => value.id === body.connectionId && value.enabled);
        if (!target || !target.allowedModels.includes(String(body.model))) return result(403, { error: 'MODEL_NOT_ALLOWED' });
        const memoryCleared = item.connectionId !== target.id || item.model !== String(body.model);
        item.model = String(body.model); item.connectionId = target.id; return result(200, { ...item, connectionName: target.name, memoryCleared });
      }
      if (method === 'POST' && suffix === '/messages') {
        const target = connections.items.find(value => value.id === item.connectionId && value.enabled && value.allowedModels.includes(item.model ?? ''));
        if (!target) return result(403, { error: 'MODEL_NOT_ALLOWED' });
        const context = body.context as TaskContext | undefined;
        if (typeof body.message !== 'string' || !body.message.trim()) return result(400, { error: 'EMPTY_MESSAGE' });
        const proposal: CodeProposal | null = context?.mode === 'code' && context.approval !== 'read_only' ? { id: `proposal-${++sequence}`, conversationId: id, workspace: repoRoot, summary: '模拟候选：仅供交互验收', files: [{ path: 'Example.vue', before: '<h1>Workspace</h1>', content: '<h1>EAP Workspace</h1>', baseHash: '' }], applied: false, writeAllowed: false, verification: 'not_requested' } : null;
        if (proposal) proposals.set(proposal.id, proposal);
        return result(200, { executionId: null, answer: proposal ? '模拟候选已准备，请查看变更并确认。不会修改真实文件。' : '这是 mock 服务返回的模拟回答。场景、专家和模型选择使用与真实服务相同的交互流程；未调用真实模型。', error: '', status: 'mock_completed', approval: context?.approval ?? 'review', verification: 'not_requested', toolEvents: [], artifactError: '', artifacts: [], proposal } satisfies AiMessageResult);
      }
      const apply = suffix?.match(/^\/proposals\/([^/]+)\/apply$/);
      if (method === 'POST' && apply) {
        const proposal = proposals.get(decodeURIComponent(apply[1]!));
        if (!proposal || proposal.conversationId !== id) return result(404, { error: 'MOCK_PROPOSAL_NOT_FOUND' });
        if (body.confirmed !== true) return result(403, { error: 'CONFIRMATION_REQUIRED' });
        if (proposal.files.some((file) => !file.baseHash.trim())) return result(409, { error: 'BASELINE_UNKNOWN' });
        proposal.applied = true;
        return result(200, { id: proposal.id, written: proposal.files.map(file => file.path), verification: 'mock_only_not_executed', checks: [] });
      }
      return result(404, { error: 'MOCK_ENDPOINT_NOT_IMPLEMENTED' });
    },
  };
}
