import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
import { extractImports, inspectImport, within, type WorkspacePackage } from './imports.ts'
import { inspectUiStyles, inspectUiTemplate } from './ui-boundaries.ts'
import { inspectTestLayout } from './test-layout.ts'

const ignored = new Set([
  'node_modules',
  'dist',
  '.git',
  '.cache',
  '.vite',
  '.vite-plus',
  'coverage',
])
export function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) return []
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(file) : [file]
  })
}

export function workspacePackages(root: string): WorkspacePackage[] {
  const roots = [root]
  for (const group of ['apps', 'packages', 'internal', 'scripts']) {
    const directory = path.join(root, group)
    if (!fs.existsSync(directory)) continue
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory() && fs.existsSync(path.join(directory, entry.name, 'package.json')))
        roots.push(path.join(directory, entry.name))
      else if (entry.isDirectory() && group !== 'scripts')
        throw new Error(`${group}/${entry.name}: missing package.json`)
    }
  }
  return roots
    .map((directory) => {
      const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'))
      return {
        name: manifest.name,
        root: directory,
        exports: manifest.exports,
        dependencies: {
          ...manifest.dependencies,
          ...manifest.devDependencies,
          ...manifest.peerDependencies,
        },
      }
    })
    .sort((a, b) => b.root.length - a.root.length)
}

export function readCompilerOptions(root: string): ts.CompilerOptions {
  const config = path.join(root, 'tsconfig.json')
  if (!fs.existsSync(config)) return {}
  const read = ts.readConfigFile(config, ts.sys.readFile)
  if (read.error) throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'))
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root)
  if (parsed.errors.length)
    throw new Error(
      parsed.errors
        .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
        .join('\n'),
    )
  return parsed.options
}

export function checkBoundaries(root: string): string[] {
  const packages = workspacePackages(root)
  const files = walk(root)
  const problems = inspectTestLayout(files.map((file) => path.relative(root, file)))
  const knownFiles = new Set(files)
  for (const file of files) {
    if (file.endsWith('.js') && knownFiles.has(file.slice(0, -3) + '.ts'))
      problems.push(`${file}: generated JavaScript must not coexist with TypeScript source`)
  }
  const options = new Map<string, ts.CompilerOptions>()
  for (const pkg of packages) {
    options.set(pkg.root, readCompilerOptions(pkg.root))
  }
  for (const file of files.filter((file) => /\.(?:[cm]?[jt]sx?|vue|css)$/.test(file))) {
    const owner = packages.find((pkg) => within(pkg.root, file))
    if (!owner) throw new Error(`No workspace owner: ${file}`)
    const app = path.relative(root, owner.root).startsWith(`apps${path.sep}`)
    const source = fs.readFileSync(file, 'utf8')
    if (app && file.endsWith('.vue'))
      problems.push(...inspectUiTemplate(source, path.relative(root, file)))
    if (app && file.endsWith('.css'))
      problems.push(...inspectUiStyles(source, path.relative(root, file)))
    for (const target of extractImports(source, file)) {
      if (app && /^(reka-ui|radix-vue|shadcn-vue|vxe-table|vxe-pc-ui|@vxe-ui\/)/.test(target))
        problems.push(`${file}: use the @eap/ui or @eap/plugin-table public adapter for ${target}`)
      if (app && /^@eap\/icons(?:\/|$)/.test(target))
        problems.push(`${file}: use Icon from @eap/ui, not ${target}`)
      if (
        owner.name !== '@eap/icons' &&
        /^(?:@lucide\/|lucide-|@iconify\/|unplugin-icons(?:\/|$))/.test(target)
      )
        problems.push(`${file}: third-party icons belong inside @eap/icons`)
      if (owner.name === '@eap/icons' && /^@eap\//.test(target))
        problems.push(`${file}: @eap/icons must remain a visual leaf`)
      if (
        owner.name === '@eap/ui' &&
        /^@eap\//.test(target) &&
        !/^@eap\/(?:style|icons|request)(?:\/|$)/.test(target)
      )
        problems.push(`${file}: @eap/ui must not depend on domain package ${target}`)
      if (owner.name === '@eap/request' && /^@eap\//.test(target))
        problems.push(
          `${file}: @eap/request must remain independent of application and domain packages`,
        )
      if (
        owner.name !== '@eap/backend-mock' &&
        !file.includes(`${path.sep}__tests__${path.sep}`) &&
        /^@eap\/backend-mock(?:\/|$)/.test(target)
      )
        problems.push(`${file}: production source must not import the development mock service`)
      const resolved = ts.resolveModuleName(target, file, options.get(owner.root) ?? {}, ts.sys)
        .resolvedModule?.resolvedFileName
      problems.push(
        ...inspectImport(owner, file, target, packages, resolved && fs.realpathSync(resolved)),
      )
    }
  }
  return problems
}
