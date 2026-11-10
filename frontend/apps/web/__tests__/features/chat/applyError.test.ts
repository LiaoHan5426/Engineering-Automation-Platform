import { describe, expect, it } from 'vite-plus/test'
import { applyFailureCode, applyFailureMessage } from '../../../src/features/chat/applyError'

describe('applyFailure', () => {
  it('maps FILE_CHANGED_SINCE_PROPOSAL to conflict copy', () => {
    const error = {
      response: { data: { code: 'FILE_CHANGED_SINCE_PROPOSAL', detail: '文件已变化。' } },
    }
    expect(applyFailureCode(error)).toBe('FILE_CHANGED_SINCE_PROPOSAL')
    expect(applyFailureMessage(error, (key) => key)).toBe('task.applyConflict')
  })

  it('does not extract machine codes or arbitrary diagnostics from human messages', () => {
    expect(applyFailureCode(new Error('boom'))).toBe('')
    expect(applyFailureMessage(new Error('boom'), (key) => key)).not.toBe('boom')
    expect(
      applyFailureCode({ response: { data: { detail: 'FILE_CHANGED_SINCE_PROPOSAL' } } }),
    ).toBe('')
  })
})
