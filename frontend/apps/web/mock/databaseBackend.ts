import { randomUUID } from 'node:crypto';
import { containsSecret } from './sensitiveData';

/** Metadata only; never opens a database connection or executes supplied SQL. */
export function createDatabaseBackend() {
  const profiles = new Map<string, { id: string; label: string; engine: string; environment: string; metadata: Record<string, unknown> }>();
  const reply = (status: number, data: unknown) => ({ status, data });
  return {
    handle(method: string, url: URL, body: Record<string, unknown>) {
      if (!/^\/databases(?:\/|$)/.test(url.pathname)) return undefined;
      const id = url.pathname === '/databases' ? '' : url.pathname.slice('/databases/'.length);
      if (!id && method === 'GET') return reply(200, {
        items: [...profiles.values()].map(({ id, label, engine, environment }) => ({ id, label, engine, environment, credentialsExposed: false })),
        policy: '仅保存脱敏表结构和索引资料，不接受凭据或连接字符串；不自动连接业务数据库',
      });
      if (id && !profiles.has(id)) return reply(404, { message: '数据库资料不存在' });
      if (id && method === 'GET') return reply(200, structuredClone(profiles.get(id)));
      if ((!id && method === 'POST') || (id && method === 'PUT')) {
        if (containsSecret(body)) return reply(400, { message: '资料含凭据或连接字符串，禁止保存' });
        if (typeof body.label !== 'string' || !body.label.trim() || body.label.length > 200 || typeof body.engine !== 'string' || body.engine.length > 40 || typeof body.environment !== 'string' || body.environment.length > 40) return reply(400, { message: '请填写有效名称、引擎和环境' });
        if (body.metadata != null && (typeof body.metadata !== 'object' || Array.isArray(body.metadata))) return reply(400, { message: '资料必须是结构化对象' });
        const metadata = body.metadata as Record<string, unknown> ?? {};
        if (JSON.stringify(metadata).length > 100000) return reply(400, { message: '资料最多10万字符' });
        const key = id || randomUUID();
        profiles.set(key, structuredClone({ id: key, label: body.label, engine: body.engine, environment: body.environment, metadata }));
        return reply(200, { id: key, status: 'saved' });
      }
      if (id && method === 'DELETE') { profiles.delete(id); return reply(200, { id, status: 'deleted' }); }
      return reply(404, { error: 'MOCK_ENDPOINT_NOT_IMPLEMENTED' });
    },
  };
}
