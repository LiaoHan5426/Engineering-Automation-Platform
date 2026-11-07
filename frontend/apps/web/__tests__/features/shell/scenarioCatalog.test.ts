// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { reactive } from 'vue'
import { runtimeApi, type ScenarioSnapshot } from '@eap/runtime-client'
import { createScenarioCatalog } from '../../../src/features/shell/scenarioCatalog'
import type { Scenario } from '../../../src/features/shell/workbench'

const definition = {
  name: 'Saved scene',
  status: 'partial' as const,
  modes: ['code' as const],
  summary: '',
  instructions: 'guidance',
  tools: [],
  skills: [],
  mcp: [],
  dependencies: [],
}
const snapshot: ScenarioSnapshot = { id: 'custom-test', revision: 1, definition }
afterEach(() => vi.restoreAllMocks())
it('reads saved copies without replacing presets or unsaved local edits', async () => {
  const scenes = reactive<Scenario[]>([
    { ...definition, id: 'preset' },
    { ...definition, id: 'custom-local', builtin: false, name: 'Unsaved' },
  ])
  vi.spyOn(runtimeApi, 'scenarios').mockResolvedValue({ items: [snapshot] })
  const catalog = createScenarioCatalog(scenes)
  await catalog.load()
  expect(scenes.map((s) => s.id)).toEqual(['preset', 'custom-local', 'custom-test'])
  expect(scenes[2]?.builtin).toBe(false)
  scenes[2]!.name = 'Draft edit'
  await catalog.load()
  expect(scenes[2]?.name).toBe('Draft edit')
})
it('saves an explicit copy with CAS and reads the exact target back', async () => {
  const scene: Scenario = { ...definition, id: snapshot.id, builtin: false }
  const scenes = reactive<Scenario[]>([scene])
  const save = vi.spyOn(runtimeApi, 'saveScenario').mockResolvedValue(snapshot)
  const read = vi.spyOn(runtimeApi, 'scenario').mockResolvedValue(snapshot)
  const catalog = createScenarioCatalog(scenes)
  expect(await catalog.save(scenes[0]!)).toBe(true)
  expect(save).toHaveBeenCalledWith(snapshot.id, 0, definition)
  expect(read).toHaveBeenCalledWith(snapshot.id)
  expect(catalog.revision(snapshot.id)).toBe(1)
})
it('retains edits and refuses deletion on revision conflict', async () => {
  const scenes = reactive<Scenario[]>([])
  vi.spyOn(runtimeApi, 'scenarios').mockResolvedValue({ items: [snapshot] })
  const catalog = createScenarioCatalog(scenes)
  await catalog.load()
  scenes[0]!.instructions = 'Keep this unsaved edit'
  vi.spyOn(runtimeApi, 'saveScenario').mockRejectedValue({ response: { status: 409 } })
  vi.spyOn(runtimeApi, 'deleteScenario').mockRejectedValue({ response: { status: 409 } })
  expect(await catalog.save(scenes[0]!)).toBe(false)
  expect(catalog.state.error).toBe('conflict')
  expect(await catalog.remove(scenes[0]!)).toBe(false)
  expect(scenes[0]?.instructions).toBe('Keep this unsaved edit')
  expect(catalog.revision(snapshot.id)).toBe(1)
})
it('never turns a failed catalog request into mock data or a saved status', async () => {
  const scenes = reactive<Scenario[]>([])
  vi.spyOn(runtimeApi, 'scenarios').mockRejectedValue(new Error('offline'))
  const catalog = createScenarioCatalog(scenes)
  await catalog.load()
  expect(catalog.state.error).toBe('load')
  expect(catalog.state.loaded).toBe(false)
  expect(scenes).toEqual([])
})

it('reconciles lost save writeback before deleting a zero-revision custom scene', async () => {
  const scene: Scenario = { ...definition, id: snapshot.id, builtin: false }
  const scenes = reactive<Scenario[]>([scene])
  const catalog = createScenarioCatalog(scenes)
  const read = vi.spyOn(runtimeApi, 'scenario').mockResolvedValue(snapshot)
  const del = vi.spyOn(runtimeApi, 'deleteScenario').mockResolvedValue(undefined as never)
  expect(catalog.revision(snapshot.id)).toBe(0)
  expect(await catalog.remove(scenes[0]!)).toBe(true)
  expect(read).toHaveBeenCalledWith(snapshot.id)
  expect(del).toHaveBeenCalledWith(snapshot.id, 1)
  expect(scenes).toEqual([])
})

it('keeps the local scene when zero-revision delete reconciliation is unknown', async () => {
  const scene: Scenario = { ...definition, id: 'orphan-draft', builtin: false }
  const scenes = reactive<Scenario[]>([scene])
  const catalog = createScenarioCatalog(scenes)
  vi.spyOn(runtimeApi, 'scenario').mockRejectedValue({ response: { status: 500 } })
  const del = vi.spyOn(runtimeApi, 'deleteScenario')
  expect(await catalog.remove(scenes[0]!)).toBe(false)
  expect(catalog.state.error).toBe('unknown')
  expect(del).not.toHaveBeenCalled()
  expect(scenes).toHaveLength(1)
})

it('removes a pure local draft when the server has no matching scene', async () => {
  const scene: Scenario = { ...definition, id: 'pure-draft', builtin: false }
  const scenes = reactive<Scenario[]>([scene])
  const catalog = createScenarioCatalog(scenes)
  vi.spyOn(runtimeApi, 'scenario').mockRejectedValue({ response: { status: 404 } })
  const del = vi.spyOn(runtimeApi, 'deleteScenario')
  expect(await catalog.remove(scenes[0]!)).toBe(true)
  expect(del).not.toHaveBeenCalled()
  expect(scenes).toEqual([])
})
