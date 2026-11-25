// @vitest-environment happy-dom
import { describe, expect, it } from 'vite-plus/test'
import { CLIENT_PACKAGE_APPLY } from '../src/client/assembly.ts'

describe('Cordis client package roster', () => {
  it('does not apply a dsh client UI package', () => {
    expect(CLIENT_PACKAGE_APPLY).toEqual([])
  })
})
