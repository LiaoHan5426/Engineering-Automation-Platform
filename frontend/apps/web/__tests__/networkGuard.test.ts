import { describe, expect, it } from 'vite-plus/test'
import { isTestOwnedNetworkTarget } from './networkGuard'
import { createServer } from 'node:http'
import axios from 'axios'

describe('test network isolation', () => {
  it('denies development services, external hosts and unowned loopback ports', () => {
    const ports = new Set(['127.0.0.1:45001'])
    for (const host of ['127.0.0.1', 'localhost', '::1']) {
      for (const port of [8080, 5173, 5174, 45002]) {
        expect(isTestOwnedNetworkTarget(host, port, ports)).toBe(false)
      }
    }
    expect(isTestOwnedNetworkTarget('example.com', 45001, ports)).toBe(false)
    expect(isTestOwnedNetworkTarget('192.0.2.1', 45001, ports)).toBe(false)
  })

  it('only permits loopback servers owned by this test worker', () => {
    const ports = new Set(['127.0.0.1:45001'])
    expect(isTestOwnedNetworkTarget('127.0.0.1', 45001, ports)).toBe(true)
    expect(isTestOwnedNetworkTarget('localhost', 45001, ports)).toBe(false)
    expect(isTestOwnedNetworkTarget('::1', 45001, ports)).toBe(false)
    ports.delete('127.0.0.1:45001')
    expect(isTestOwnedNetworkTarget('127.0.0.1', 45001, ports)).toBe(false)
  })

  it('does not grant another loopback address or wildcard from a fixture port', () => {
    const endpoints = new Set(['::1:45001', '0.0.0.0:45002', ':::45003'])
    expect(isTestOwnedNetworkTarget('::1', 45001, endpoints)).toBe(true)
    expect(isTestOwnedNetworkTarget('127.0.0.1', 45001, endpoints)).toBe(false)
    expect(isTestOwnedNetworkTarget('localhost', 45001, endpoints)).toBe(false)
    expect(isTestOwnedNetworkTarget('127.0.0.1', 45002, endpoints)).toBe(false)
    expect(isTestOwnedNetworkTarget('::1', 45003, endpoints)).toBe(false)
  })

  it('blocks fetch and Axios before connecting to the development backend', async () => {
    await expect(fetch('http://127.0.0.1:8080/api/ai/conversations/c1')).rejects.toMatchObject({
      cause: { code: 'EAP_TEST_NETWORK_BLOCKED' },
    })
    await expect(axios.get('http://localhost:8080/api/health')).rejects.toMatchObject({
      code: 'EAP_TEST_NETWORK_BLOCKED',
    })
  })

  it('allows an owned loopback fixture server through real fetch and Axios', async () => {
    const server = createServer((_request, response) => response.end('fixture'))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string') throw new Error('fixture did not listen')
      const url = `http://127.0.0.1:${address.port}`
      expect(await (await fetch(url)).text()).toBe('fixture')
      expect((await axios.get(url)).data).toBe('fixture')
      await expect(axios.get(`http://[::1]:${address.port}`)).rejects.toMatchObject({
        code: 'EAP_TEST_NETWORK_BLOCKED',
      })
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
