import { expect, it } from 'vite-plus/test'
import { createScenarioBackend } from '../../mock/scenarioBackend'

it('keeps the mock CAS and deletion contract without claiming database persistence', () => {
  const backend = createScenarioBackend()
  const url = new URL('http://mock.local/scenarios/custom-test')
  const definition = {
    name: 'Test',
    status: 'partial',
    modes: ['code'],
    summary: '',
    instructions: '',
    tools: [],
    skills: [],
    mcp: [],
    dependencies: [],
  }
  const body = { revision: 0, definition }
  expect(backend.handle('PUT', url, body)?.status).toBe(200)
  expect(backend.handle('PUT', url, body)?.status).toBe(409)
  const saved = backend.handle('GET', url, {})?.data
  expect(saved).toMatchObject({ id: 'custom-test', revision: 1, definition })
  expect(backend.handle('DELETE', new URL(url + '?revision=1'), {})?.status).toBe(200)
  expect(backend.handle('GET', url, {})?.status).toBe(404)
  expect(backend.handle('PUT', url, body)?.status).toBe(409)
  expect(
    backend.handle('PUT', new URL('http://mock.local/scenarios/prototype-to-code'), body)?.status,
  ).toBe(400)
  expect(backend.handle('GET', new URL('http://mock.local/scenarios'), {})?.data).toEqual({
    items: [],
  })
})

it('persists then returns 502 for mockOutcome=save-lost so clients can reconcile unknown', () => {
  const backend = createScenarioBackend()
  const url = new URL('http://mock.local/scenarios/custom-lost?mockOutcome=save-lost')
  const definition = {
    name: 'Lost',
    status: 'partial',
    modes: ['code'],
    summary: '',
    instructions: '',
    tools: [],
    skills: [],
    mcp: [],
    dependencies: [],
  }
  expect(backend.handle('PUT', url, { revision: 0, definition })?.status).toBe(502)
  const read = backend.handle('GET', new URL('http://mock.local/scenarios/custom-lost'), {})
  expect(read?.status).toBe(200)
  expect(read?.data).toMatchObject({ id: 'custom-lost', revision: 1 })
})
