// @vitest-environment happy-dom
import { describe, expect, it } from 'vite-plus/test'
import { CLIENT_PACKAGE_APPLY } from '../src/client/assembly.ts'

describe('Cordis client package roster', () => {
  it('documents real dsh-personal apply packages (not fake ui-slots apply)', () => {
    expect(CLIENT_PACKAGE_APPLY.map((p) => p.name)).toEqual([
      'ui-renderer',
      'ui-sidebar-right',
    ])
  })
})
