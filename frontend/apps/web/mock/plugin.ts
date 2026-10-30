import type { Plugin } from 'vite-plus';
import { createMockChatBackend } from './chatBackend';

export function mockBackend(): Plugin {
  return {
    name: 'eap-mock-backend',
    apply: 'serve',
    configureServer(server) {
      const backend = createMockChatBackend();
      server.middlewares.use('/api', async (req, res) => {
        // This namespace never proxies to Java or any external model service.
        try {
          let raw = '';
          for await (const chunk of req) { raw += chunk.toString(); if (raw.length > 262144) { res.statusCode = 413; res.end(); return; } }
          const body = raw ? JSON.parse(raw) : {};
          const url = new URL(req.url ?? '/', 'http://mock.local');
          if (url.searchParams.has('connectionId')) body.connectionId = url.searchParams.get('connectionId');
          const reply = await backend.handle(req.method ?? 'GET', url.pathname + url.search, body);
          res.statusCode = reply.status; res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify(reply.data));
        } catch { res.statusCode = 400; res.end(JSON.stringify({ error: 'MOCK_BAD_REQUEST' })); }
      });
    },
  };
}
