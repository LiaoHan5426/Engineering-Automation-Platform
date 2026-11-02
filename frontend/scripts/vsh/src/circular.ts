import { analyzeGraph, type Edge } from 'circular-dependency-scanner'
import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import type { WorkspacePackage } from './imports.ts'
import { extractImports, within } from './imports.ts'
import { readCompilerOptions, walk } from './boundaries.ts'

/** Reuse our shared SFC/AST reader: upstream's file reader loses setup when both scripts exist. */
export async function checkCircular(packages: WorkspacePackage[]): Promise<string[][]> {
  const edges: Edge[] = packages.map((pkg) => [
    path.join(pkg.root, 'package.json'),
    packages
      .filter((other) => pkg.dependencies[other.name])
      .map((other) => path.join(other.root, 'package.json')),
  ])
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.css']
  const canonical = (file: string) =>
    process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file)
  for (const pkg of packages) {
    const children = packages.filter(
      (other) => other.root !== pkg.root && within(pkg.root, other.root),
    )
    const files = walk(pkg.root).filter(
      (file) =>
        extensions.includes(path.extname(file)) &&
        !file.endsWith('.d.ts') &&
        !path.relative(pkg.root, file).split(path.sep).includes('__tests__') &&
        !children.some((child) => within(child.root, file)),
    )
    const known = new Map(files.map((file) => [canonical(fs.realpathSync(file)), file]))
    const options = readCompilerOptions(pkg.root)
    for (const file of files) {
      const dependencies: string[] = []
      const globGroups: string[][] = []
      const imports = extractImports(fs.readFileSync(file, 'utf8'), file, true, (patterns) =>
        globGroups.push(patterns),
      )
      for (const patterns of globGroups) {
        const resolvePattern = (pattern: string) => {
          const clean = pattern.replace(/^!/, '')
          if (clean.startsWith('.'))
            return path.resolve(path.dirname(file), clean).replaceAll('\\', '/')
          if (clean.startsWith('/'))
            return path.resolve(pkg.root, '.' + clean).replaceAll('\\', '/')
          throw new Error(`${file}: unsupported glob alias must be resolved explicitly: ${clean}`)
        }
        const include = patterns.filter((pattern) => !pattern.startsWith('!')).map(resolvePattern)
        const exclude = patterns.filter((pattern) => pattern.startsWith('!')).map(resolvePattern)
        for (const candidate of files) {
          const normalized = path.resolve(candidate).replaceAll('\\', '/')
          if (
            include.some((pattern) => path.matchesGlob(normalized, pattern)) &&
            !exclude.some((pattern) => path.matchesGlob(normalized, pattern))
          )
            dependencies.push(candidate)
        }
      }
      for (const specifier of imports) {
        const target = specifier.split('?')[0]!
        const resolved = ts.resolveModuleName(target, file, options, ts.sys).resolvedModule
          ?.resolvedFileName
        const bases: string[] = target.startsWith('.')
          ? [path.resolve(path.dirname(file), target)]
          : []
        for (const [pattern, replacements] of Object.entries(options.paths ?? {})) {
          const [start, end] = pattern.split('*')
          if (
            (pattern.includes('*') && target.startsWith(start!) && target.endsWith(end ?? '')) ||
            target === pattern
          ) {
            const value = pattern.includes('*')
              ? target.slice(start!.length, end ? -end.length : undefined)
              : ''
            bases.push(
              ...replacements.map((replacement) =>
                path.resolve(options.baseUrl ?? pkg.root, replacement.replaceAll('*', value)),
              ),
            )
          }
        }
        const candidates = [
          ...(resolved ? [resolved] : []),
          ...bases.flatMap((base) => [
            base,
            ...extensions.map((extension) => base + extension),
            ...extensions.map((extension) => path.join(base, 'index' + extension)),
          ]),
        ]
        for (const candidate of candidates) {
          const match = known.get(canonical(candidate))
          if (match) {
            dependencies.push(match)
            break
          }
        }
      }
      edges.push([file, [...new Set(dependencies)]])
    }
  }
  const data: unknown = await analyzeGraph(edges)
  if (
    !Array.isArray(data) ||
    data.some((circle) => !Array.isArray(circle) || circle.some((file) => typeof file !== 'string'))
  )
    throw new Error('Circular graph analyzer returned invalid data')
  return data as string[][]
}
