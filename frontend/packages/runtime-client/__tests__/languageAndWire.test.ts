// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import axios from 'axios'
import { createChatApi } from '../src/index'
import {
  configureRuntimeLanguage,
  platformErrorCode,
  CodeProposalStatus,
  isCodeProposalStatus,
  isToolExecutionStatusBlocking,
  ToolExecutionStatus,
  isBoardVerificationStatus,
  isBoardVerificationCheckStatus,
  validateToolExecution,
} from '../src/contracts/index'

afterEach(() => {
  configureRuntimeLanguage(() => 'zh-CN')
  vi.unstubAllGlobals()
})

it('retains the request language when the UI switches while an SSE response is pending', async () => {
  let language: 'zh-CN' | 'en-US' = 'en-US'
  configureRuntimeLanguage(() => language)
  let release!: (response: Response) => void
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    ),
  )
  const pending = createChatApi('http://local/api').sendAiMessage('conversation', 'message', 'none')
  language = 'zh-CN'
  release(
    new Response(
      'data: ' +
        JSON.stringify({
          eventId: 'e',
          executionId: 'run',
          conversationId: 'conversation',
          sequence: 1,
          type: 'final',
          protocolVersion: '1',
          occurredAt: new Date().toISOString(),
          text: '',
          code: 'AI_PROVIDER_ERROR',
          status: 'FAILED',
          message: 'Provider failed',
        }) +
        '\n\n',
      { headers: { 'Content-Type': 'text/event-stream' } },
    ),
  )
  expect((await pending).errorLanguage).toBe('en-US')
})
it('rejects malformed states without converting them into business uncertainty', () => {
  expect(isToolExecutionStatusBlocking(ToolExecutionStatus.UNKNOWN)).toBe(true)
  expect(isToolExecutionStatusBlocking(ToolExecutionStatus.CLOSED_UNKNOWN)).toBe(false)
  expect(isCodeProposalStatus(CodeProposalStatus.UNKNOWN)).toBe(true)
  expect(isCodeProposalStatus('unknown')).toBe(false)
  expect(isBoardVerificationStatus('TIMED_OUT')).toBe(false)
  expect(isBoardVerificationCheckStatus('TIMED_OUT')).toBe(true)
  const record = { status: 'not-a-state' }
  expect(() => validateToolExecution(record)).toThrow('INVALID_TOOL_EXECUTION_STATUS')
  expect(record.status).toBe('not-a-state')
})
it('reads exact error identity independently of translated text', () => {
  expect(
    platformErrorCode({
      response: { data: { code: 'FILE_CHANGED_SINCE_PROPOSAL', detail: 'changed' } },
    }),
  ).toBe('FILE_CHANGED_SINCE_PROPOSAL')
  expect(platformErrorCode({ response: { data: { detail: 'FILE_CHANGED_SINCE_PROPOSAL' } } })).toBe(
    '',
  )
  expect(platformErrorCode(new Error('FILE_CHANGED_SINCE_PROPOSAL'))).toBe('')
})
it('shares the current language between supplied Axios transports and SSE fetch', async () => {
  let language: 'zh-CN' | 'en-US' = 'en-US'
  configureRuntimeLanguage(() => language)
  const observed: string[] = []
  const transport = axios.create({
    adapter: async (config) => {
      observed.push(String(config.headers.get('Accept-Language')))
      return {
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data: { state: 'not_configured' },
      }
    },
  })
  const api = createChatApi('http://local/api', transport)
  await api.aiStatus()
  language = 'zh-CN'
  await api.aiStatus()
  expect(observed).toEqual(['en-US', 'zh-CN'])
  const event = {
    eventId: 'event',
    executionId: 'execution',
    conversationId: 'conversation',
    sequence: 1,
    type: 'final',
    protocolVersion: '1',
    occurredAt: new Date().toISOString(),
    text: '',
    code: 'AI_PROVIDER_ERROR',
    status: 'FAILED',
    message: '模型服务不可用',
    payload: { answer: '', error: 'AI_PROVIDER_ERROR', status: 'FAILED' },
  }
  const fetcher = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response('event: final\ndata: ' + JSON.stringify(event) + '\n\n', {
        headers: { 'Content-Type': 'text/event-stream', 'Content-Language': 'zh-CN' },
      }),
  )
  vi.stubGlobal('fetch', fetcher)
  const result = await api.sendAiMessage('conversation', 'message', 'none')
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ headers: { 'Accept-Language': 'zh-CN' } })
  expect(result.error).toBe('AI_PROVIDER_ERROR')
  expect(result.errorMessage).toBe('模型服务不可用')
  expect(result.errorLanguage).toBe('zh-CN')
})
