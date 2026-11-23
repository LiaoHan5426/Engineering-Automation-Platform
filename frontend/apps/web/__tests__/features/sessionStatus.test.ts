// @vitest-environment happy-dom
import { describe, expect, it } from 'vite-plus/test'
import {
  resolveSessionStatus,
  type SessionStatusItem,
  type SessionStatusBinding,
} from '../../src/features/shell/sessionStatus'

const item = (over: Partial<SessionStatusItem> = {}): SessionStatusItem => ({
  id: 's-1',
  draft: '',
  expired: false,
  ...over,
})

describe('resolveSessionStatus', () => {
  it('marks an expired session even when other hints exist', () => {
    expect(resolveSessionStatus(item({ expired: true, draft: 'unfinished' }), null)).toBe('expired')
  })

  it('marks an unsent local draft as draft', () => {
    expect(resolveSessionStatus(item({ draft: 'my unfinished text' }), null)).toBe('draft')
  })

  it('returns null when there is no local evidence', () => {
    expect(resolveSessionStatus(item(), null)).toBeNull()
  })

  it('uses the live binding only for the active session', () => {
    const binding: SessionStatusBinding = {
      activeId: 's-1',
      sending: true,
      busyIds: [],
      proposalFiles: [],
      appliedFiles: [],
      verificationChecks: [],
    }
    expect(resolveSessionStatus(item({ id: 's-1' }), binding)).toBe('running')
    // A different session must not inherit the active session's live state.
    expect(resolveSessionStatus(item({ id: 's-2' }), binding)).toBeNull()
  })

  it('ranks a pending candidate above a finished verification for the active session', () => {
    const binding: SessionStatusBinding = {
      activeId: 's-1',
      sending: false,
      busyIds: [],
      proposalFiles: ['src/App.vue'],
      appliedFiles: [],
      verificationChecks: [{ name: 'typecheck', exitCode: 0, summary: '' }],
    }
    expect(resolveSessionStatus(item({ id: 's-1' }), binding)).toBe('pending')
  })

  it('marks a fully verified active session as verified, never on exitCode=null', () => {
    const unknown: SessionStatusBinding = {
      activeId: 's-1',
      sending: false,
      busyIds: [],
      proposalFiles: [],
      appliedFiles: [],
      verificationChecks: [{ name: 'test', exitCode: null, summary: '' }],
    }
    expect(resolveSessionStatus(item({ id: 's-1' }), unknown)).toBeNull()

    const verified: SessionStatusBinding = {
      ...unknown,
      verificationChecks: [{ name: 'test', exitCode: 0, summary: '' }],
    }
    expect(resolveSessionStatus(item({ id: 's-1' }), verified)).toBe('verified')
  })

  it('treats an in-flight candidate as running rather than pending', () => {
    const binding: SessionStatusBinding = {
      activeId: 's-1',
      sending: false,
      busyIds: ['s-1'],
      proposalFiles: [],
      appliedFiles: [],
      verificationChecks: [],
    }
    expect(resolveSessionStatus(item({ id: 's-1' }), binding)).toBe('running')
  })
})
