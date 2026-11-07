import { describe, expect, it } from 'vitest'
import { createMockCapabilityBackend } from '../../mock/capabilityBackend'

describe('mock capabilityBackend trusted git (TC-01)', () => {
  it('exposes FS-01 data-layout migration readiness without physical migration', async () => {
    const backend = createMockCapabilityBackend()
    const reply = await backend.handle('GET', '/runtime/data-layout')
    expect(reply?.status).toBe(200)
    expect(reply?.data).toMatchObject({
      physicalMigration: false,
      migrationReadiness: { approved: false, physicalMigration: false },
    })
    const entries = (reply?.data as { entries: Array<{ logical: string }> }).entries
    expect(entries.some((item) => item.logical === 'cache/trusted-tool-probes')).toBe(true)
  })

  it('exposes three official readonly matrix packages including memory', async () => {
    const backend = createMockCapabilityBackend()
    const reply = await backend.handle('GET', '/capabilities')
    const matrix = (reply?.data as { mcpProductionMatrix: Array<{ packageAtVersion: string }> })
      .mcpProductionMatrix
    expect(matrix.map((item) => item.packageAtVersion)).toEqual([
      '@modelcontextprotocol/server-everything@2.2.1',
      '@modelcontextprotocol/server-sequential-thinking@0.6.2',
      '@modelcontextprotocol/server-memory@2025.11.25',
    ])
  })

  it('lists enabled git-status in the trusted catalog', async () => {
    const backend = createMockCapabilityBackend()
    const reply = await backend.handle('GET', '/runtime/trusted-tools')
    expect(reply?.status).toBe(200)
    const items = (reply?.data as { items: Array<{ id: string; enabled: boolean }> }).items
    expect(items.some((item) => item.id === 'git-status' && item.enabled)).toBe(true)
  })

  it('exposes binding status snapshots for ready disabled and conflict tools', async () => {
    const backend = createMockCapabilityBackend()
    const reply = await backend.handle('GET', '/runtime/trusted-tools')
    const items = (
      reply?.data as {
        items: Array<{ id: string; bindingStatus: string; versionStatus: string }>
      }
    ).items
    expect(items.find((item) => item.id === 'git-status')?.bindingStatus).toBe('ready')
    expect(items.find((item) => item.id === 'git-status')?.versionStatus).toBe('unknown')
    expect(items.find((item) => item.id === 'git-diff')?.bindingStatus).toBe('disabled')
    expect(items.find((item) => item.id === 'broken-cli')?.bindingStatus).toBe('conflict')
  })

  it('writes known version back into the mock catalog after an explicit probe', async () => {
    const backend = createMockCapabilityBackend()
    const probe = await backend.handle('POST', '/runtime/trusted-tools/git-status/probe-version')
    expect(probe?.status).toBe(200)
    expect(probe?.data).toMatchObject({
      id: 'git-status',
      versionStatus: 'known',
      detectedVersion: 'git version 2.45.1 (mock)',
      success: true,
    })
    const catalog = await backend.handle('GET', '/runtime/trusted-tools')
    const items = (
      catalog?.data as { items: Array<{ id: string; versionStatus: string; detectedVersion: string }> }
    ).items
    expect(items.find((item) => item.id === 'git-status')?.versionStatus).toBe('known')
    expect(items.find((item) => item.id === 'git-status')?.detectedVersion).toContain('2.45.1')
  })

  it('keeps durable probe writeback across remounted mock backends', async () => {
    const first = createMockCapabilityBackend()
    await first.handle('POST', '/runtime/trusted-tools/git-status/probe-version')
    const remounted = createMockCapabilityBackend()
    const catalog = await remounted.handle('GET', '/runtime/trusted-tools')
    const items = (
      catalog?.data as {
        items: Array<{ id: string; versionStatus: string; detectedVersion: string; bindingNote: string }>
      }
    ).items
    const status = items.find((item) => item.id === 'git-status')
    expect(status?.versionStatus).toBe('known')
    expect(status?.detectedVersion).toContain('2.45.1')
    expect(status?.bindingNote).toContain('持久化')
  })

  it('maps mock version probe failure and conflict without inventing a version', async () => {
    const backend = createMockCapabilityBackend()
    const failed = await backend.handle(
      'POST',
      '/runtime/trusted-tools/git-status/probe-version?mockOutcome=fail',
    )
    expect(failed?.status).toBe(200)
    expect(failed?.data).toMatchObject({ versionStatus: 'probe_failed', detectedVersion: '', success: false })
    const conflict = await backend.handle('POST', '/runtime/trusted-tools/broken-cli/probe-version')
    expect(conflict?.status).toBe(409)
  })

  it('returns a successful mock git-status payload', async () => {
    const backend = createMockCapabilityBackend()
    const reply = await backend.handle('POST', '/runtime/trusted-tools/git-status/invoke')
    expect(reply?.status).toBe(200)
    expect(reply?.data).toMatchObject({ capability: 'git-status', success: true })
  })

  it('maps mockOutcome=denied to CAPABILITY_DISABLED', async () => {
    const backend = createMockCapabilityBackend()
    const reply = await backend.handle(
      'POST',
      '/runtime/trusted-tools/git-status/invoke?mockOutcome=denied',
    )
    expect(reply?.status).toBe(403)
    expect(reply?.data).toEqual({ detail: 'CAPABILITY_DISABLED' })
  })

  it('maps mockOutcome=timeout to TRUSTED_TOOL_TIMEOUT', async () => {
    const backend = createMockCapabilityBackend()
    const reply = await backend.handle(
      'POST',
      '/runtime/trusted-tools/git-status/invoke?mockOutcome=timeout',
    )
    expect(reply?.status).toBe(504)
    expect(reply?.data).toEqual({ detail: 'TRUSTED_TOOL_TIMEOUT' })
  })

  it('maps mockOutcome=cancelled to TRUSTED_TOOL_CANCELLED', async () => {
    const backend = createMockCapabilityBackend()
    const reply = await backend.handle(
      'POST',
      '/runtime/trusted-tools/git-status/invoke?mockOutcome=cancelled',
    )
    expect(reply?.status).toBe(499)
    expect(reply?.data).toEqual({ detail: 'TRUSTED_TOOL_CANCELLED' })
  })
})
