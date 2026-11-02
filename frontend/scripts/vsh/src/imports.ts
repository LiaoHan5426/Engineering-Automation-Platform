import path from 'node:path'
import ts from 'typescript'
import { parse } from 'vue/compiler-sfc'

export type WorkspacePackage = {
  name: string
  root: string
  exports: unknown
  dependencies: Record<string, string>
}

export function within(root: string, file: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(file))
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
  )
}

function exportTargets(value: unknown): string[] {
  if (typeof value === 'string') return value.startsWith('./') ? [value] : []
  if (Array.isArray(value)) return value.flatMap(exportTargets)
  return value && typeof value === 'object' ? Object.values(value).flatMap(exportTargets) : []
}

function publicExport(exports: unknown, key: string): string[] {
  if (!exports || typeof exports !== 'object' || Array.isArray(exports))
    return key === '.' ? exportTargets(exports) : []
  const entries = Object.entries(exports)
  if (!entries.some(([entry]) => entry.startsWith('.')))
    return key === '.' ? exportTargets(exports) : []
  const exact = entries.find(([entry]) => entry === key)
  if (exact) return exportTargets(exact[1])
  const pattern = entries
    .filter(([entry]) => entry.includes('*'))
    .sort(([a], [b]) => b.length - a.length)
    .find(([entry]) => {
      const [start, end] = entry.split('*')
      return key.startsWith(start!) && key.endsWith(end!)
    })
  if (!pattern) return []
  const [start, end] = pattern[0].split('*')
  const replacement = key.slice(start!.length, end ? -end.length : undefined)
  return exportTargets(pattern[1]).map((target) => target.replaceAll('*', replacement))
}

/** All inter-package imports must use declared package names and exported subpaths. */
export function inspectImport(
  owner: WorkspacePackage,
  file: string,
  specifier: string,
  packages: WorkspacePackage[],
  resolved?: string,
): string[] {
  const target = specifier.split('?')[0]!
  const fail = (message: string) => [`${file}: ${message}: ${specifier}`]
  if (target.startsWith('node:')) return []
  if (path.isAbsolute(target) || /^[A-Za-z]:[\\/]|^file:|^\\/.test(target))
    return fail('absolute source imports are forbidden')
  if (target.startsWith('.')) {
    const location = path.resolve(path.dirname(file), target)
    if (!within(owner.root, location) || (resolved && !within(owner.root, resolved)))
      return fail('cross-package relative import is forbidden; use a public export')
    const another = packages.find(
      (pkg) =>
        pkg.root !== owner.root && within(owner.root, pkg.root) && within(pkg.root, location),
    )
    if (another) return fail('direct import into a nested workspace package is forbidden')
    if (!file.split(/[\\/]/).includes('__tests__') && location.split(/[\\/]/).includes('__tests__'))
      return fail('production source must not import test-only code')
    return []
  }
  const name = target.startsWith('@')
    ? target.split('/').slice(0, 2).join('/')
    : target.split('/')[0]!
  const dependency = packages.find((pkg) => pkg.name === name)
  if (
    !dependency &&
    resolved &&
    !resolved.split(/[\\/]/).includes('node_modules') &&
    packages
      .filter((pkg) => within(pkg.root, resolved))
      .sort((a, b) => b.root.length - a.root.length)[0]?.root !== owner.root &&
    packages.some((pkg) => within(pkg.root, resolved))
  )
    return fail('alias resolves directly into another workspace package')
  if (target.startsWith('#') && resolved && within(owner.root, resolved)) return []
  if (name !== owner.name && !owner.dependencies[name]) return fail('undeclared dependency')
  if (dependency) {
    const key = target === name ? '.' : `.${target.slice(name.length)}`
    const targets = publicExport(dependency.exports, key)
    if (!targets.length || target.split('/').includes('..'))
      return fail('package subpath is not publicly exported')
    if (
      resolved &&
      !targets.some(
        (entry) =>
          path.relative(path.resolve(dependency.root, entry), path.resolve(resolved)) === '',
      )
    )
      return fail('resolved workspace import bypasses its public export')
  }
  return []
}

/** AST traversal avoids source-string/comment matches and handles multiline declarations. */
export function extractImports(
  source: string,
  filename: string,
  excludeTypes = false,
  onGlob?: (patterns: string[]) => void,
): string[] {
  if (filename.endsWith('.css')) {
    const css = source.replace(/\/\*[\s\S]*?\*\//g, '')
    return [...css.matchAll(/@import\s+(?:url\(\s*)?["']([^"']+)["']/g)].map((match) => match[1]!)
  }
  if (filename.endsWith('.vue')) {
    const { descriptor, errors } = parse(source, { filename })
    if (errors.length)
      throw new Error(`${filename}: invalid Vue SFC: ${errors.map(String).join('; ')}`)
    return [descriptor.script, descriptor.scriptSetup, ...descriptor.styles].flatMap((block) => {
      if (!block) return []
      if (block.src) return [block.src]
      return extractImports(
        block.content,
        block.type === 'style' ? `${filename}.css` : `${filename}.ts`,
        excludeTypes,
        onGlob,
      )
    })
  }
  const file = ts.createSourceFile(
    filename,
    source,
    ts.ScriptTarget.Latest,
    true,
    filename.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const imports: string[] = []
  function strings(node: ts.Node | undefined): string[] {
    if (!node) return []
    if (ts.isStringLiteralLike(node)) return [node.text]
    if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(strings)
    return []
  }
  function visit(node: ts.Node) {
    if (ts.isImportTypeNode(node)) {
      if (!excludeTypes && ts.isLiteralTypeNode(node.argument))
        imports.push(...strings(node.argument.literal))
      return
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      if (!excludeTypes || !node.isTypeOnly)
        imports.push(...strings(node.moduleReference.expression))
      return
    }
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const clause = ts.isImportDeclaration(node) ? node.importClause : undefined
      const typeOnly = ts.isImportDeclaration(node)
        ? clause?.isTypeOnly ||
          (!clause?.name &&
            clause?.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.length > 0 &&
            clause.namedBindings.elements.every((item) => item.isTypeOnly))
        : node.isTypeOnly ||
          (node.exportClause &&
            ts.isNamedExports(node.exportClause) &&
            node.exportClause.elements.length > 0 &&
            node.exportClause.elements.every((item) => item.isTypeOnly))
      if (!excludeTypes || !typeOnly) imports.push(node.moduleSpecifier.text)
    }
    if (ts.isCallExpression(node)) {
      const expression = node.expression
      const glob =
        ts.isPropertyAccessExpression(expression) &&
        expression.name.text === 'glob' &&
        ts.isMetaProperty(expression.expression) &&
        expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword
      if (glob && onGlob) {
        onGlob(strings(node.arguments[0]))
        return
      }
      const call =
        expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(expression) && expression.text === 'require') ||
        (ts.isPropertyAccessExpression(expression) &&
          expression.name.text === 'glob' &&
          ts.isMetaProperty(expression.expression) &&
          expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword)
      if (call)
        imports.push(
          ...strings(node.arguments[0]).map((value) =>
            value.startsWith('!') ? value.slice(1) : value,
          ),
        )
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return imports
}
