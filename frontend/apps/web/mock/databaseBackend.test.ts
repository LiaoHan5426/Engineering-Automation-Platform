import { expect, it } from 'vite-plus/test';
import { createDatabaseBackend } from './databaseBackend';
it('saves independent metadata snapshots and removes them without executing database operations', () => {
  const backend = createDatabaseBackend();
  const call = (method: string, path: string, body: Record<string, unknown> = {}) => backend.handle(method, new URL(path, 'http://mock.local'), body)!;
  expect(call('POST', '/databases', {}).status).toBe(400);
  expect(call('POST', '/databases', { label: 'A', engine: 'PostgreSQL', environment: 'local', metadata: { password: 'fixture-only' } }).status).toBe(400);
  const metadata = { tables: [{ name: 'sample', columns: [] }], indexes: [] };
  const id = (call('POST', '/databases', { label: 'Local metadata', engine: 'PostgreSQL', environment: 'local', metadata }).data as { id: string }).id;
  metadata.tables[0]!.name = 'mutated caller';
  expect(call('GET', `/databases/${id}`).data).toMatchObject({ metadata: { tables: [{ name: 'sample' }] } });
  expect(call('GET', '/databases').data).toMatchObject({ items: [{ credentialsExposed: false }] });
  expect(call('PUT', `/databases/${id}`, { label: 'Renamed', engine: 'PostgreSQL', environment: 'local' }).status).toBe(200);
  expect(call('DELETE', `/databases/${id}`).status).toBe(200);
  expect(call('GET', `/databases/${id}`).status).toBe(404);
});
