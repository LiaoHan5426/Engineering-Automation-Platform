export type PrototypeNode = {
  id: string
  /** Registered component kind; unknown kinds block automatic delivery. */
  kind: string
  props: Record<string, unknown>
  children: PrototypeNode[]
}

export type PrototypeSchema = {
  id?: string
  version: 1
  title: string
  root: PrototypeNode
  /** Component kinds that have no Vue adapter yet. */
  unknownMappings: string[]
  /** Opaque GrapesJS project JSON when the editor is available; empty object otherwise. */
  grapesProject: Record<string, unknown>
  updatedAt: string
}

export const PROTOTYPE_KINDS = [
  'page',
  'section',
  'text',
  'heading',
  'button',
  'input',
  'link',
  'list',
] as const
const KNOWN_KINDS = new Set<string>(PROTOTYPE_KINDS)

export function emptyPrototypeSchema(title = 'Untitled layout'): PrototypeSchema {
  const now = new Date().toISOString()
  return {
    version: 1,
    title: title.trim().slice(0, 120) || 'Untitled layout',
    root: { id: 'root', kind: 'page', props: {}, children: [] },
    unknownMappings: [],
    grapesProject: {},
    updatedAt: now,
  }
}

/** Reject automatic delivery when unknown component mappings remain. */
export function deliveryBlockers(schema: PrototypeSchema): string[] {
  const reasons: string[] = []
  if (!schema.root.children.length) reasons.push('empty_schema')
  if (schema.unknownMappings.length) {
    reasons.push(`unknown_mappings:${schema.unknownMappings.join(',')}`)
  }
  walk(schema.root, (node) => {
    if (!KNOWN_KINDS.has(node.kind) && !schema.unknownMappings.includes(node.kind)) {
      reasons.push(`unregistered_kind:${node.kind}`)
    }
  })
  return [...new Set(reasons)]
}

export function canAutoDeliver(schema: PrototypeSchema) {
  return deliveryBlockers(schema).length === 0
}

function walk(node: PrototypeNode, visit: (node: PrototypeNode) => void) {
  visit(node)
  for (const child of node.children) walk(child, visit)
}

/**
 * Build a schema shell from a Grapes project snapshot.
 * Does not invent Vue SFCs; unknown block types are recorded for manual follow-up.
 */
/** Validate saved schema content before rendering; never load editor data into the application DOM. */
export function parsePrototypeSchema(raw: string): PrototypeSchema | null {
  try {
    const parsed = JSON.parse(raw) as PrototypeSchema
    let nodes = 0
    function valid(node: PrototypeNode, depth = 0): boolean {
      return (
        !!node &&
        ++nodes <= 500 &&
        depth <= 24 &&
        typeof node.id === 'string' &&
        typeof node.kind === 'string' &&
        !!node.props &&
        typeof node.props === 'object' &&
        !Array.isArray(node.props) &&
        Array.isArray(node.children) &&
        node.children.every((child) => valid(child, depth + 1))
      )
    }
    if (
      parsed?.version !== 1 ||
      typeof parsed.title !== 'string' ||
      !valid(parsed.root) ||
      !Array.isArray(parsed.unknownMappings) ||
      !parsed.unknownMappings.every((item) => typeof item === 'string') ||
      !parsed.grapesProject ||
      typeof parsed.grapesProject !== 'object' ||
      Array.isArray(parsed.grapesProject)
    )
      return null
    return parsed
  } catch {
    return null
  }
}

/** One decoder for persisted design versions, shared by Builder and task/Run previews. */
export function prototypeVersionDesign(body: string): {
  semantic: boolean
  schema: PrototypeSchema | null
  blocked: boolean
} {
  try {
    const data = JSON.parse(body)
    if (typeof data?.format !== 'string' || !data.format.startsWith('eap-prototype-'))
      return { semantic: false, schema: null, blocked: true }
    const schema =
      data.format === 'eap-prototype-v1' ? parsePrototypeSchema(JSON.stringify(data.schema)) : null
    return { semantic: true, schema, blocked: !schema || !canAutoDeliver(schema) }
  } catch {
    const semantic = body.includes('eap-prototype-')
    return { semantic, schema: null, blocked: true }
  }
}
