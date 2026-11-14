import { createHash } from 'node:crypto'
import {
  isMcpOperationBindingsSnapshot,
  McpErrors,
  SpeechErrors,
  ToolErrors,
  type McpOperationBindingsSnapshot,
  type SpeechOperation,
} from '@eap/runtime-client/contracts'

type Server = { id: string; enabled: boolean; trusted: boolean; productionGrantedTools: string[] }
const limits = {
  maxAudioBytes: 4194304,
  maxWireBytes: 6291456,
  maxTextChars: 4000,
  maxTranscriptChars: 16000,
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const response = (status: number, data: unknown) => ({ status, data })
const error = (status: number, code: string) => response(status, { code })
function exact(value: unknown, fields: string[]): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === fields.length &&
    Object.keys(value).every((key) => fields.includes(key))
  )
}
/** Explicit simulated tools. No MCP/provider network call, chat mutation, filesystem or persistent audio. */
export function createMockMcpOperationBackend(
  servers: () => readonly Server[],
  options: { now?: () => number; holdOperations?: boolean } = {},
) {
  const now = options.now ?? Date.now
  const bindings = new Map<string, McpOperationBindingsSnapshot>()
  const operations = new Map<string, { fingerprint: string; operation: SpeechOperation }>()
  function sweep() {
    for (const [id, value] of operations)
      if (Date.parse(value.operation.expiresAt) <= now()) operations.delete(id)
  }
  function available() {
    return servers().flatMap((server) => {
      if (!server.enabled || !server.trusted) return []
      const configured = bindings.get(server.id)?.bindings ?? []
      const permitted = (operation: 'ASR' | 'TTS') =>
        configured.some(
          (binding) =>
            binding.operation === operation &&
            binding.approved &&
            binding.expertId === 'mock-speech-expert' &&
            server.productionGrantedTools.includes(binding.tool),
        )
      const transcription = permitted('ASR'),
        synthesis = permitted('TTS')
      return transcription || synthesis
        ? [
            {
              serverId: server.id,
              transcription,
              synthesis,
              inputMimes: transcription ? ['audio/wav'] : [],
              outputMimes: synthesis ? ['audio/wav'] : [],
            },
          ]
        : []
    })
  }
  return {
    handle(method: string, path: string, body: unknown = {}) {
      const route = new URL(path, 'http://mock.local').pathname
      const bindingRoute = /^\/mcp-servers\/([^/]+)\/operation-bindings$/.exec(route)
      if (bindingRoute) {
        const id = decodeURIComponent(bindingRoute[1]!)
        if (!servers().some((server) => server.id === id))
          return error(404, McpErrors.MCP_SERVER_NOT_FOUND)
        const previous = bindings.get(id) ?? { revision: 0, bindings: [] }
        if (method === 'GET') return response(200, structuredClone(previous))
        if (method !== 'PUT') return undefined
        if (
          !exact(body, ['expectedRevision', 'bindings']) ||
          !isMcpOperationBindingsSnapshot({
            revision: body.expectedRevision,
            bindings: body.bindings,
          })
        )
          return error(400, McpErrors.MCP_SERVER_INPUT_INVALID)
        if (body.expectedRevision !== previous.revision)
          return error(409, ToolErrors.TOOL_BINDING_CHANGED)
        const next = {
          revision: previous.revision + 1,
          bindings: structuredClone(body.bindings),
        } as McpOperationBindingsSnapshot
        bindings.set(id, next)
        return response(200, structuredClone(next))
      }
      if (!route.startsWith('/ai/speech/')) return undefined
      sweep()
      if (method === 'GET' && route === '/ai/speech/services')
        return response(200, { services: available(), limits })
      const operationRoute = /^\/ai\/speech\/(?:operations\/([^/]+)|([^/]+)\/cancel)$/.exec(route)
      if (operationRoute) {
        const id = decodeURIComponent((operationRoute[1] ?? operationRoute[2])!),
          entry = operations.get(id)
        if (!entry) return error(404, SpeechErrors.SPEECH_OPERATION_NOT_FOUND)
        if (method === 'GET' && !operationRoute[2])
          return response(200, structuredClone(entry.operation))
        if (method === 'POST' && operationRoute[2]) {
          if (!exact(body, [])) return error(400, SpeechErrors.INVALID_SPEECH_REQUEST)
          const requested = entry.operation.status === 'RUNNING'
          if (requested) {
            entry.operation.status = 'CANCELLED'
            entry.operation.errorCode = SpeechErrors.SPEECH_CANCELLED
          }
          return response(200, { operationId: id, cancelRequested: requested })
        }
        return undefined
      }
      const kind =
        route === '/ai/speech/transcriptions'
          ? 'transcription'
          : route === '/ai/speech/synthesis'
            ? 'synthesis'
            : null
      if (method !== 'POST' || !kind) return undefined
      if (Buffer.byteLength(JSON.stringify(body)) > limits.maxWireBytes)
        return error(413, SpeechErrors.SPEECH_PAYLOAD_TOO_LARGE)
      if (
        !exact(body, ['operationId', 'serverId', kind === 'transcription' ? 'audio' : 'text']) ||
        typeof body.operationId !== 'string' ||
        !uuid.test(body.operationId) ||
        typeof body.serverId !== 'string' ||
        !/^[a-z0-9][a-z0-9_-]{0,60}$/.test(body.serverId)
      )
        return error(400, SpeechErrors.INVALID_SPEECH_REQUEST)
      let validAudio = true
      if (kind === 'transcription') {
        if (
          !exact(body.audio, ['mime', 'base64']) ||
          typeof body.audio.mime !== 'string' ||
          !body.audio.mime ||
          body.audio.mime.length > 100 ||
          typeof body.audio.base64 !== 'string'
        )
          return error(400, SpeechErrors.INVALID_SPEECH_REQUEST)
        const audio = Buffer.from(body.audio.base64, 'base64')
        if (
          !audio.length ||
          audio.length > limits.maxAudioBytes ||
          audio.toString('base64') !== body.audio.base64
        )
          return error(400, SpeechErrors.INVALID_SPEECH_REQUEST)
        validAudio =
          body.audio.mime === 'audio/wav' &&
          audio.toString('ascii', 0, 4) === 'RIFF' &&
          audio.toString('ascii', 8, 12) === 'WAVE'
      } else if (
        typeof body.text !== 'string' ||
        !body.text.trim() ||
        body.text.length > limits.maxTextChars
      )
        return error(400, SpeechErrors.INVALID_SPEECH_REQUEST)
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            kind,
            serverId: body.serverId,
            material:
              kind === 'transcription'
                ? {
                    mime: (body.audio as { mime: string }).mime,
                    base64: (body.audio as { base64: string }).base64,
                  }
                : body.text,
          }),
        )
        .digest('hex')
      const previous = operations.get(body.operationId)
      if (previous)
        return previous.fingerprint === fingerprint
          ? response(
              previous.operation.status === 'RUNNING' ? 202 : 200,
              structuredClone(previous.operation),
            )
          : error(409, SpeechErrors.SPEECH_OPERATION_CONFLICT)
      if (
        [...operations.values()].filter((entry) => entry.operation.status === 'RUNNING').length >= 2
      )
        return error(429, SpeechErrors.SPEECH_CAPACITY_EXCEEDED)
      if (operations.size >= 64) {
        const terminal = [...operations].find(([, entry]) => entry.operation.status !== 'RUNNING')
        if (terminal) operations.delete(terminal[0])
        else return error(429, SpeechErrors.SPEECH_CAPACITY_EXCEEDED)
      }
      const service = available().find((service) => service.serverId === body.serverId)
      const allowed =
        validAudio && (kind === 'transcription' ? service?.transcription : service?.synthesis)
      const operation: SpeechOperation = {
        operationId: body.operationId,
        kind,
        status: !allowed ? 'FAILED' : options.holdOperations ? 'RUNNING' : 'SUCCEEDED',
        result: null,
        errorCode: allowed
          ? null
          : validAudio
            ? SpeechErrors.SPEECH_SERVICE_UNAVAILABLE
            : McpErrors.MCP_SERVER_INPUT_INVALID,
        expiresAt: new Date(now() + 600000).toISOString(),
      }
      if (operation.status === 'SUCCEEDED')
        operation.result =
          kind === 'transcription'
            ? { text: 'Simulated transcription from Mock; no provider was called.' }
            : { audio: { mime: 'audio/wav', base64: simulatedWave().toString('base64') } }
      operations.set(operation.operationId, { fingerprint, operation })
      return response(operation.status === 'RUNNING' ? 202 : 200, structuredClone(operation))
    },
  }
}
/** Valid short silent PCM WAV fixture, explicitly simulated rather than synthesized speech. */
function simulatedWave() {
  const data = Buffer.alloc(204)
  data.write('RIFF', 0)
  data.writeUInt32LE(196, 4)
  data.write('WAVEfmt ', 8)
  data.writeUInt32LE(16, 16)
  data.writeUInt16LE(1, 20)
  data.writeUInt16LE(1, 22)
  data.writeUInt32LE(8000, 24)
  data.writeUInt32LE(16000, 28)
  data.writeUInt16LE(2, 32)
  data.writeUInt16LE(16, 34)
  data.write('data', 36)
  data.writeUInt32LE(160, 40)
  return data
}
