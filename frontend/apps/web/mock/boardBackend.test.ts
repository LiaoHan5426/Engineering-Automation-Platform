import { randomUUID } from 'node:crypto';
import { expect, it } from 'vite-plus/test';
import { createMockChatBackend } from './chatBackend';
import type { BoardTask } from '@eap/runtime-client';
it('keeps board project scope and revisions authoritative without simulating a real run', async () => {
  const api = createMockChatBackend();
  const task = (await api.handle('POST', '/board/tasks', { requestId: randomUUID(), goal: 'goal', acceptanceCriteria: 'checks', projectId: 'group', title: 'draft' })).data as BoardTask;
  expect((await api.handle('GET', '/board/tasks?projectId=other')).data).toEqual({ items: [] });
  expect((await api.handle('POST', '/board/tasks/' + task.id, { projectId: 'group', revision: 2, column: 'ready' })).status).toBe(409);
  expect((await api.handle('POST', '/board/tasks/' + task.id, { projectId: 'group', revision: 1, column: 'ready' })).status).toBe(200);
  expect((await api.handle('POST', '/board/tasks/' + task.id, { projectId: 'group', revision: 2, column: 'running' })).status).toBe(409);
  expect((await api.handle('POST', '/board/tasks/' + task.id, { projectId: 'group', revision: 2, column: 'done' })).status).toBe(409);
});
it('persists priority with revision checks and allows initial ready but not initial execution', async () => {
  const api = createMockChatBackend();
  expect((await api.handle('POST', '/board/tasks', { requestId: randomUUID(), goal: 'goal', acceptanceCriteria: 'checks', projectId: 'group', title: 'invalid', column: 'running' })).status).toBe(400);
  const task = (await api.handle('POST', '/board/tasks', { requestId: randomUUID(), goal: 'goal', acceptanceCriteria: 'checks', projectId: 'group', title: 'ready draft', column: 'ready' })).data as BoardTask;
  expect(task.column).toBe('ready'); expect(task.priority).toBe('none');
  expect((await api.handle('POST', '/board/tasks/' + task.id, { projectId: 'group', revision: 1, priority: 'urgent' })).status).toBe(400);
  expect((await api.handle('POST', '/board/tasks/' + task.id, { projectId: 'group', revision: 1, priority: 'p0', notes: 'updated together' })).status).toBe(200);
  const rows = (await api.handle('GET', '/board/tasks?projectId=group')).data as { items: BoardTask[] };
  expect(rows.items[0]).toMatchObject({ priority: 'p0', notes: 'updated together', revision: 2, events: ['created', 'notes_updated', 'priority_updated'] });
  expect((await api.handle('POST', '/board/tasks/' + task.id, { projectId: 'group', revision: 1, priority: 'p2' })).status).toBe(409);
});

it('deduplicates retries after later edits and rejects reusing a request for other content', async () => {
  const api = createMockChatBackend();
  const draft = { requestId: randomUUID(), projectId: 'group', title: 'draft', goal: 'goal', acceptanceCriteria: 'checks' };
  const task = (await api.handle('POST', '/board/tasks', draft)).data as BoardTask;
  await api.handle('POST', '/board/tasks/' + task.id, { projectId: 'group', revision: 1, goal: 'edited' });
  const retry = await api.handle('POST', '/board/tasks', draft);
  expect(retry.data).toMatchObject({ id: task.id, revision: 2, goal: 'edited' });
  expect((await api.handle('POST', '/board/tasks', { ...draft, title: 'different' })).status).toBe(409);
  expect((await api.handle('GET', '/board/tasks?projectId=group')).data).toMatchObject({ items: [{ id: task.id }] });
  expect((await api.handle('POST', '/board/tasks/' + task.id, { projectId: 'other', revision: 2, notes: 'bad' })).status).toBe(404);
});
it('reports incomplete preparation and refuses ready without changing the saved draft', async () => {
  const api = createMockChatBackend();
  const draft = { requestId: randomUUID(), projectId: 'group', title: 'draft' };
  expect((await api.handle('POST', '/board/tasks', { ...draft, column: 'ready' })).status).toBe(409);
  const task = (await api.handle('POST', '/board/tasks', draft)).data as BoardTask;
  expect(task).toMatchObject({ preparationIssues: ['goal', 'acceptanceCriteria'], allowedColumns: ['planned'] });
  expect((await api.handle('POST', '/board/tasks/' + task.id, { projectId: 'group', revision: 1, column: 'ready' })).status).toBe(409);
  expect((await api.handle('POST', '/board/tasks/' + task.id, { projectId: 'group', revision: 1, column: 'ready', goal: 'goal', acceptanceCriteria: 'checks' })).status).toBe(200);
  expect((await api.handle('POST', '/board/tasks/' + task.id, { projectId: 'group', revision: 2, goal: '' })).status).toBe(409);
});

it('never fabricates verification plans or results for a nonexistent mock Run', async () => {
  const api = createMockChatBackend();
  const task = (await api.handle('POST', '/board/tasks', { requestId: randomUUID(), projectId: 'group', title: 'draft' })).data as BoardTask;
  const route = '/board/tasks/' + task.id + '/runs/' + randomUUID() + '/verification';
  expect(await api.handle('GET', route + '?projectId=group')).toMatchObject({ status: 404, data: { detail: 'BOARD_RUN_NOT_FOUND' } });
  expect(await api.handle('POST', route + '/plan', { projectId: 'group', workspacePath: '/sample' })).toMatchObject({ status: 404, data: { detail: 'BOARD_RUN_NOT_FOUND' } });
  expect(await api.handle('POST', route, { projectId: 'group', workspacePath: '/sample', planHash: 'hash' })).toMatchObject({ status: 404, data: { detail: 'BOARD_RUN_NOT_FOUND' } });
});
it('links only existing saved versions with project and revision checks', async () => {
  const api = createMockChatBackend();
  const version = (await api.handle('POST', '/prototype-versions', { sourceRef: 'builder-alpha', title: 'design', body: 'saved', buttonPresses: 0, acceptance: [] })).data as { id: string };
  const task = (await api.handle('POST', '/board/tasks', { requestId: randomUUID(), projectId: 'group', title: 'draft' })).data as BoardTask;
  const route = '/board/tasks/' + task.id + '/prototype';
  expect((await api.handle('POST', route, { projectId: 'group', revision: 1 })).status).toBe(400);
  expect((await api.handle('POST', route, { projectId: 'group', revision: 1, versionId: randomUUID() })).status).toBe(404);
  expect((await api.handle('POST', route, { projectId: 'other', revision: 1, versionId: version.id })).status).toBe(404);
  expect((await api.handle('POST', route, { projectId: 'group', revision: 1, versionId: version.id })).data).toMatchObject({ prototypeVersionId: version.id, revision: 2 });
  expect((await api.handle('POST', route, { projectId: 'group', revision: 1, versionId: null })).status).toBe(409);
  expect((await api.handle('POST', route, { projectId: 'group', revision: 2, versionId: null })).data).toMatchObject({ prototypeVersionId: null, revision: 3 });
});
