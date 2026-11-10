import { describe, expect, it } from 'vite-plus/test'
import { compileExpert, defineExpert } from '../src/index'
import { sqlExpert } from '../src/sql-expert'

describe('current explicit expert definition', () => {
  it('compiles the shipped SQL template with a versioned behavior and explicit dependency graph', () => {
    const value = JSON.parse(compileExpert(sqlExpert))
    expect(value.behavior).toEqual({ id: 'sql-analysis', version: 1 })
    expect(value.steps.map((step: { id: string }) => step.id)).toEqual([
      'parse',
      'knowledge',
      'schema',
      'indexes',
      'explain',
    ])
    expect(value.edges).toHaveLength(4)
    expect(value).not.toHaveProperty('capabilities')
    expect(value.knowledgeBases).toEqual([])
  })
  it('rejects omitted or malformed bindings and the removed capability-list shape', () => {
    for (const behavior of [undefined, null, { id: 'sql-analysis', version: 0 }]) {
      expect(() => defineExpert({ ...sqlExpert, behavior } as never)).toThrow()
    }
    expect(() => defineExpert({ ...sqlExpert, capabilities: [] } as never)).toThrow()
    expect(() => defineExpert({ ...sqlExpert, edges: undefined } as never)).toThrow()
  })
})
