// @vitest-environment happy-dom
import { expect, it, vi } from 'vite-plus/test';
const captured = vi.hoisted(() => [] as Array<{ url?: string; method?: string; data: unknown }>);
vi.mock('axios', async importOriginal => {
  const actual = await importOriginal<typeof import('axios')>();
  const create = actual.default.create.bind(actual.default);
  vi.spyOn(actual.default, 'create').mockImplementation(config => create({ ...config, adapter: async request => {
    captured.push({ url: request.url, method: request.method, data: request.data });
    return { status: 200, statusText: 'OK', headers: {}, config: request, data: { record: null, prepareAllowed: false, reason: 'UNAVAILABLE' } };
  } }));
  return actual;
});
import { runtimeApi } from '@eap/runtime-client';
it('uses the scoped delivery routes and sends only the explicit source and decision request contracts', async () => {
  const request = { projectId: 'project & one', revision: 4, workspacePath: 'F:/repo', requestId: 'request', paths: ['frontend/App.vue'], note: 'manual changes' };
  const decision = { projectId: request.projectId, revision: 5, requestId: 'decision', deliveryId: 'delivery', decision: 'ACCEPT' as const, criteriaConfirmed: true, previewConfirmed: true, comment: 'checked' };
  expect(await runtimeApi.boardDelivery('task/a', 'run/b', request.projectId)).toEqual({ record: null, prepareAllowed: false, reason: 'UNAVAILABLE' });
  await runtimeApi.submitBoardDelivery('task/a', 'run/b', request);
  await runtimeApi.decideBoardDelivery('task/a', 'run/b', decision);
  const route = '/board/tasks/task%2Fa/runs/run%2Fb/delivery';
  expect(captured).toEqual([
    { url: route + '?projectId=project%20%26%20one', method: 'get', data: undefined },
    { url: route, method: 'post', data: JSON.stringify(request) },
    { url: route + '/decision', method: 'post', data: JSON.stringify(decision) },
  ]);
});
it('preserves the optional application reference without adding source or hashes', async () => {
  captured.length = 0;
  const request = { projectId: 'p', revision: 1, workspacePath: 'F:/repo', requestId: '12345678-1234-1234-1234-123456789abc', paths: ['frontend/App.vue'], note: '', applicationRef: { conversationId: '22345678-1234-1234-1234-123456789abc', proposalId: '32345678-1234-1234-1234-123456789abc' } };
  await runtimeApi.submitBoardDelivery('task', 'run', request);
  expect(captured).toEqual([{ url: '/board/tasks/task/runs/run/delivery', method: 'post', data: JSON.stringify(request) }]);
});
