// @vitest-environment happy-dom
import { beforeEach, expect, it } from 'vite-plus/test'
import {
  publicationKey,
  readPublicationIntent,
  writePublicationIntent,
  clearPublicationIntent,
  type PublicationIntent,
} from '../../../src/features/shell/prototypePublication'
const intent = (): PublicationIntent => ({
  format: 1,
  status: 'unknown',
  request: {
    requestId: crypto.randomUUID(),
    sourceRef: 'builder-alpha',
    title: 'Design',
    body: '{}',
    acceptance: [],
  },
})
beforeEach(() => localStorage.clear())
it('preserves the exact request across reload and isolates the two designers', () => {
  const value = intent()
  writePublicationIntent(value)
  expect(readPublicationIntent('builder-alpha')).toEqual(value)
  expect(readPublicationIntent('builder-beta')).toBeNull()
  clearPublicationIntent('builder-alpha')
  expect(readPublicationIntent('builder-alpha')).toBeNull()
})
it('keeps malformed and cross-instance evidence instead of silently overwriting it', () => {
  const raw = JSON.stringify({
    ...intent(),
    request: { ...intent().request, sourceRef: 'builder-beta' },
  })
  localStorage.setItem(publicationKey('builder-alpha'), raw)
  expect(() => readPublicationIntent('builder-alpha')).toThrow('PUBLICATION_INTENT_INVALID')
  expect(localStorage.getItem(publicationKey('builder-alpha'))).toBe(raw)
})
it('requires confirmed browser writes before a request can be sent', () => {
  const storage = { setItem: () => {}, getItem: () => null } as unknown as Storage
  expect(() => writePublicationIntent(intent(), storage)).toThrow('WRITE_UNCONFIRMED')
})
it('does not claim evidence was cleared when browser storage retains it', () => {
  const value = intent()
  const raw = JSON.stringify(value)
  const storage = { removeItem: () => {}, getItem: () => raw } as unknown as Storage
  expect(() => clearPublicationIntent('builder-alpha', storage)).toThrow('CLEAR_UNCONFIRMED')
})
