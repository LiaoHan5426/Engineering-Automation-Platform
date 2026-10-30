import { createServer } from 'node:http';
import { expect, it } from 'vite-plus/test';
import { createChatApi } from '@eap/runtime-client';
import { createMockChatBackend } from './chatBackend';

it('uses the shared runtime HTTP client for models, conversation, message and proposal confirmation', async () => {
  const backend = createMockChatBackend();
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk.toString();
    const reply = await backend.handle(req.method ?? 'GET', req.url ?? '/', raw ? JSON.parse(raw) : {});
    res.statusCode = reply.status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(reply.data));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing test server port');
    const api = createChatApi(`http://127.0.0.1:${address.port}`);
    expect((await api.modelConnections()).items[0]?.allowedModels).toContain('general-demo');
    const conversation = await api.openAiConversation();
    const assigned = await api.assignConversationConnection(conversation.conversationId, 'mock-local', true, 'general-demo');
    expect(assigned.model).toBe('general-demo');
    const response = await api.sendAiMessage(conversation.conversationId, 'Review a candidate', 'none', { mode: 'code', expert: 'frontend', instructions: '', reasoning: 'default', approval: 'review', files: [], prototypeVersionId: '', targetPath: '' });
    expect(response.proposal?.files[0]?.path).toBe('Example.vue');
    expect(response.proposal?.files[0]?.baseHash).toBe('');
    await expect(api.applyCodeProposal(conversation.conversationId, response.proposal!.id)).rejects.toMatchObject({ response: { status: 409 } });
    await api.deleteAiConversation(conversation.conversationId);
    await expect(api.aiConversation(conversation.conversationId)).rejects.toMatchObject({ response: { status: 404 } });
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
