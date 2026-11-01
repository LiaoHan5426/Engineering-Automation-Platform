import { expect, it } from 'vite-plus/test';
import axios from 'axios';
import { createChatApi } from '@eap/runtime-client';

it('preserves server null for ordinary chat and omits an unsupplied expert reference', async () => {
  let payload: unknown;
  const transport = axios.create({ adapter: async config => {
    payload = JSON.parse(config.data);
    return { data: { knowledgeContext: null, knowledgeMemoryCleared: false }, status: 200, statusText: 'OK', headers: {}, config };
  } });
  const answer = await createChatApi('/api', transport).sendAiMessage('c1', 'ordinary question', 'none');
  expect(payload).toEqual({ message: 'ordinary question', toolMode: 'none' });
  expect(answer.knowledgeContext).toBeNull(); expect(answer.knowledgeMemoryCleared).toBe(false);
});

it('serializes exact expert revision and draft through the shared client without injecting preview text', async () => {
  const requests: Array<{ url: string; data: unknown }> = [];
  const expertRef = { id: 'saved-expert', revision: 7 };
  const preview = { expertRef, status: 'ready', references: [{ id: 'K1', source: 'guide', knowledgeBase: 'rules', excerpt: 'untrusted excerpt', retrievalMode: 'keyword' }] };
  const transport = axios.create({ adapter: async config => {
    requests.push({ url: config.url!, data: config.data ? JSON.parse(config.data) : undefined });
    return { data: config.url?.endsWith('/preview') ? preview : { knowledgeContext: preview, knowledgeMemoryCleared: true }, status: 200, statusText: 'OK', headers: {}, config };
  } });
  const api = createChatApi('/api', transport);
  expect(await api.previewExpertContext(expertRef, 'original draft')).toEqual(preview);
  const context = { mode: 'chat' as const, expert: 'general' as const, instructions: '', reasoning: 'default' as const, approval: 'review' as const, files: [], prototypeVersionId: '', targetPath: '', knowledgeExpertRef: expertRef };
  const answer = await api.sendAiMessage('c1', 'original draft', 'none', context);
  expect(requests).toEqual([
    { url: '/ai/expert-context/preview', data: { expertRef, query: 'original draft' } },
    { url: '/ai/conversations/c1/messages', data: { message: 'original draft', toolMode: 'none', context } },
  ]);
  expect(answer.knowledgeContext).toEqual(preview);
  expect(answer.knowledgeMemoryCleared).toBe(true);
});
