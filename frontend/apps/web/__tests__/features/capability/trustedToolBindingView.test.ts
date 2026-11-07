import { describe, expect, it } from 'vite-plus/test'
import {
  bindingDetail,
  bindingStatusCounts,
  bindingStatusLabel,
  bindingStatusTone,
  canProbeVersion,
  versionDetail,
  versionStatusLabel,
  versionStatusTone,
} from '../../../src/features/capability/trustedToolBindingView'

describe('trustedToolBindingView', () => {
  it('labels binding and version statuses', () => {
    expect(bindingStatusLabel('conflict')).toBe('绑定冲突')
    expect(bindingStatusTone('conflict')).toBe('danger')
    expect(versionStatusLabel('unknown')).toBe('版本未知')
    expect(versionStatusLabel('probe_failed')).toBe('探测失败')
    expect(versionStatusTone('known')).toBe('success')
    expect(versionStatusTone('probe_failed')).toBe('danger')
    expect(
      bindingDetail({
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
      }),
    ).toContain('shipped')
  })

  it('aggregates binding status counts for the trusted-tools summary', () => {
    expect(
      bindingStatusCounts([
        {
          id: 'git-status',
          title: 'Git',
          kind: 'cli',
          scope: 'platform',
          readOnly: true,
          enabled: true,
          invocation: '',
          summary: '',
          bindingStatus: 'ready',
        },
        {
          id: 'git-diff',
          title: 'Diff',
          kind: 'cli',
          scope: 'platform',
          readOnly: true,
          enabled: false,
          invocation: '',
          summary: '',
          bindingStatus: 'disabled',
        },
        {
          id: 'broken-cli',
          title: 'Broken',
          kind: 'cli',
          scope: 'platform',
          readOnly: true,
          enabled: true,
          invocation: '',
          summary: '',
          bindingStatus: 'conflict',
        },
        {
          id: 'missing',
          title: 'Missing',
          kind: 'cli',
          scope: 'platform',
          readOnly: true,
          enabled: true,
          invocation: '',
          summary: '',
          bindingStatus: 'missing_binary',
        },
      ]),
    ).toEqual({
      total: 4,
      ready: 1,
      disabled: 1,
      conflict: 1,
      missingBinary: 1,
      unknownVersion: 0,
      other: 0,
    })
  })

  it('allows probe only for ready CLI tools and surfaces writeback detail', () => {
    expect(
      canProbeVersion({
        id: 'git-status',
        title: 'Git',
        kind: 'cli',
        scope: 'platform',
        readOnly: true,
        enabled: true,
        invocation: '',
        summary: '',
        bindingStatus: 'ready',
        versionStatus: 'unknown',
      }),
    ).toBe(true)
    expect(
      canProbeVersion({
        id: 'broken-cli',
        title: 'Broken',
        kind: 'cli',
        scope: 'platform',
        readOnly: true,
        enabled: true,
        invocation: '',
        summary: '',
        bindingStatus: 'conflict',
        versionStatus: 'unknown',
      }),
    ).toBe(false)
    expect(
      versionDetail({
        id: 'git-status',
        title: 'Git',
        kind: 'cli',
        scope: 'platform',
        readOnly: true,
        enabled: true,
        invocation: '',
        summary: '',
        detectedVersion: 'git version 2.45.1',
        probedAt: '2026-11-07T04:00:00Z',
      }),
    ).toContain('git version 2.45.1')
  })
})
