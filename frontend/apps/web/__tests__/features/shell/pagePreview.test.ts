import { describe, expect, it } from 'vite-plus/test'
import { pagePreviewMessageKey, resolvePagePreview } from '../../../src/features/shell/pagePreview'

describe('pagePreview', () => {
  it('preserves the explicitly registered route rather than guessing the chat page', () => {
    const value = 'http://127.0.0.1:5193/detail?view=delivery#form'
    expect(resolvePagePreview({ url: value })).toEqual({ url: value, ready: true, denial: '' })
  })

  it('refuses unknown or remote origins', () => {
    expect(resolvePagePreview({}).denial).toBe('PREVIEW_ADDRESS_REQUIRED')
    expect(resolvePagePreview({ url: 'https://app.example' }).denial).toBe(
      'PREVIEW_ADDRESS_INVALID',
    )
    const ready = resolvePagePreview({ url: 'http://127.0.0.1:5173/' })
    expect(ready.ready).toBe(true)
    expect(pagePreviewMessageKey(ready)).toBe('desktop.deliveryPreviewReady')
  })
  it.each([
    'javascript:alert(1)',
    'http://user:secret@localhost/',
    'http://localhost.example/',
    'http://localhost:0/',
    'file:///tmp/index.html',
  ])('refuses unsafe address %s', (url) => {
    expect(resolvePagePreview({ url }).ready).toBe(false)
  })
})
