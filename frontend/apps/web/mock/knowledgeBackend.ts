import { randomUUID } from 'node:crypto';
import { containsSecret } from './sensitiveData';

/** In-memory implementation of the existing Java knowledge-management contract. */
export function createKnowledgeBackend() {
  const bases = new Map<string, { id: string; name: string; description: string }>();
  const documents = new Map<string, { id: string; baseId: string; title: string; content: string }>();
  const reply = (status: number, data: unknown) => ({ status, data });
  const missing = () => reply(404, { message: '知识库或文档不存在' });
  return {
    handle(method: string, url: URL, body: Record<string, unknown>) {
      const path = url.pathname;
      if (!/^\/knowledge(?:\/|$)/.test(path)) return undefined;
      if (['POST', 'PUT'].includes(method) && containsSecret(body)) return reply(400, { message: '知识库或文档含凭据，请脱敏后保存' });
      if (path === '/knowledge/search' && method === 'GET') {
        const query = (url.searchParams.get('q') ?? '').slice(0, 500).trim();
        const baseId = url.searchParams.get('baseId');
        if (baseId && !bases.has(baseId)) return missing();
        const requested = Number(url.searchParams.get('limit') ?? 5);
        const limit = Number.isFinite(requested) ? Math.min(20, Math.max(1, requested)) : 5;
        const items = [...documents.values()].filter(doc => (!baseId || doc.baseId === baseId) && query && doc.content.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
          .slice(0, limit).map(doc => ({ id: doc.id, source: doc.title, knowledgeBase: bases.get(doc.baseId)!.name, excerpt: doc.content.slice(0, 1200), score: 1, retrievalMode: 'mock-keyword' }));
        return reply(200, { query, items });
      }
      if (path === '/knowledge' && method === 'GET') return reply(200, { items: [...bases.values()].map(base => ({ ...base, documents: [...documents.values()].filter(doc => doc.baseId === base.id).length })) });
      const match = path.match(/^\/knowledge\/([^/]+)(?:\/documents(?:\/([^/]+))?)?$/);
      if ((path === '/knowledge' && method === 'POST') || (match && method === 'PUT' && !path.includes('/documents'))) {
        if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 200) return reply(400, { message: '知识库名称不能为空，最多200字符' });
        const id = match?.[1] ?? randomUUID();
        if (match && !bases.has(id)) return missing();
        bases.set(id, { id, name: body.name, description: String(body.description ?? '') });
        return reply(200, match ? { id, status: 'updated' } : { id });
      }
      if (!match || !bases.has(match[1]!)) return missing();
      const id = match[1]!;
      if (path.endsWith('/documents') && method === 'GET') return reply(200, { items: [...documents.values()].filter(doc => doc.baseId === id).map(({ id, title, content }) => ({ id, title, content })) });
      if (path.endsWith('/documents') && method === 'POST') {
        if (typeof body.title !== 'string' || !body.title.trim() || body.title.length > 1000 || typeof body.content !== 'string' || !body.content.trim() || body.content.length > 200000) return reply(400, { message: '标题最多1000字符，正文最多20万字符，请填写完整' });
        const documentId = randomUUID();
        documents.set(documentId, { id: documentId, baseId: id, title: body.title, content: body.content });
        return reply(200, { id: documentId, chunks: Math.ceil(body.content.length / 1500) });
      }
      if (method === 'DELETE') {
        if (match[2]) {
          if (documents.get(match[2])?.baseId !== id) return missing();
          documents.delete(match[2]);
          return reply(200, { id: match[2], status: 'deleted' });
        }
        if (!path.includes('/documents')) {
          bases.delete(id);
          for (const doc of documents.values()) if (doc.baseId === id) documents.delete(doc.id);
          return reply(200, { id, status: 'deleted' });
        }
      }
      return reply(404, { error: 'MOCK_ENDPOINT_NOT_IMPLEMENTED' });
    },
  };
}
