import type { PrototypeNode, PrototypeSchema } from './prototypeSchema'

export const PrototypeActionType = {
  TOGGLE: 'TOGGLE',
  SUBMIT: 'SUBMIT',
  RESET: 'RESET',
} as const
export type PrototypeActionType = (typeof PrototypeActionType)[keyof typeof PrototypeActionType]
export type PrototypeAction = { type: PrototypeActionType; target: string }

export function prototypeNodes(schema: PrototypeSchema): PrototypeNode[] {
  const nodes: PrototypeNode[] = []
  function visit(node: PrototypeNode) {
    nodes.push(node)
    node.children.forEach(visit)
  }
  visit(schema.root)
  return nodes
}

/** Shared by preview, publication and the independent Mock service. No browser or HTTP effects. */
export function prototypeInteractionProblems(schema: PrototypeSchema): string[] {
  const problems: string[] = []
  const nodes = prototypeNodes(schema)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  if (byId.size !== nodes.length) problems.push('duplicate_node_id')
  for (const node of nodes) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(node.id)) problems.push('invalid_node_id')
    const props = node.props
    if (props.action !== undefined) {
      const action = props.action as Partial<PrototypeAction> | null
      if (
        node.kind !== 'button' ||
        !action ||
        typeof action !== 'object' ||
        Object.keys(action).sort().join(',') !== 'target,type' ||
        !Object.values(PrototypeActionType).includes(action.type as PrototypeActionType) ||
        typeof action.target !== 'string'
      ) {
        problems.push('invalid_action')
      } else {
        const target = byId.get(action.target)
        if (
          !target ||
          (action.type === PrototypeActionType.TOGGLE
            ? !['dialog', 'section'].includes(target.kind)
            : target.kind !== 'form')
        )
          problems.push('invalid_action_target')
      }
    }
    if (
      node.kind === 'select' &&
      (!Array.isArray(props.options) ||
        props.options.length < 1 ||
        props.options.length > 30 ||
        props.options.some(
          (item) => typeof item !== 'string' || !item.trim() || item.length > 200,
        ) ||
        new Set(props.options).size !== props.options.length)
    )
      problems.push('invalid_options')
    if (props.required !== undefined && typeof props.required !== 'boolean')
      problems.push('invalid_required')
    if (props.checked !== undefined && typeof props.checked !== 'boolean')
      problems.push('invalid_checked')
    if (props.initiallyVisible !== undefined && typeof props.initiallyVisible !== 'boolean')
      problems.push('invalid_visibility')
    if (
      props.initialValue !== undefined &&
      (typeof props.initialValue !== 'string' || props.initialValue.length > 2000)
    )
      problems.push('invalid_initial_value')
    if (
      node.kind === 'select' &&
      typeof props.initialValue === 'string' &&
      props.initialValue !== '' &&
      Array.isArray(props.options) &&
      !props.options.includes(props.initialValue)
    )
      problems.push('invalid_initial_option')
  }
  return [...new Set(problems)]
}
