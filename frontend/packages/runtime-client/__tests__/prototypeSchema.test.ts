import { expect, it } from 'vite-plus/test'
import {
  emptyPrototypeSchema,
  parsePrototypeSchema,
  prototypeVersionDesign,
  deliveryBlockers,
} from '../src/contracts/index'

const design = () => {
  const schema = emptyPrototypeSchema('Multiline description')
  schema.root.children = [
    {
      id: 'description',
      kind: 'textarea',
      children: [],
      props: {
        label: '任务说明',
        placeholder: '填写说明',
        initialValue: '第一行\n第二行',
        required: true,
      },
    },
  ]
  return schema
}

it('decodes textarea versions without flattening multiline values', () => {
  const schema = design()
  const result = prototypeVersionDesign(JSON.stringify({ format: 'eap-prototype-v1', schema }))
  expect(result.blocked).toBe(false)
  expect(result.schema?.root.children[0]).toEqual(schema.root.children[0])
})

it('rejects malformed textarea values and keeps unknown kinds blocked', () => {
  for (const props of [
    { required: 'true' },
    { initialValue: 5 },
    { initialValue: 'x'.repeat(2001) },
  ]) {
    const schema = design()
    Object.assign(schema.root.children[0]!.props, props)
    expect(parsePrototypeSchema(JSON.stringify(schema))).toBeNull()
    expect(
      prototypeVersionDesign(JSON.stringify({ format: 'eap-prototype-v1', schema })).blocked,
    ).toBe(true)
  }
  const schema = design()
  schema.root.children[0]!.kind = 'textarea-custom'
  expect(deliveryBlockers(schema)).toContain('unregistered_kind:textarea-custom')
  expect(
    prototypeVersionDesign(JSON.stringify({ format: 'eap-prototype-v1', schema })).blocked,
  ).toBe(true)
})
