import type { PrototypePublicationRequest } from '@eap/runtime-client'
import type { DesignerSource } from './prototypeDrafts'

export type PublicationIntent = {
  format: 1
  request: PrototypePublicationRequest
  status: 'unknown' | 'absent'
}
export const publicationKey = (source: DesignerSource) => 'eap.prototype-publication.v1.' + source
export function readPublicationIntent(
  source: DesignerSource,
  storage: Storage = localStorage,
): PublicationIntent | null {
  const raw = storage.getItem(publicationKey(source))
  if (!raw) return null
  try {
    if (raw.length > 200000) throw new Error()
    const value = JSON.parse(raw) as PublicationIntent
    const request = value.request
    if (
      value.format !== 1 ||
      !['unknown', 'absent'].includes(value.status) ||
      !request ||
      request.sourceRef !== source ||
      !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(request.requestId) ||
      typeof request.title !== 'string' ||
      typeof request.body !== 'string' ||
      request.body.length > 160000 ||
      !Array.isArray(request.acceptance) ||
      !request.acceptance.every((item) => typeof item === 'string')
    )
      throw new Error()
    return value
  } catch {
    throw new Error('PUBLICATION_INTENT_INVALID')
  }
}
export function writePublicationIntent(intent: PublicationIntent, storage: Storage = localStorage) {
  const raw = JSON.stringify(intent)
  if (raw.length > 200000) throw new Error('PUBLICATION_INTENT_TOO_LARGE')
  storage.setItem(publicationKey(intent.request.sourceRef), raw)
  if (storage.getItem(publicationKey(intent.request.sourceRef)) !== raw)
    throw new Error('PUBLICATION_INTENT_WRITE_UNCONFIRMED')
}
export function clearPublicationIntent(source: DesignerSource, storage: Storage = localStorage) {
  storage.removeItem(publicationKey(source))
  if (storage.getItem(publicationKey(source)) !== null)
    throw new Error('PUBLICATION_INTENT_CLEAR_UNCONFIRMED')
}
