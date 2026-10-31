/**
 * Semantic prototype schema (docs §3A / PB-01).
 * GrapesJS project JSON is editor state; this schema is the deliverable mapping surface.
 * HTML/CSS export is never treated as maintainable Vue source.
 */

export type PrototypeNode = {
  id: string;
  /** Registered component kind; unknown kinds block automatic delivery. */
  kind: string;
  props: Record<string, unknown>;
  children: PrototypeNode[];
};

export type PrototypeSchema = {
  id?: string;
  version: 1;
  title: string;
  root: PrototypeNode;
  /** Component kinds that have no Vue adapter yet. */
  unknownMappings: string[];
  /** Opaque GrapesJS project JSON when the editor is available; empty object otherwise. */
  grapesProject: Record<string, unknown>;
  updatedAt: string;
};

const STORAGE_KEY = "eap.prototype-schema.v1";
const VERSIONS_KEY = STORAGE_KEY + '.versions';
export const PROTOTYPE_KINDS = ['page', 'section', 'text', 'heading', 'button', 'input', 'link', 'list'] as const;
const KNOWN_KINDS = new Set<string>(PROTOTYPE_KINDS);

export function emptyPrototypeSchema(title = "Untitled layout"): PrototypeSchema {
  const now = new Date().toISOString();
  return {
    version: 1,
    title: title.trim().slice(0, 120) || "Untitled layout",
    root: { id: "root", kind: "page", props: {}, children: [] },
    unknownMappings: [],
    grapesProject: {},
    updatedAt: now,
  };
}

/** Reject automatic delivery when unknown component mappings remain. */
export function deliveryBlockers(schema: PrototypeSchema): string[] {
  const reasons: string[] = [];
  if (!schema.root.children.length) reasons.push('empty_schema');
  if (schema.unknownMappings.length) {
    reasons.push(`unknown_mappings:${schema.unknownMappings.join(",")}`);
  }
  walk(schema.root, (node) => {
    if (!KNOWN_KINDS.has(node.kind) && !schema.unknownMappings.includes(node.kind)) {
      reasons.push(`unregistered_kind:${node.kind}`);
    }
  });
  return [...new Set(reasons)];
}

export function canAutoDeliver(schema: PrototypeSchema) {
  return deliveryBlockers(schema).length === 0;
}

function walk(node: PrototypeNode, visit: (node: PrototypeNode) => void) {
  visit(node);
  for (const child of node.children) walk(child, visit);
}

/**
 * Build a schema shell from a Grapes project snapshot.
 * Does not invent Vue SFCs; unknown block types are recorded for manual follow-up.
 */
export function schemaFromGrapesProject(
  title: string,
  project: Record<string, unknown>,
  blockKinds: string[] = [],
): PrototypeSchema {
  const unknown = blockKinds.filter((kind) => kind && !KNOWN_KINDS.has(kind));
  const schema = emptyPrototypeSchema(title);
  schema.grapesProject = project;
  schema.unknownMappings = [...new Set(unknown)];
  let count = 0;
  const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  function text(value: unknown): string {
    if (typeof value === 'string') return value.slice(0, 20000);
    const node = record(value);
    return String(node.content ?? '') + (Array.isArray(node.components) ? node.components.map(text).join('') : '');
  }
  function convert(value: unknown, depth = 0): PrototypeNode | null {
    if (++count > 500 || depth > 24) { schema.unknownMappings.push('limit_exceeded'); return null; }
    if (typeof value === 'string') return { id: `node-${count}`, kind: 'text', props: { text: value }, children: [] };
    const source = record(value), attrs = record(source.attributes);
    const tag = String(source.tagName ?? '').toLowerCase();
    const kind = String(attrs['data-eap-kind'] ?? (
      ['div', 'body', 'section', 'main', 'header', 'footer', 'aside', 'nav', ''].includes(tag) ? 'section'
      : ['h1', 'h2', 'h3'].includes(tag) ? 'heading'
      : ['p', 'span', 'label'].includes(tag) || ['text', 'textnode'].includes(String(source.type)) ? 'text'
      : tag === 'button' ? 'button' : tag === 'a' ? 'link'
      : ['input', 'textarea'].includes(tag) ? 'input'
      : tag === 'ul' || tag === 'ol' ? 'list'
      : `tag:${tag}`));
    if (!KNOWN_KINDS.has(kind)) schema.unknownMappings.push(kind);
    const props: Record<string, unknown> = {};
    const allowedStyles = new Set(['display', 'flex-direction', 'grid-template-columns', 'gap', 'padding', 'margin', 'width', 'max-width', 'min-height', 'background-color', 'color', 'border-radius', 'font-size', 'text-align']);
    props.style = Object.fromEntries(Object.entries(record(source.style)).filter(([key, value]) => allowedStyles.has(key) && typeof value === 'string' && value.length < 120 && !/url|expression|[<>@\\]/i.test(value)));
    if (kind === 'text') props.text = text(source);
    if (kind === 'heading') {
      props.text = text(source).slice(0, 500);
      const level = Number(attrs['data-level'] ?? (tag === 'h2' ? 2 : tag === 'h3' ? 3 : 1));
      props.level = level === 2 || level === 3 ? level : 1;
    }
    if (kind === 'button') props.label = text(source);
    if (kind === 'link') {
      props.href = String(attrs.href ?? '#');
      props.label = text(source).slice(0, 200) || String(attrs['aria-label'] ?? 'Link');
    }
    if (kind === 'input') props.placeholder = String(attrs.placeholder ?? '');
    const contents = Array.isArray(source.components) && source.components.length ? source.components : typeof source.content === 'string' && source.content ? [source.content] : [];
    if (kind === 'list') {
      props.ordered = tag === 'ol' || attrs['data-ordered'] === 'true' || attrs['data-ordered'] === true;
      props.items = contents
        .map((child) => text(child).replace(/\s+/g, ' ').trim().slice(0, 200))
        .filter(Boolean)
        .slice(0, 50);
    }
    const children = kind === 'section'
      ? contents.map(child => convert(child, depth + 1)).filter((child): child is PrototypeNode => !!child) : [];
    return { id: `node-${count}-${depth}`, kind, props, children };
  }
  const pages = Array.isArray(project.pages) ? project.pages : [];
  for (const page of pages) {
    const frames = record(page).frames;
    if (!Array.isArray(frames)) continue;
    for (const frame of frames) {
      const component = record(frame).component;
      if (!component) continue;
      const node = convert(component);
      if (node) schema.root.children.push(node);
    }
  }
  schema.unknownMappings = [...new Set(schema.unknownMappings)];
  return schema;
}

export function loadPrototypeSchema(storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage): PrototypeSchema | null {
  const raw = storage?.getItem(STORAGE_KEY);
  return raw ? parsePrototypeSchema(raw) : null;
}

/** Validate saved schema content before rendering; never load editor data into the application DOM. */
export function parsePrototypeSchema(raw: string): PrototypeSchema | null {
  try {
    const parsed = JSON.parse(raw) as PrototypeSchema;
    let nodes = 0;
    function valid(node: PrototypeNode, depth = 0): boolean {
      return !!node && ++nodes <= 500 && depth <= 24 && typeof node.id === 'string' && typeof node.kind === 'string'
        && !!node.props && typeof node.props === 'object' && Array.isArray(node.children) && node.children.every(child => valid(child, depth + 1));
    }
    if (parsed?.version !== 1 || typeof parsed.title !== "string" || !valid(parsed.root)) return null;
    return {
      ...emptyPrototypeSchema(parsed.title),
      ...parsed,
      unknownMappings: Array.isArray(parsed.unknownMappings) ? parsed.unknownMappings.filter((item): item is string => typeof item === "string") : [],
      grapesProject: parsed.grapesProject && typeof parsed.grapesProject === "object" ? parsed.grapesProject : {},
    };
  } catch {
    return null;
  }
}

export function savePrototypeSchema(
  schema: PrototypeSchema,
  storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage,
) {
  const versions = loadPrototypeVersions(storage);
  const previous = loadPrototypeSchema(storage);
  if (!versions.length && previous) versions.push({ ...previous, id: previous.id || 'legacy-snapshot' });
  const next = JSON.parse(JSON.stringify({ ...schema, id: `design-${Date.now()}-${versions.length}`, updatedAt: new Date().toISOString() })) as PrototypeSchema;
  storage?.setItem(VERSIONS_KEY, JSON.stringify([next, ...versions].slice(0, 20)));
  storage?.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function loadPrototypeVersions(storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage === 'undefined' ? undefined : localStorage): PrototypeSchema[] {
  try {
    const items = JSON.parse(storage?.getItem(VERSIONS_KEY) ?? '[]');
    return Array.isArray(items) ? items.filter(item => item?.version === 1 && typeof item.title === 'string' && item.root && Array.isArray(item.root.children)).slice(0, 20) : [];
  } catch { return []; }
}

/** Test seam. */
export function resetPrototypeSchemaForTests(storage: Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage) {
  storage?.removeItem(STORAGE_KEY);
  storage?.removeItem(VERSIONS_KEY);
}
