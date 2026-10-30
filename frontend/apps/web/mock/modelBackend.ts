import type { ModelConnectionList, ModelConnection, ModelOption } from '@eap/runtime-client';

/** In-memory configuration API. Credentials are never retained or transmitted. */
export function createModelBackend(connections: ModelConnectionList) {
  let sequence = 0;
  const logins = new Map<string, string>();
  const reply = (status: number, data: unknown) => ({ status, data });
  function selectDefault(id: string) {
    for (const item of connections.items) item.defaultSelected = item.id === id;
    connections.effectiveDefaultId = id;
  }
  function catalog(item: ModelConnection): ModelOption[] {
    if (item.baseUrl.includes('mock.local')) return [{ id: 'reasoning-demo', reasoningEfforts: ['low', 'medium', 'high'] }, { id: 'general-demo', reasoningEfforts: [] }];
    return item.baseUrl.includes('deepseek')
      ? [{ id: 'deepseek-chat', reasoningEfforts: [] }, { id: 'deepseek-reasoner', reasoningEfforts: ['low', 'medium', 'high'] }]
      : [{ id: 'gpt-example', reasoningEfforts: ['low', 'medium', 'high'] }, { id: 'gpt-fast-example', reasoningEfforts: [] }];
  }
  function create(body: Record<string, unknown>, kind = 'api-key') {
    const item: ModelConnection = { id: `config-${++sequence}`, name: String(body.name), kind, baseUrl: String(body.baseUrl), enabled: body.enabled !== false, defaultModel: '', models: [], allowedModels: [], discoveredAt: '', discoveryError: '', secretPresent: !!body.secret, revision: 1, defaultSelected: false, configurationRevision: 'mock-1' };
    connections.items.push(item);
    if (body.defaultSelected) selectDefault(item.id);
    return item;
  }
  return {
    handle(method: string, path: string, body: Record<string, unknown>) {
      if (method === 'POST' && path === '/ai/chatgpt/login') {
        const item = connections.items.find(value => value.id === body.connectionId && value.kind === 'chatgpt-plan')
          ?? create({ name: 'ChatGPT（模拟账号）', baseUrl: 'mock://chatgpt', enabled: true }, 'chatgpt-plan');
        item.enabled = true;
        const id = `login-${++sequence}`; logins.set(id, item.id);
        return reply(200, { loginId: id, authorizationUrl: '#mock-authorization', expiresAt: new Date(Date.now() + 300000).toISOString() });
      }
      const account = path.match(/^\/ai\/chatgpt\/login\/accounts\/([^/]+)$/);
      if (method === 'DELETE' && account) {
        const item = connections.items.find(value => value.id === account[1]);
        if (!item) return reply(404, { error: 'ACCOUNT_NOT_FOUND' });
        item.enabled = false; item.secretPresent = false; item.revision++; return reply(200, {});
      }
      const login = path.match(/^\/ai\/chatgpt\/login\/([^/]+)$/);
      if (login) {
        if (method === 'DELETE') { logins.delete(login[1]!); return reply(200, {}); }
        const id = logins.get(login[1]!);
        return id ? reply(200, { loginId: login[1], state: 'connected', connectionId: id, error: '' }) : reply(404, { error: 'LOGIN_NOT_FOUND' });
      }
      if (method === 'POST' && path === '/ai/connections') {
        if (!String(body.name ?? '').trim() || !/^https?:\/\//.test(String(body.baseUrl))) return reply(400, { error: 'INVALID_CONNECTION' });
        return reply(200, create(body));
      }
      const match = path.match(/^\/ai\/connections\/([^/]+)(.*)$/);
      if (!match) return undefined;
      const item = connections.items.find(value => value.id === decodeURIComponent(match[1]!));
      if (!item) return reply(404, { error: 'CONNECTION_NOT_FOUND' });
      if (method !== 'POST') return undefined;
      const suffix = match[2];
      if (!suffix) {
        if (!String(body.name ?? '').trim() || !/^https?:\/\//.test(String(body.baseUrl))) return reply(400, { error: 'INVALID_CONNECTION' });
        item.name = String(body.name); item.baseUrl = String(body.baseUrl); item.enabled = body.enabled !== false;
        if (body.secret) item.secretPresent = true;
        if (body.defaultSelected) selectDefault(item.id);
      } else if (suffix === '/enabled') item.enabled = body.enabled === true;
      else if (suffix === '/default') selectDefault(item.id);
      else if (suffix === '/models/refresh') {
        if (!item.enabled) return reply(409, { error: 'CONNECTION_DISABLED' });
        item.models = catalog(item); item.discoveredAt = new Date().toISOString(); item.discoveryError = '';
        item.allowedModels = item.allowedModels.filter(id => item.models.some(model => model.id === id));
        if (!item.allowedModels.includes(item.defaultModel)) item.defaultModel = item.allowedModels[0] ?? '';
      } else if (suffix === '/models') {
        const models = body.models as ModelOption[], allowed = body.allowedModels as string[];
        if (!Array.isArray(models) || !Array.isArray(allowed) || !allowed.length || !allowed.includes(String(body.defaultModel)) || allowed.some(id => !models.some(model => model.id === id))) return reply(400, { error: 'INVALID_MODEL_SELECTION' });
        item.models = models.map(model => ({ id: model.id, reasoningEfforts: model.reasoningEfforts.filter(effort => ['low', 'medium', 'high'].includes(effort)) }));
        item.allowedModels = [...new Set(allowed)]; item.defaultModel = String(body.defaultModel);
      } else return undefined;
      item.revision++; return reply(200, item);
    },
  };
}
