import { describe, expect, it } from 'vite-plus/test'
import {
  bindingDetail,
  bindingStatusLabel,
  bindingStatusTone,
  versionStatusLabel,
} from '../../../src/features/capability/trustedToolBindingView'

describe('trustedToolBindingView', () => {
  it('labels binding and version statuses', () => {
    expect(bindingStatusLabel('conflict')).toBe('绑定冲突')
    expect(bindingStatusTone('conflict')).toBe('danger')
    expect(versionStatusLabel('unknown')).toBe('版本未知')
    expect(bindingDetail({
      id: 'git-status',
      title: 'Git',
      kind: 'cli',
      scope: 'platform',
      readOnly: true,
      enabled: true,
      invocation: '',
      summary: '',
      bindingSource: 'shipped',
      binary: 'git',
      bindingNote: '版本未知（目录不自动探测）。',
    })).toContain('shipped')
  })
})
