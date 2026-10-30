import { expect, it } from 'vite-plus/test';
import { createMockChatBackend } from './chatBackend';
import type { BoardTask } from '@eap/runtime-client';
it('keeps board project scope and revisions authoritative without simulating a real run', async () => {
  const api = createMockChatBackend();
  const task = (await api.handle('POST', '/board/tasks', { projectId: 'group', title: 'draft' })).data as BoardTask;
  expect((await api.handle('GET', '/board/tasks?projectId=other')).data).toEqual({ items: [] });
  expect((await api.handle('POST', '/board/tasks/' + task.id, { revision: 0, column: 'ready' })).status).toBe(409);
  expect((await api.handle('POST', '/board/tasks/' + task.id, { revision: 1, column: 'ready' })).status).toBe(200);
  expect((await api.handle('POST', '/board/tasks/' + task.id, { revision: 2, column: 'running' })).status).toBe(409);
  expect((await api.handle('POST', '/board/tasks/' + task.id, { revision: 2, column: 'done' })).status).toBe(409);
});
it('persists priority with revision checks and allows initial ready but not initial execution', async () => {
  const api = createMockChatBackend();
  expect((await api.handle('POST', '/board/tasks', { projectId: 'group', title: 'invalid', column: 'running' })).status).toBe(400);
  const task = (await api.handle('POST', '/board/tasks', { projectId: 'group', title: 'ready draft', column: 'ready' })).data as BoardTask;
  expect(task.column).toBe('ready'); expect(task.priority).toBe('none');
  expect((await api.handle('POST', '/board/tasks/' + task.id, { revision: 1, priority: 'urgent' })).status).toBe(400);
  expect((await api.handle('POST', '/board/tasks/' + task.id, { revision: 1, priority: 'p0', notes: 'updated together' })).status).toBe(200);
  const rows = (await api.handle('GET', '/board/tasks?projectId=group')).data as { items: BoardTask[] };
  expect(rows.items[0]).toMatchObject({ priority: 'p0', notes: 'updated together', revision: 2, events: ['created', 'notes_updated', 'priority_updated'] });
  expect((await api.handle('POST', '/board/tasks/' + task.id, { revision: 1, priority: 'p2' })).status).toBe(409);
});
