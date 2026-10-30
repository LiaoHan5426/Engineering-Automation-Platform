import { describe, expect, it } from 'vite-plus/test';
import { createKnowledgeBackend } from './knowledgeBackend';

describe('knowledge mock contract', () => {
  it('isolates scope and removes deleted content from retrieval', () => {
    const backend = createKnowledgeBackend();
    const call = (method: string, path: string, body: Record<string, unknown> = {}) => backend.handle(method, new URL(path, 'http://mock.local'), body)!;
    const a = (call('POST', '/knowledge', { name: 'A' }).data as { id: string }).id;
    const b = (call('POST', '/knowledge', { name: 'B' }).data as { id: string }).id;
    const doc = (call('POST', `/knowledge/${a}/documents`, { title: 'source A', content: 'local acceptance marker' }).data as { id: string }).id;
    expect(call('GET', '/knowledge').data).toMatchObject({ items: [{ documents: 1 }, { documents: 0 }] });
    expect(call('GET', `/knowledge/search?q=acceptance&baseId=${b}`).data).toMatchObject({ items: [] });
    expect(call('GET', `/knowledge/search?q=acceptance&baseId=${a}`).data).toMatchObject({ items: [{ source: 'source A', knowledgeBase: 'A' }] });
    expect(call('DELETE', `/knowledge/${b}/documents/${doc}`).status).toBe(404);
    expect(call('DELETE', `/knowledge/${a}/documents/${doc}`).status).toBe(200);
    expect(call('GET', '/knowledge/search?q=acceptance').data).toMatchObject({ items: [] });
    call('DELETE', `/knowledge/${a}`);
    expect(call('GET', `/knowledge/search?q=acceptance&baseId=${a}`).status).toBe(404);
  });
  it('rejects invalid drafts and keeps instances independent', () => {
    const backend = createKnowledgeBackend();
    const url = new URL('/knowledge', 'http://mock.local');
    expect(backend.handle('POST', url, { name: '' })?.status).toBe(400);
    expect(backend.handle('POST', url, { name: 'password=fixture-only' })?.status).toBe(400);
    backend.handle('POST', url, { name: 'A' });
    expect(createKnowledgeBackend().handle('GET', url, {})?.data).toEqual({ items: [] });
    expect(backend.handle('GET', new URL('/unknown', url), {})).toBeUndefined();
  });
});
