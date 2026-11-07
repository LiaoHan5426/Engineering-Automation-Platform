// @vitest-environment happy-dom
import { expect, it, vi } from 'vite-plus/test'
import childProcess from 'node:child_process'

it('blocks browser XHR test fixtures before they reach the live backend', async () => {
  const request = new XMLHttpRequest()
  const result = new Promise<string>((resolve) => {
    request.onerror = () => resolve('blocked')
    request.onload = () => resolve(`unexpected HTTP ${request.status}`)
  })
  request.open('GET', 'http://127.0.0.1:8080/api/ai/conversations/c1')
  request.send()
  expect(await result).toBe('blocked')
  expect(request.status).toBe(0)
})

it('rejects synchronous XHR before happy-dom can spawn an unguarded child', () => {
  const spawn = vi.spyOn(childProcess, 'execFileSync').mockImplementation(() => {
    throw new Error('safety sentinel: never start a child in this regression')
  })
  try {
    const request = new XMLHttpRequest()
    expect(() => {
      request.open('GET', 'http://127.0.0.1:8080/api/health', false)
      request.send()
    }).toThrow('EAP_TEST_SYNC_XHR_BLOCKED')
    expect(spawn).not.toHaveBeenCalled()
  } finally {
    spawn.mockRestore()
  }
})
