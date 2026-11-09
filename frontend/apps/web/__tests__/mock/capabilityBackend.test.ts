import { describe, expect, it } from 'vite-plus/test'
import { createMockCapabilityBackend } from '../../mock/capabilityBackend'

describe('mock capabilityBackend trusted git (TC-01)', () => {
  it('exposes FS-01 data-layout migration readiness without physical migration', async () => {
    const backend = createMockCapabilityBackend()
    const reply = await backend.handle('GET', '/runtime/data-layout')
    expect(reply?.status).toBe(200)
    expect(reply?.data).toMatchObject({
      physicalMigration: false,
      inventory: {
        present: 3,
        missing: 1,
        total: 4,
        byKind: { file: 1, directory: 2, missing: 1, other: 0 },
      },
      migrationReadiness: {
        approved: false,
        physicalMigration: false,
        candidateCounts: { present: 2, absent: 1, total: 3 },
      },
    })
    const entries = (
      reply?.data as {
        entries: Array<{ logical: string; kind?: string; byteSize?: number; exists: boolean }>
      }
    ).entries
    const probe = entries.find((item) => item.logical === 'cache/trusted-tool-probes')
    expect(probe).toMatchObject({ kind: 'file', byteSize: 48 })
    expect(entries.find((item) => item.logical === 'data-root')?.kind).toBe('directory')
    expect(entries.find((item) => item.logical === 'logs')).toMatchObject({
      exists: false,
      kind: 'missing',
    })
  })

  it('returns exitCode on successful mock git-status invoke', async () => {
    const backend = createMockCapabilityBackend()
    const reply = await backend.handle('POST', '/runtime/trusted-tools/git-status/invoke')
    expect(reply?.data).toMatchObject({
      capability: 'git-status',
      success: true,
      exitCode: 0,
    })
  })

  it('exposes probeCache summary that grows after explicit probe', async () => {
    const backend = createMockCapabilityBackend()
    await backend.handle('POST', '/runtime/trusted-tools/probe-cache/clear')
    const before = await backend.handle('GET', '/runtime/trusted-tools')
    expect(before?.data).toMatchObject({
      probeCache: { cached: 0, known: 0, failed: 0, newestProbedAt: '' },
    })
    await backend.handle('POST', '/runtime/trusted-tools/git-status/probe-version')
    const after = await backend.handle('GET', '/runtime/trusted-tools')
    expect(after?.data).toMatchObject({
      probeCache: {
        cached: 1,
        known: 1,
        failed: 0,
        newestProbedAt: '2026-11-07T04:00:00Z',
      },
    })
    await backend.handle('POST', '/runtime/trusted-tools/probe-cache/clear')
  })

  it('exposes four official readonly matrix packages including filesystem', async () => {
    const backend = createMockCapabilityBackend()
    const reply = await backend.handle('GET', '/capabilities')
    const matrix = (reply?.data as { mcpProductionMatrix: Array<{ packageAtVersion: string }> })
      .mcpProductionMatrix
    expect(matrix.map((item) => item.packageAtVersion)).toEqual([
      '@modelcontextprotocol/server-everything@2.2.1',
      '@modelcontextprotocol/server-sequential-thinking@0.6.2',
      '@modelcontextprotocol/server-memory@2025.11.25',
      '@modelcontextprotocol/server-filesystem@2025.11.25',
    ])
    const filesystem = matrix.find(
      (item) => item.packageAtVersion === '@modelcontextprotocol/server-filesystem@2025.11.25',
    ) as {
      readonlyTools?: string[]
      callVerifiedTools?: string[]
      listOnlyTools?: string[]
    }
    expect(filesystem?.readonlyTools).toEqual([
      'list_directory',
      'get_file_info',
      'search_files',
      'list_allowed_directories',
      'directory_tree',
    ])
    expect(filesystem?.callVerifiedTools).toEqual([
      'list_directory',
      'get_file_info',
      'search_files',
      'list_allowed_directories',
    ])
    expect(filesystem?.listOnlyTools).toEqual(['directory_tree'])
  })

  it('lists enabled git-status in the trusted catalog', async () => {
    const backend = createMockCapabilityBackend()
    const reply = await backend.handle('GET', '/runtime/trusted-tools')
    expect(reply?.status).toBe(200)
    const items = (reply?.data as { items: Array<{ id: string; enabled: boolean }> }).items
    expect(items.some((item) => item.id === 'git-status' && item.enabled)).toBe(true)
  })

  it('exposes executable Git operation snapshots and binding conflicts', async () => {
    const backend = createMockCapabilityBackend()
    await backend.handle('POST', '/runtime/trusted-tools/probe-cache/clear')
    const reply = await backend.handle('GET', '/runtime/trusted-tools')
    const items = (
      reply?.data as {
        items: Array<{ id: string; bindingStatus: string; versionStatus: string }>
      }
    ).items
    expect(items.find((item) => item.id === 'git-status')?.bindingStatus).toBe('ready')
    expect(items.find((item) => item.id === 'git-status')?.versionStatus).toBe('unknown')
    expect(items.find((item) => item.id === 'git-diff')?.bindingStatus).toBe('ready')
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
      catalog?.data as {
        items: Array<{ id: string; versionStatus: string; detectedVersion: string }>
      }
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
        items: Array<{
          id: string
          versionStatus: string
          detectedVersion: string
          bindingNote: string
        }>
      }
    ).items
    const status = items.find((item) => item.id === 'git-status')
    expect(status?.versionStatus).toBe('known')
    expect(status?.detectedVersion).toContain('2.45.1')
    expect(status?.bindingNote).toContain('持久化')
  })

  it('clears durable probe cache back to unknown without inventing versions', async () => {
    const backend = createMockCapabilityBackend()
    await backend.handle('POST', '/runtime/trusted-tools/git-status/probe-version')
    const cleared = await backend.handle('POST', '/runtime/trusted-tools/probe-cache/clear')
    expect(cleared?.status).toBe(200)
    expect(cleared?.data).toMatchObject({ remaining: 0 })
    const catalog = await backend.handle('GET', '/runtime/trusted-tools')
    const items = (
      catalog?.data as {
        items: Array<{ id: string; versionStatus: string; detectedVersion: string }>
      }
    ).items
    expect(items.find((item) => item.id === 'git-status')?.versionStatus).toBe('unknown')
    expect(items.find((item) => item.id === 'git-status')?.detectedVersion).toBe('')
  })

  it('maps mock version probe failure and conflict without inventing a version', async () => {
    const backend = createMockCapabilityBackend()
    const failed = await backend.handle(
      'POST',
      '/runtime/trusted-tools/git-status/probe-version?mockOutcome=fail',
    )
    expect(failed?.status).toBe(200)
    expect(failed?.data).toMatchObject({
      versionStatus: 'probe_failed',
      detectedVersion: '',
      success: false,
    })
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

  it('maps mockOutcome=unknown to TRUSTED_TOOL_UNKNOWN', async () => {
    const backend = createMockCapabilityBackend()
    const reply = await backend.handle(
      'POST',
      '/runtime/trusted-tools/git-status/invoke?mockOutcome=unknown',
    )
    expect(reply?.status).toBe(520)
    expect(reply?.data).toEqual({ detail: 'TRUSTED_TOOL_UNKNOWN' })
  })
})
