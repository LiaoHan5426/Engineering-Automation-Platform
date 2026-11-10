// @vitest-environment happy-dom
import { afterEach, expect, it } from 'vite-plus/test'
import { i18n } from '../../src/lib/i18n'
import { errorMessage, statusLabel } from '../../src/lib/presentation'
import {
  trustedToolInvokeFailure,
  trustedToolInvokeFailureMessage,
} from '../../src/features/capability/trustedToolInvokeView'
afterEach(() => {
  i18n.global.locale.value = 'zh-CN'
})
it('keeps translated display separate from business error classification', () => {
  const error = {
    response: { status: 409, data: { code: 'TRUSTED_TOOL_UNKNOWN', detail: '结果未确认。' } },
  }
  expect(trustedToolInvokeFailure(error)).toBe('unknown')
  expect(errorMessage(error)).toBe('结果未确认。')
  error.response.data.detail = 'Execution unconfirmed.'
  expect(trustedToolInvokeFailure(error)).toBe('unknown')
  expect(errorMessage(error)).toBe('Execution unconfirmed.')
})
it('switches local transport and status presentation without changing state or implying cancellation', () => {
  i18n.global.locale.value = 'en-US'
  expect(statusLabel('completed')).toBe('Completed')
  expect(trustedToolInvokeFailureMessage({ name: 'AbortError' })).toContain('unconfirmed')
  expect(errorMessage(new Error('private diagnostics'))).not.toContain('private diagnostics')
  i18n.global.locale.value = 'zh-CN'
  expect(statusLabel('completed')).toBe('已完成')
  expect(trustedToolInvokeFailureMessage({ name: 'AbortError' })).toContain('未确认')
})
