import { describe, expect, it } from 'vite-plus/test'
import {
  contributionVisible,
  pluginRuntimeObservation,
} from '../../../src/features/plugins/pluginRuntimeView'

describe('pluginRuntimeView', () => {
  it('marks board dependency_missing when runtime.board-api is down', () => {
    const observation = pluginRuntimeObservation({
      pluginId: 'board',
      enabled: true,
      services: { 'runtime.board-api': false },
      activationError: null,
    })
    expect(observation.kind).toBe('dependency_missing')
    expect(contributionVisible('board', true, { 'runtime.board-api': false }, null)).toBe(false)
  })

  it('keeps activation_failed sticky after enable rollback', () => {
    const observation = pluginRuntimeObservation({
      pluginId: 'board',
      enabled: false,
      services: { 'runtime.board-api': true },
      activationError: 'boom',
    })
    expect(observation.kind).toBe('activation_failed')
    expect(contributionVisible('board', false, { 'runtime.board-api': true }, 'boom')).toBe(false)
  })

  it('keeps chat ready without service deps', () => {
    expect(
      pluginRuntimeObservation({
        pluginId: 'chat',
        enabled: true,
        services: {},
        activationError: null,
      }).kind,
    ).toBe('ready')
  })
})
