// @vitest-environment happy-dom
import { expect, it, vi } from 'vite-plus/test';
const captured = vi.hoisted(() => [] as Array<{ url?: string; contentType: unknown; data: unknown }>);
vi.mock('axios', async importOriginal => {
  const actual = await importOriginal<typeof import('axios')>();
  const create = actual.default.create.bind(actual.default);
  vi.spyOn(actual.default, 'create').mockImplementation(config => create({ ...config, adapter: async request => {
    captured.push({ url: request.url, contentType: request.headers.getContentType(), data: request.data });
    return { status: 200, statusText: 'OK', headers: {}, config: request, data: {} };
  } }));
  return actual;
});
import { runtimeApi } from '@eap/runtime-client';
it('sends JSON for parameterless AI posts so the browser request guard does not reject them with 415', async () => {
  await runtimeApi.startChatGptLogin();
  await runtimeApi.refreshConnectionModels('connection');
  await runtimeApi.setDefaultModelConnection('connection');
  expect(captured).toHaveLength(3);
  for (const request of captured) {
    expect(request.contentType).toBe('application/json');
    expect(request.data).toBe('{}');
  }
});
