import { expect, it } from 'vite-plus/test'
import { isDraftSubmitKey } from '../../../src/features/chat/draftKeys'

it('treats a plain Enter as the send key', () => {
  expect(isDraftSubmitKey({ key: 'Enter' })).toBe(true)
})

it('keeps Shift+Enter for a newline', () => {
  expect(isDraftSubmitKey({ key: 'Enter', shiftKey: true })).toBe(false)
})

it('never sends while an IME candidate window is open', () => {
  expect(isDraftSubmitKey({ key: 'Enter', isComposing: true })).toBe(false)
  // Safari reports the confirming Enter as 229 before isComposing is set.
  expect(isDraftSubmitKey({ key: 'Enter', keyCode: 229 })).toBe(false)
})

it('ignores every other key', () => {
  expect(isDraftSubmitKey({ key: 'a' })).toBe(false)
  expect(isDraftSubmitKey({ key: 'Escape' })).toBe(false)
})
