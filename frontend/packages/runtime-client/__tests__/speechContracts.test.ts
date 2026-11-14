import { expect, it } from 'vite-plus/test'
import {
  isMcpOperationBinding,
  isMcpOperationBindingsSnapshot,
  isSpeechOperation,
  isSpeechServicesResponse,
} from '../src/contracts'
it('rejects mixed operation variants, writable endpoint pins and invalid schemas', () => {
  const binding = {
    operation: 'ASR',
    tool: 'transcribe',
    expertId: 'expert',
    approved: true,
    inputSchema: {
      type: 'object',
      properties: { audio: { type: 'string' }, mime: { type: 'string' } },
      required: ['audio', 'mime'],
    },
    audioArgument: 'audio',
    mimeArgument: 'mime',
    textField: 'text',
    resultFormat: 'TEXT',
  }
  expect(isMcpOperationBinding(binding)).toBe(true)
  expect(isMcpOperationBinding({ ...binding, resultFormat: 'AUDIO' })).toBe(false)
  expect(isMcpOperationBinding({ ...binding, endpoint: 'https://elsewhere' })).toBe(false)
  expect(isMcpOperationBinding({ ...binding, textArgument: 'text' })).toBe(false)
  expect(
    isMcpOperationBinding({ ...binding, inputSchema: { type: 'object', properties: {} } }),
  ).toBe(false)
  expect(isMcpOperationBindingsSnapshot({ revision: 1, bindings: [binding, binding] })).toBe(false)
})
it('rejects illegal speech states and result/kind mismatches instead of coercing UNKNOWN', () => {
  const operation = {
    operationId: 'operation',
    kind: 'transcription',
    status: 'SUCCEEDED',
    result: { text: 'recognized' },
    errorCode: null,
    expiresAt: '2026-01-01T00:00:00Z',
  }
  expect(isSpeechOperation(operation)).toBe(true)
  expect(isSpeechOperation({ ...operation, status: 'UNKNOWN' })).toBe(false)
  expect(isSpeechOperation({ ...operation, status: 'RUNNING' })).toBe(false)
  expect(isSpeechOperation({ ...operation, kind: 'synthesis' })).toBe(false)
  expect(isSpeechOperation({ ...operation, expiresAt: 'not a date' })).toBe(false)
})

it('accepts the final exact backend result union and rejects extra null or mixed fields', () => {
  const base = {
    operationId: 'operation',
    kind: 'transcription',
    status: 'SUCCEEDED',
    errorCode: null,
    expiresAt: '2026-01-01T00:00:00Z',
  }
  expect(isSpeechOperation({ ...base, result: { text: 'recognized', audio: null } })).toBe(false)
  expect(
    isSpeechOperation({
      ...base,
      kind: 'synthesis',
      result: { audio: { mime: 'audio/wav', base64: 'UklGRg==' } },
    }),
  ).toBe(true)
  expect(
    isSpeechOperation({
      ...base,
      result: { text: 'recognized', audio: { mime: 'audio/wav', base64: 'UklGRg==' } },
    }),
  ).toBe(false)
  expect(
    isSpeechOperation({ ...base, status: 'FAILED', errorCode: 'MCP_TOOL_FAILED', result: null }),
  ).toBe(true)
  expect(isSpeechOperation({ ...base, status: 'FAILED', errorCode: null, result: null })).toBe(
    false,
  )
  expect(isSpeechOperation({ ...base, status: 'RUNNING', errorCode: null, result: null })).toBe(
    true,
  )
})
it('requires explicit service flags and distinct transcription and synthesis limits', () => {
  const services = {
    services: [
      {
        serverId: 'speech',
        transcription: true,
        synthesis: false,
        inputMimes: ['audio/wav'],
        outputMimes: [],
      },
    ],
    limits: {
      maxAudioBytes: 4194304,
      maxWireBytes: 6291456,
      maxTextChars: 4000,
      maxTranscriptChars: 16000,
    },
  }
  expect(isSpeechServicesResponse(services)).toBe(true)
  expect(
    isSpeechServicesResponse({
      ...services,
      services: [{ ...services.services[0], transcription: 'true' }],
    }),
  ).toBe(false)
  expect(
    isSpeechServicesResponse({
      ...services,
      limits: { ...services.limits, maxTranscriptChars: undefined },
    }),
  ).toBe(false)
})

it('accepts SEARCH and READ only with their exact typed owner-policy schema', () => {
  const search = {
    operation: 'SEARCH',
    tool: 'search',
    expertId: 'expert',
    approved: true,
    inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    inputArgument: 'query',
    resultsField: '',
    titleField: 'title',
    urlField: 'url',
    textField: 'text',
  }
  expect(isMcpOperationBinding(search)).toBe(true)
  const read = {
    ...search,
    operation: 'READ',
    tool: 'read',
    inputArgument: 'url',
    ownerPolicyArgument: 'policy',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' }, policy: { type: 'object' } },
      required: ['url', 'policy'],
    },
  }
  expect(isMcpOperationBinding(read)).toBe(true)
  expect(isMcpOperationBinding({ ...search, ownerPolicyArgument: 'policy' })).toBe(false)
  expect(
    isMcpOperationBinding({
      ...read,
      inputSchema: {
        ...read.inputSchema,
        properties: { url: { type: 'string' }, policy: { type: 'string' } },
      },
    }),
  ).toBe(false)
})
