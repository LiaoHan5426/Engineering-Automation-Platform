import {
  emptyPrototypeSchema,
  parsePrototypeSchema,
  type PrototypeSchema,
  type PrototypeNode,
  PROTOTYPE_KINDS,
} from '@eap/runtime-client/contracts'
export {
  emptyPrototypeSchema,
  parsePrototypeSchema,
  deliveryBlockers,
  canAutoDeliver,
  PROTOTYPE_KINDS,
  type PrototypeSchema,
  type PrototypeNode,
} from '@eap/runtime-client/contracts'
const STORAGE_KEY = 'eap.prototype-schema.v1'
const VERSIONS_KEY = STORAGE_KEY + '.versions'
const KNOWN_KINDS = new Set<string>(PROTOTYPE_KINDS)

export function schemaFromGrapesProject(
  title: string,
  project: Record<string, unknown>,
  blockKinds: string[] = [],
): PrototypeSchema {
  const unknown = blockKinds.filter((kind) => kind && !KNOWN_KINDS.has(kind))
  const schema = emptyPrototypeSchema(title)
  schema.grapesProject = project
  schema.unknownMappings = [...new Set(unknown)]
  let count = 0
  const record = (value: unknown): Record<string, unknown> =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {}
  function text(value: unknown): string {
    if (typeof value === 'string') return value.slice(0, 20000)
    const node = record(value)
    return (
      String(node.content ?? '') +
      (Array.isArray(node.components) ? node.components.map(text).join('') : '')
    )
  }
  function convert(value: unknown, depth = 0): PrototypeNode | null {
    if (++count > 500 || depth > 24) {
      schema.unknownMappings.push('limit_exceeded')
      return null
    }
    if (typeof value === 'string')
      return { id: `node-${count}`, kind: 'text', props: { text: value }, children: [] }
    const source = record(value),
      attrs = record(source.attributes)
    const id = String(attrs['data-eap-id'] ?? attrs.id ?? source.id ?? `node-${count}-${depth}`)
    const tag = String(source.tagName ?? '').toLowerCase()
    const kind = String(
      attrs['data-eap-kind'] ??
        (['div', 'body', 'section', 'main', 'header', 'footer', 'aside', 'nav', ''].includes(tag)
          ? 'section'
          : ['h1', 'h2', 'h3'].includes(tag)
            ? 'heading'
            : ['p', 'span', 'label'].includes(tag) ||
                ['text', 'textnode'].includes(String(source.type))
              ? 'text'
              : tag === 'button'
                ? 'button'
                : tag === 'a'
                  ? 'link'
                  : ['input', 'textarea'].includes(tag)
                    ? 'input'
                    : tag === 'ul' || tag === 'ol'
                      ? 'list'
                      : `tag:${tag}`),
    )
    if (!KNOWN_KINDS.has(kind)) schema.unknownMappings.push(kind)
    const props: Record<string, unknown> = {}
    const allowedStyles = new Set([
      'display',
      'flex-direction',
      'grid-template-columns',
      'gap',
      'padding',
      'margin',
      'width',
      'max-width',
      'min-height',
      'background-color',
      'color',
      'border-radius',
      'font-size',
      'text-align',
    ])
    props.style = Object.fromEntries(
      Object.entries(record(source.style)).filter(
        ([key, value]) =>
          allowedStyles.has(key) &&
          typeof value === 'string' &&
          value.length < 120 &&
          !/url|expression|[<>@\\]/i.test(value),
      ),
    )
    if (kind === 'text') props.text = text(source)
    if (kind === 'heading') {
      props.text = text(source).slice(0, 500)
      const level = Number(attrs['data-level'] ?? (tag === 'h2' ? 2 : tag === 'h3' ? 3 : 1))
      props.level = level === 2 || level === 3 ? level : 1
    }
    if (kind === 'button') {
      props.label = text(source)
      if (attrs['data-action'])
        props.action = {
          type: String(attrs['data-action']),
          target: String(attrs['data-target'] ?? ''),
        }
    }
    if (kind === 'link') {
      props.href = String(attrs.href ?? '#')
      props.label = text(source).slice(0, 200) || String(attrs['aria-label'] ?? 'Link')
    }
    if (['input', 'select', 'checkbox', 'form', 'dialog'].includes(kind))
      props.label = String(attrs['data-label'] ?? attrs.placeholder ?? '')
    if (kind === 'input') props.placeholder = String(attrs.placeholder ?? '')
    if (['input', 'select'].includes(kind)) props.initialValue = String(attrs['data-value'] ?? '')
    if (['input', 'select', 'checkbox'].includes(kind))
      props.required = attrs['data-required'] === 'true' || attrs['data-required'] === true
    if (kind === 'checkbox')
      props.checked = attrs['data-checked'] === 'true' || attrs['data-checked'] === true
    if (kind === 'select')
      props.options = String(attrs['data-options'] ?? '')
        .split('\n')
        .filter(Boolean)
    if (kind === 'section') props.initiallyVisible = attrs['data-visible'] !== 'false'
    const contents =
      Array.isArray(source.components) && source.components.length
        ? source.components
        : typeof source.content === 'string' && source.content
          ? [source.content]
          : []
    if (kind === 'list') {
      props.ordered =
        tag === 'ol' || attrs['data-ordered'] === 'true' || attrs['data-ordered'] === true
      props.items = contents
        .map((child) => text(child).replace(/\s+/g, ' ').trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 50)
    }
    const children = ['section', 'form', 'dialog'].includes(kind)
      ? contents
          .map((child) => convert(child, depth + 1))
          .filter((child): child is PrototypeNode => !!child)
      : []
    return { id, kind, props, children }
  }
  const pages = Array.isArray(project.pages) ? project.pages : []
  for (const page of pages) {
    const frames = record(page).frames
    if (!Array.isArray(frames)) continue
    for (const frame of frames) {
      const component = record(frame).component
      if (!component) continue
      const node = convert(component)
      if (node) schema.root.children.push(node)
    }
  }
  schema.unknownMappings = [...new Set(schema.unknownMappings)]
  return schema
}

export function loadPrototypeSchema(
  storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
): PrototypeSchema | null {
  const raw = storage?.getItem(STORAGE_KEY)
  return raw ? parsePrototypeSchema(raw) : null
}

export function savePrototypeSchema(
  schema: PrototypeSchema,
  storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
) {
  const versions = loadPrototypeVersions(storage)
  const next = JSON.parse(
    JSON.stringify({
      ...schema,
      id: `design-${Date.now()}-${versions.length}`,
      updatedAt: new Date().toISOString(),
    }),
  ) as PrototypeSchema
  storage?.setItem(VERSIONS_KEY, JSON.stringify([next, ...versions].slice(0, 20)))
  storage?.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}

export function loadPrototypeVersions(
  storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage === 'undefined'
    ? undefined
    : localStorage,
): PrototypeSchema[] {
  try {
    const items = JSON.parse(storage?.getItem(VERSIONS_KEY) ?? '[]')
    return Array.isArray(items)
      ? items
          .filter(
            (item) =>
              item?.version === 1 &&
              typeof item.title === 'string' &&
              item.root &&
              Array.isArray(item.root.children),
          )
          .slice(0, 20)
      : []
  } catch {
    return []
  }
}

/** Test seam. */
export function resetPrototypeSchemaForTests(
  storage: Storage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
) {
  storage?.removeItem(STORAGE_KEY)
  storage?.removeItem(VERSIONS_KEY)
}
