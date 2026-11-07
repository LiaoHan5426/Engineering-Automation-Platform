import { describe, expect, it } from 'vitest'
import {
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
    expect(trustedToolInvokeFailure({ name: 'AbortError' })).toBe('cancelled')
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
    expect(trustedToolInvokeDetail({ name: 'AbortError' })).toBe('CLIENT_ABORTED')
  })
})
