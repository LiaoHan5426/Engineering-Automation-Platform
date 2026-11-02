import { reactive, toRaw } from 'vue'
import { runtimeApi, type ScenarioConfiguration } from '@eap/runtime-client'
import type { Scenario } from './workbench'

/** Drafts stay in memory until explicit save. Server revisions never grant resources. */
export function createScenarioCatalog(scenes: Scenario[]) {
  const state = reactive({
    busy: false,
    loaded: false,
    error: '' as '' | 'load' | 'save' | 'delete' | 'conflict',
    savedId: '',
  })
  const revisions = new Map<string, number>()
  const definition = (scene: Scenario): ScenarioConfiguration => {
    const fields: Partial<Scenario> = { ...toRaw(scene) }
    delete fields.id
    delete fields.builtin
    return JSON.parse(JSON.stringify(fields))
  }
  const fail = (error: unknown, fallback: 'load' | 'save' | 'delete') => {
    state.error =
      (error as { response?: { status?: number } })?.response?.status === 409
        ? 'conflict'
        : fallback
  }
  return {
    state,
    revision: (id: string) => revisions.get(id) ?? 0,
    async load() {
      if (state.busy || state.loaded) return
      state.busy = true
      state.error = ''
      try {
        const { items } = await runtimeApi.scenarios()
        for (const item of items) {
          // Never overwrite local drafts, presets, or a copy edited while the request was in flight.
          if (!scenes.some((scene) => scene.id === item.id)) {
            scenes.push({
              ...item.definition,
              workflow: item.definition.workflow ?? undefined,
              id: item.id,
              builtin: false,
            })
            revisions.set(item.id, item.revision)
          }
        }
        state.loaded = true
      } catch (error) {
        fail(error, 'load')
      } finally {
        state.busy = false
      }
    },
    async save(scene: Scenario) {
      if (state.busy || scene.builtin !== false) return false
      state.busy = true
      state.error = ''
      state.savedId = ''
      const sent = definition(scene)
      try {
        const saved = await runtimeApi.saveScenario(scene.id, revisions.get(scene.id) ?? 0, sent)
        // Record the returned revision even if readback fails: do not replay a create blindly.
        revisions.set(scene.id, saved.revision)
        const read = await runtimeApi.scenario(scene.id)
        if (read.id !== scene.id || read.revision !== saved.revision)
          throw { response: { status: 409 } }
        state.savedId = scene.id
        return true
      } catch (error) {
        fail(error, 'save')
        return false
      } finally {
        state.busy = false
      }
    },
    async remove(scene: Scenario) {
      if (state.busy || scene.builtin !== false) return false
      state.busy = true
      state.error = ''
      state.savedId = ''
      try {
        const revision = revisions.get(scene.id)
        if (revision) await runtimeApi.deleteScenario(scene.id, revision)
        const index = scenes.findIndex((item) => item.id === scene.id)
        if (index >= 0) scenes.splice(index, 1)
        revisions.delete(scene.id)
        return true
      } catch (error) {
        fail(error, 'delete')
        return false
      } finally {
        state.busy = false
      }
    },
  }
}
