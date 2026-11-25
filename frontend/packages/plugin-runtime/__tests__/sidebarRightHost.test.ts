// @vitest-environment happy-dom
/**
 * The right column is a shell outlet. A DSH guide attribute is not part of boot.
 */
import { describe, expect, it } from 'vite-plus/test'
import { CLIENT_PACKAGE_APPLY } from '../src/client/assembly.ts'

describe('sidebar-right contract', () => {
  it('does not apply a dsh client package from the shell', () => {
    expect(CLIENT_PACKAGE_APPLY).toEqual([])
  })
})
