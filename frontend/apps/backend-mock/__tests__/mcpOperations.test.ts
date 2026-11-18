import { expect, it } from 'vite-plus/test'
import { randomUUID } from 'node:crypto'
import { createMockMcpOperationBackend } from '../src/mcpOperationBackend'
import { createMockChatBackend } from '../src/chatBackend'
import type { McpOperationBinding, SpeechOperation } from '@eap/runtime-client/contracts'

const server = {
  id: 'speech-simulated',
  enabled: true,
  trusted: true,
  productionGrantedTools: ['simulate_asr', 'simulate_tts'],
}
const route = '/mcp-servers/speech-simulated/operation-bindings'
const bindings: McpOperationBinding[] = [
  {
    operation: 'ASR',
    tool: 'simulate_asr',
    expertId: 'mock-speech-expert',
    approved: true,
    inputSchema: {
      type: 'object',
      properties: { sound: { type: 'string' }, mime: { type: 'string' } },
      required: ['sound', 'mime'],
    },
    audioArgument: 'sound',
    mimeArgument: 'mime',
    textField: 'text',
    resultFormat: 'JSON',
  },
  {
    operation: 'TTS',
    tool: 'simulate_tts',
    expertId: 'mock-speech-expert',
    approved: true,
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    textArgument: 'text',
    audioField: 'audio',
    mimeField: 'mime',
    resultFormat: 'JSON',
  },
]
function wave() {
  const value = Buffer.alloc(44)
  value.write('RIFF')
  value.write('WAVE', 8)
  return value.toString('base64')
}
function setup(options: Parameters<typeof createMockMcpOperationBackend>[1] = {}) {
  const api = createMockMcpOperationBackend(() => [server], options)
  expect(api.handle('PUT', route, { expectedRevision: 0, bindings })?.status).toBe(200)
  return api
}
it('saves bindings with CAS, preserves on rejected shapes, and does not turn approval into a grant', () => {
  const api = setup()
  expect(api.handle('PUT', route, { expectedRevision: 0, bindings })?.status).toBe(409)
  expect(
    api.handle('PUT', route, { expectedRevision: 1, bindings: [bindings[0], bindings[0]] })?.status,
  ).toBe(400)
  expect(
    api.handle('PUT', route, { expectedRevision: 1, bindings, endpoint: 'http://other' })?.status,
  ).toBe(400)
  expect(
    api.handle('PUT', route, {
      expectedRevision: 1,
      bindings: [{ ...bindings[0], serverId: 'other' }],
    })?.status,
  ).toBe(400)
  expect(api.handle('GET', route)?.data).toEqual({ revision: 1, bindings })
  api.handle('PUT', route, {
    expectedRevision: 1,
    bindings: bindings.map((binding) => ({ ...binding, expertId: 'ungranted' })),
  })
  expect(api.handle('GET', '/ai/speech/services')?.data).toMatchObject({ services: [] })
})
it('deduplicates operations, rejects conflicting reuse, and returns explicit simulated media', () => {
  const api = setup()
  const request = {
    operationId: randomUUID(),
    serverId: server.id,
    audio: { mime: 'audio/wav', base64: wave() },
  }
  const first = api.handle('POST', '/ai/speech/transcriptions', request)!
  expect(first.status).toBe(200)
  expect(first.data).toMatchObject({
    status: 'SUCCEEDED',
    result: { text: expect.stringContaining('Simulated') },
  })
  expect(api.handle('POST', '/ai/speech/transcriptions', request)?.data).toEqual(first.data)
  expect(
    api.handle('POST', '/ai/speech/transcriptions', {
      audio: { base64: request.audio.base64, mime: request.audio.mime },
      serverId: request.serverId,
      operationId: request.operationId,
    })?.data,
  ).toEqual(first.data)
  expect(
    api.handle('POST', '/ai/speech/synthesis', {
      operationId: request.operationId,
      serverId: server.id,
      text: 'different operation',
    })?.status,
  ).toBe(409)
  const synthesized = api.handle('POST', '/ai/speech/synthesis', {
    operationId: randomUUID(),
    serverId: server.id,
    text: 'read explicitly',
  })!.data as SpeechOperation
  expect(synthesized.status).toBe('SUCCEEDED')
  expect(
    synthesized.result &&
      'audio' in synthesized.result &&
      Buffer.from(synthesized.result.audio.base64, 'base64').toString('ascii', 0, 4),
  ).toBe('RIFF')
})
it('supports running lookup, execution-scoped cancellation and expiry without resending', () => {
  let time = Date.parse('2026-01-01T00:00:00Z')
  const api = setup({ now: () => time, holdOperations: true })
  const operationId = randomUUID(),
    request = { operationId, serverId: server.id, text: 'hold simulated operation' }
  expect(api.handle('POST', '/ai/speech/synthesis', request)?.status).toBe(202)
  expect(api.handle('POST', '/ai/speech/synthesis', request)?.status).toBe(202)
  expect(api.handle('GET', '/ai/speech/operations/' + operationId)?.data).toMatchObject({
    status: 'RUNNING',
  })
  expect(api.handle('POST', '/ai/speech/' + operationId + '/cancel', {})?.data).toEqual({
    operationId,
    cancelRequested: true,
  })
  expect(api.handle('GET', '/ai/speech/operations/' + operationId)?.data).toMatchObject({
    status: 'CANCELLED',
    result: null,
  })
  time += 600001
  expect(api.handle('GET', '/ai/speech/operations/' + operationId)?.status).toBe(404)
})
it('rejects audio signatures, overlong text and arbitrary request fields', () => {
  const api = setup(),
    common = { operationId: randomUUID(), serverId: server.id }
  expect(
    api.handle('POST', '/ai/speech/transcriptions', {
      ...common,
      audio: { mime: 'audio/wav', base64: Buffer.from('not audio').toString('base64') },
    })?.data,
  ).toMatchObject({ status: 'FAILED', errorCode: 'MCP_SERVER_INPUT_INVALID', result: null })
  expect(
    api.handle('POST', '/ai/speech/synthesis', { ...common, text: 'x'.repeat(4001) })?.status,
  ).toBe(400)
  expect(
    api.handle('POST', '/ai/speech/synthesis', { ...common, text: 'x', expertId: 'caller-owned' })
      ?.status,
  ).toBe(400)
})
it('composes configuration and speech through the ordinary isolated Mock HTTP routes', async () => {
  const api = createMockChatBackend()
  expect((await api.handle('PUT', route, { expectedRevision: 0, bindings })).status).toBe(200)
  expect((await api.handle('GET', '/ai/speech/services')).data).toMatchObject({
    services: [{ serverId: server.id, transcription: true, synthesis: true }],
  })
})
