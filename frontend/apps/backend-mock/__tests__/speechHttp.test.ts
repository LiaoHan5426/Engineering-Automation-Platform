import { expect, it } from 'vite-plus/test'
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import { createChatApi } from '@eap/runtime-client'
import { createMockHandler } from '../src/handler'

it('uses one HTTP contract for saved MCP speech bindings, availability and transient operations', async () => {
  const handler = createMockHandler()
  const requests: string[] = []
  const server = createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`)
    void handler(request, response)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No test port')
  try {
    const api = createChatApi(`http://127.0.0.1:${address.port}/api`)
    expect(await api.getMcpOperationBindings('speech-simulated')).toEqual({
      revision: 0,
      bindings: [],
    })
    await api.saveMcpOperationBindings('speech-simulated', {
      expectedRevision: 0,
      bindings: [
        {
          operation: 'TTS',
          tool: 'simulate_tts',
          expertId: 'mock-speech-expert',
          approved: true,
          inputSchema: {
            type: 'object',
            properties: { text: { type: 'string' } },
            required: ['text'],
          },
          textArgument: 'text',
          audioField: 'audio',
          mimeField: 'mime',
          resultFormat: 'JSON',
        },
      ],
    })
    await expect(
      api.saveMcpOperationBindings('speech-simulated', { expectedRevision: 0, bindings: [] }),
    ).rejects.toMatchObject({ response: { status: 409 } })
    const services = await api.speechServices()
    expect(services.limits.maxTranscriptChars).toBe(16000)
    expect(services.services).toEqual([
      {
        serverId: 'speech-simulated',
        transcription: false,
        synthesis: true,
        inputMimes: [],
        outputMimes: ['audio/wav'],
      },
    ])
    const request = {
      operationId: randomUUID(),
      serverId: 'speech-simulated',
      text: 'Explicit simulated synthesis',
    }
    const result = await api.synthesizeSpeech(request)
    expect(result).toMatchObject({
      operationId: request.operationId,
      status: 'SUCCEEDED',
      result: { audio: { mime: 'audio/wav' } },
    })
    expect(await api.getSpeechOperation(request.operationId)).toEqual(result)
    expect(await api.cancelSpeechOperation(request.operationId)).toEqual({
      operationId: request.operationId,
      cancelRequested: false,
    })
    expect(requests).toContain(`POST /api/ai/speech/${request.operationId}/cancel`)
    expect(requests).not.toContain(`POST /api/ai/speech/operations/${request.operationId}/cancel`)
    const missing = randomUUID(),
      before = requests.length
    await expect(api.getSpeechOperation(missing)).rejects.toMatchObject({
      response: { status: 404, data: { code: 'SPEECH_OPERATION_NOT_FOUND' } },
    })
    expect(requests.slice(before)).toEqual([`GET /api/ai/speech/operations/${missing}`])
    const controller = new AbortController()
    controller.abort()
    const count = requests.length
    await expect(
      api.synthesizeSpeech(
        { ...request, operationId: randomUUID() },
        { signal: controller.signal },
      ),
    ).rejects.toBeDefined()
    expect(requests).toHaveLength(count)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
      server.closeAllConnections()
    })
  }
})
