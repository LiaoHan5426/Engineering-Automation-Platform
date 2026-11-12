import { isLocalPreviewUrl } from '@eap/runtime-client'
export type PagePreview = { url: string; ready: boolean; denial: string }
export function resolvePagePreview(input: { url?: string }): PagePreview {
  if (!input.url) return { url: '', ready: false, denial: 'PREVIEW_ADDRESS_REQUIRED' }
  if (!isLocalPreviewUrl(input.url))
    return { url: '', ready: false, denial: 'PREVIEW_ADDRESS_INVALID' }
  return { url: input.url, ready: true, denial: '' }
}
export function pagePreviewMessageKey(preview: PagePreview): string {
  return preview.ready ? 'desktop.deliveryPreviewReady' : 'desktop.deliveryPreview'
}
