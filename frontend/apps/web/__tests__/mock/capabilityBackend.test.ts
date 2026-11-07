import { describe, expect, it } from 'vitest'
import { createMockCapabilityBackend } from '../../mock/capabilityBackend'

describe('mock capabilityBackend trusted git (TC-01)', () => {
  it('lists enabled git-status in the trusted catalog', async () => {
    const backend = createMockCapabilityBackend()
    const reply = await backend.handle('GET', '/runtime/trusted-tools')
    expect(reply?.status).toBe(200)
    const items = (reply?.data as { items: Array<{ id: string; enabled: boolean }> }).items
    expect(items.some((item) => item.id === 'git-status' && item.enabled)).toBe(true)
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
