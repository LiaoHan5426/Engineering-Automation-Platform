import { describe, expect, it } from 'vite-plus/test'
import { emptyPrototypeSchema, prototypeVersionDesign } from '@eap/runtime-client'
import {
  scenePublicationBlockers,
  scenePublicationRequest,
} from '../../../src/features/work/scenePublication'

describe('scene designer prototype publication', () => {
  const requestId = '1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d'

  it('builds an immutable version request from the real canvas schema', () => {
    const schema = emptyPrototypeSchema('登录页草稿')
    schema.root.children.push({ id: 'button-1', kind: 'button', props: {}, children: [] })

    const request = scenePublicationRequest(schema, requestId)

    expect(request.requestId).toBe(requestId)
    expect(request.sourceRef).toBe('builder-alpha')
    expect(request.title).toBe('登录页草稿')
    expect(request.acceptance).toEqual(['semantic-preview'])
    const body = JSON.parse(request.body) as { format: string; schema: typeof schema }
    expect(body.format).toBe('eap-prototype-v1')
    expect(body.schema).toEqual(schema)
    expect(prototypeVersionDesign(request.body).blocked).toBe(false)
  })

  it('reports real delivery blockers before publishing', () => {
    const schema = emptyPrototypeSchema()
    expect(scenePublicationBlockers(schema)).toContain('empty_schema')

    schema.root.children.push({ id: 'unknown-1', kind: 'mystery', props: {}, children: [] })
    expect(scenePublicationBlockers(schema)).toContain('unregistered_kind:mystery')
  })
})
