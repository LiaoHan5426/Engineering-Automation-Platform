import { describe, expect, it } from 'vite-plus/test'
import {
  trustedStdoutNeedsCollapse,
  trustedStdoutPreview,
  trustedToolInvokeDetail,
  trustedToolInvokeFailure,
  trustedToolInvokeFailureMessage,
} from '../../../src/features/capability/trustedToolInvokeView'

describe('trustedToolInvokeView', () => {
  it('classifies denial, timeout and cancel semantics', () => {
    expect(
      trustedToolInvokeFailure({
        isAxiosError: true,
        response: { status: 403, data: { detail: 'CAPABILITY_DISABLED' } },
      }),
    ).toBe('denied')
    expect(
      trustedToolInvokeFailure({
        isAxiosError: true,
        response: { status: 504, data: { detail: 'TRUSTED_TOOL_TIMEOUT' } },
      }),
    ).toBe('timeout')
    expect(
      trustedToolInvokeFailure({
        isAxiosError: true,
        response: { status: 499, data: { detail: 'TRUSTED_TOOL_CANCELLED' } },
      }),
    ).toBe('cancelled')
    expect(trustedToolInvokeFailure({ name: 'AbortError' })).toBe('unknown')
    expect(
      trustedToolInvokeFailure({
        response: { status: 520, data: { detail: 'TRUSTED_TOOL_UNKNOWN' } },
      }),
    ).toBe('unknown')
  })

  it('exposes readable failure messages without tool payload bodies', () => {
    expect(
      trustedToolInvokeFailureMessage({
        isAxiosError: true,
        response: { status: 403, data: { detail: 'CAPABILITY_DISABLED' } },
      }),
    ).toContain('拒绝')
    expect(
      trustedToolInvokeFailureMessage({
        isAxiosError: true,
        response: { status: 504, data: { detail: 'TRUSTED_TOOL_TIMEOUT' } },
      }),
    ).toContain('超时')
    expect(
      trustedToolInvokeFailureMessage({
        response: { status: 520, data: { detail: 'TRUSTED_TOOL_UNKNOWN' } },
      }),
    ).toContain('未知')
  })

  it('exposes stable detail codes for invoke summary', () => {
    expect(
      trustedToolInvokeDetail({
        isAxiosError: true,
        response: { status: 403, data: { detail: 'CAPABILITY_DISABLED' } },
      }),
    ).toBe('CAPABILITY_DISABLED')
    expect(trustedToolInvokeDetail({ name: 'AbortError' })).toBe('CLIENT_WAIT_ABORTED')
    expect(trustedToolInvokeDetail({ response: { status: 499 } })).toBe('TRUSTED_TOOL_CANCELLED')
  })

  it('does not treat stopping HTTP wait as confirmed process cancellation', () => {
    for (const error of [{ name: 'AbortError' }, { isAxiosError: true, code: 'ERR_CANCELED' }]) {
      expect(trustedToolInvokeFailure(error)).toBe('unknown')
      expect(trustedToolInvokeFailureMessage(error)).toContain('已停止等待')
      expect(trustedToolInvokeFailureMessage(error)).toContain('未确认后台进程已取消')
      expect(trustedToolInvokeDetail(error)).toBe('CLIENT_WAIT_ABORTED')
    }
    expect(trustedToolInvokeFailure({ isAxiosError: true, code: 'ECONNABORTED' })).toBe('unknown')
    expect(trustedToolInvokeFailureMessage({ isAxiosError: true, code: 'ECONNABORTED' })).toContain(
      '结果未知',
    )
  })

  it('collapses long stdout and keeps short output inline', () => {
    expect(trustedStdoutNeedsCollapse('ok')).toBe(false)
    expect(
      trustedStdoutNeedsCollapse(Array.from({ length: 8 }, (_, i) => `L${i}`).join('\n')),
    ).toBe(true)
    expect(trustedStdoutNeedsCollapse('x'.repeat(480))).toBe(true)
    expect(trustedStdoutPreview('a\nb\nc\nd\ne', 3)).toBe('a · b · c · …')
  })
})
