/**
 * Read-only file tree for the inspector's Files tab.
 *
 * Every path comes from evidence already held by the current session. A path
 * carries only its strongest real source; no placeholder files or contents are
 * invented.
 */
export type InspectorFileSource = 'proposal' | 'applied' | 'reference' | 'local'

export type InspectorFileTreeInput = {
  references: string[]
  localFiles: string[]
  proposalFiles: string[]
  appliedFiles: string[]
}

export type InspectorFileTreeNode = {
  name: string
  path: string
  kind: 'folder' | 'file'
  source?: InspectorFileSource
  children?: InspectorFileTreeNode[]
}

type MutableNode = InspectorFileTreeNode & { children: InspectorFileTreeNode[] }

function normalizePath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.')
    .join('/')
}

function compareNodes(a: InspectorFileTreeNode, b: InspectorFileTreeNode): number {
  return a.name.localeCompare(b.name, 'en', { sensitivity: 'base' })
}

/**
 * Sources are ordered by strength: a file shown as a candidate is labelled as
 * such even when the same path is also referenced or stored locally.
 */
export function buildInspectorFileTree(input: InspectorFileTreeInput): InspectorFileTreeNode[] {
  const byPath = new Map<string, InspectorFileSource>()
  const sources: Array<[InspectorFileSource, string[]]> = [
    ['proposal', input.proposalFiles],
    ['applied', input.appliedFiles],
    ['reference', input.references],
    ['local', input.localFiles],
  ]
  for (const [source, paths] of sources) {
    for (const raw of paths) {
      const path = normalizePath(raw)
      if (path && !byPath.has(path)) byPath.set(path, source)
    }
  }

  const roots: MutableNode[] = []
  for (const [path, source] of byPath) {
    const parts = path.split('/')
    let level = roots
    let prefix = ''
    parts.forEach((name, index) => {
      prefix = prefix ? `${prefix}/${name}` : name
      const isFile = index === parts.length - 1
      let node = level.find((candidate) => candidate.name === name)
      if (!node) {
        node = {
          name,
          path: prefix,
          kind: isFile ? 'file' : 'folder',
          ...(isFile ? { source } : {}),
          children: [],
        } as MutableNode
        level.push(node)
      }
      if (!isFile) level = node.children as MutableNode[]
    })
  }

  const sort = (nodes: InspectorFileTreeNode[]): InspectorFileTreeNode[] => {
    nodes.sort(compareNodes)
    for (const node of nodes) if (node.children) node.children = sort(node.children)
    return nodes
  }
  return sort(roots)
}

/** Flatten a tree into render rows, omitting descendants of collapsed folders. */
export function flattenInspectorFileTree(
  nodes: InspectorFileTreeNode[],
  collapsed: ReadonlySet<string>,
): InspectorFileTreeNode[] {
  const rows: InspectorFileTreeNode[] = []
  const visit = (level: InspectorFileTreeNode[]) => {
    for (const node of level) {
      rows.push(node)
      if (node.kind === 'folder' && !collapsed.has(node.path)) visit(node.children ?? [])
    }
  }
  visit(nodes)
  return rows
}

/** Folder paths for the initial expanded state of a shared tree control. */
export function collectInspectorFolders(nodes: InspectorFileTreeNode[]): string[] {
  const paths: string[] = []
  const visit = (level: InspectorFileTreeNode[]) => {
    for (const node of level) {
      if (node.kind === 'folder') {
        paths.push(node.path)
        visit(node.children ?? [])
      }
    }
  }
  visit(nodes)
  return paths
}

/** Count real file leaves; folder nodes are derived structure, not evidence. */
export function countInspectorFiles(nodes: InspectorFileTreeNode[]): number {
  return nodes.reduce(
    (total, node) => total + (node.kind === 'file' ? 1 : countInspectorFiles(node.children ?? [])),
    0,
  )
}
