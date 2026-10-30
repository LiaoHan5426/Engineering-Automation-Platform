import { expect, it } from 'vite-plus/test';
import { createMockChatBackend } from './chatBackend';
import type { AiConversation, ModelConnection, ModelConnectionList } from '@eap/runtime-client';

it('discovers models, preserves allowed selection and applies settings to conversations', async () => {
  const api = createMockChatBackend();
  const call = (path: string, body: Record<string, unknown> = {}) => api.handle('POST', path, body);
  const saved = (await call('/ai/connections', { name: 'DeepSeek UI fixture', baseUrl: 'https://api.deepseek.com', secret: 'example-not-a-real-key', defaultSelected: true })).data as ModelConnection;
  expect(saved).not.toHaveProperty('secret'); expect(saved.allowedModels).toEqual([]);
  const path = '/ai/connections/' + saved.id;
  const discovered = (await call(path + '/models/refresh')).data as ModelConnection;
  expect(discovered.models.map(item => item.id)).toEqual(['deepseek-chat', 'deepseek-reasoner']);
  expect(discovered.allowedModels).toEqual([]);
  const selection = { models: discovered.models, allowedModels: ['deepseek-reasoner'], defaultModel: 'deepseek-reasoner' };
  expect((await call(path + '/models', selection)).status).toBe(200);
  await call(path + '/models/refresh');
  expect(discovered.allowedModels).toEqual(['deepseek-reasoner']);
  const conversation = (await call('/ai/conversations')).data as AiConversation;
  expect(conversation.model).toBe('deepseek-reasoner'); expect(conversation.connectionId).toBe(saved.id);
  expect((await call('/ai/conversations/' + conversation.conversationId + '/connection', { connectionId: saved.id, model: 'deepseek-chat' })).status).toBe(403);
  await call(path + '/enabled', { enabled: false });
  expect((await call('/ai/conversations/' + conversation.conversationId + '/messages', { message: 'test' })).status).toBe(403);
  expect((await call(path + '/models', { ...selection, defaultModel: 'unknown' })).status).toBe(400);
});

it('simulates account authorization and disconnect without external login', async () => {
  const api = createMockChatBackend();
  const started = (await api.handle('POST', '/ai/chatgpt/login')).data as { loginId: string; authorizationUrl: string };
  expect(started.authorizationUrl).toBe('#mock-authorization');
  const state = (await api.handle('GET', '/ai/chatgpt/login/' + started.loginId)).data as { connectionId: string };
  await api.handle('POST', '/ai/connections/' + state.connectionId + '/models/refresh');
  const list = (await api.handle('GET', '/ai/connections')).data as ModelConnectionList;
  expect(list.items.find(item => item.id === state.connectionId)?.kind).toBe('chatgpt-plan');
  await api.handle('DELETE', '/ai/chatgpt/login/accounts/' + state.connectionId);
  expect(list.items.find(item => item.id === state.connectionId)?.enabled).toBe(false);
});
