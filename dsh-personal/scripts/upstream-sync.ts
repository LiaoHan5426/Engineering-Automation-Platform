/** Read-only Git preflight; stdout is a plan, never an accepted baseline. */
import { spawnSync } from 'node:child_process'
import { readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isDeepStrictEqual, parseArgs } from 'node:util'
import { JSON_SCHEMA, load } from 'js-yaml'

const FULL_HASH = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/
const MAX_OUTPUT = 64 * 1024 * 1024
const decoder = new TextDecoder('utf-8', { fatal: true })

interface GitResult {
  status: number | null
  stdout: string
  stderr: string
  error?: Error
  signal?: string | null
}

function execute(cwd: string, args: string[], input?: string): GitResult {
  // Inherited Git routing variables must never redirect an explicit checkout.
  const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  for (const key of Object.keys(env)) {
    if (key.startsWith('GIT_') && key !== 'GIT_TERMINAL_PROMPT') delete env[key]
  }
  env.GIT_NO_LAZY_FETCH = '1'
  const result = spawnSync('git', ['--no-optional-locks', '-C', cwd, ...args], {
    env, input: input === undefined ? undefined : Buffer.from(input), encoding: 'buffer', maxBuffer: MAX_OUTPUT, timeout: 30_000,
  })
  return { ...result, stdout: decoder.decode(result.stdout ?? new Uint8Array()),
    stderr: decoder.decode(result.stderr ?? new Uint8Array()) }
}

function checked(result: GitResult): string {
  if (result.error || result.signal || result.status !== 0) {
    throw new Error(
      `Git failed (exit=${result.status}, signal=${result.signal ?? 'none'}): ${result.error?.message ?? result.stderr.trim()}`,
    )
  }
  return result.stdout
}

function git(cwd: string, args: string[]): string {
  return checked(execute(cwd, args))
}

function hash(value: string, label: string): string {
  if (!FULL_HASH.test(value)) throw new Error(`${label} must be a full lowercase commit hash`)
  return value
}

function commit(cwd: string, value: string, label: string): string {
  hash(value, label)
  if (git(cwd, ['cat-file', '-t', value]).trim() !== 'commit') {
    throw new Error(`${label} must identify a commit`)
  }
  return value
}

function inside(root: string, child: string): boolean {
  const path = relative(root, child)
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`))
}

interface DiffEntry {
  status: string
  path: string
  oldPath?: string
}

/** Parse complete git diff --name-status -z output, preserving unusual path names.
 * @param output NUL-delimited Git output.
 * @returns Every changed path, including both sides of renames.
 */
export function parseDiff(output: string): DiffEntry[] {
  if (!output) return []
  if (!output.endsWith('\0')) throw new Error('Truncated Git diff output')
  const fields = output.slice(0, -1).split('\0')
  const entries: DiffEntry[] = []
  for (let index = 0; index < fields.length;) {
    const status = fields[index++]!
    if (!/^(?:[ADMTUXB]|[RC][0-9]{1,3})$/.test(status)) throw new Error('Invalid Git diff status')
    const first = fields[index++]
    const path = /^[RC]/.test(status) ? fields[index++] : first
    for (const name of [first, path]) {
      if (!name || name.startsWith('/') || /^[A-Za-z]:/.test(name) || name.split('/').includes('..')) {
        throw new Error('Invalid or missing repository-relative Git path')
      }
    }
    entries.push(/^[RC]/.test(status) ? { status, oldPath: first!, path: path! } : { status, path: path! })
  }
  return entries
}

/** Validate ls-remote completion and resolve the advertised default branch.
 * @param result Git process result; failures never represent no updates.
 * @returns The remote HEAD commit and symbolic branch.
 */
export function parseRemoteHead(result: GitResult): { commit: string; ref: string } {
  const lines = checked(result).trim().split(/\r?\n/)
  const symbolic = lines.filter(line => /^ref: refs\/heads\/[^\s]+\tHEAD$/.test(line))
  const heads = lines.filter(line => /^[a-f0-9]+\tHEAD$/.test(line))
  if (symbolic.length !== 1 || heads.length !== 1 || lines.length !== 2) {
    throw new Error('Missing or ambiguous remote HEAD advertisement')
  }
  return { commit: hash(heads[0]!.split('\t')[0]!, 'Remote HEAD'),
    ref: symbolic[0]!.slice(5).split('\t')[0]! }
}

interface PackageManifest {
  name: string
  path: string
  dependencies: string[]
  devDependencies: string[]
  buildInputs: Record<string, unknown>
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function workspacePattern(pattern: string): RegExp {
  if (!/^[A-Za-z0-9_@./*-]+$/.test(pattern) || pattern.includes('..')) {
    throw new Error('Unsupported workspace pattern: ' + pattern)
  }
  return new RegExp('^' + pattern.split('/').map(part => part === '**' ? '.+' :
    part.split('*').map(text => text.replace(/[.]/g, '\\.')).join('[^/]*')).join('/') + '/package\\.json$')
}

/** Read manifests from commit objects, never from the checked-out worktree. */
function manifests(cwd: string, revision: string): PackageManifest[] {
  const paths = git(cwd, ['ls-tree', '-r', '--name-only', '-z', revision]).split('\0').filter(Boolean)
  if (!paths.includes('package.json')) return []
  const root: unknown = JSON.parse(git(cwd, ['show', revision + ':package.json']))
  if (!object(root)) throw new Error('Invalid root manifest at ' + revision)
  let workspaces: unknown = root.workspaces ?? []
  if (paths.includes('pnpm-workspace.yaml')) {
    const workspace: unknown = load(git(cwd, ['show', revision + ':pnpm-workspace.yaml']), { schema: JSON_SCHEMA })
    if (!object(workspace)) throw new Error('Invalid pnpm workspace at ' + revision)
    workspaces = workspace.packages
  }
  if (!Array.isArray(workspaces) || !workspaces.every(item => typeof item === 'string')) {
    throw new Error('Expected root manifest workspaces array at ' + revision)
  }
  const patterns = workspaces.map(workspacePattern)
  const selected = paths.filter(path => path === 'package.json' || patterns.some(pattern => pattern.test(path)))
  // Hash requests avoid newline-bearing paths entering cat-file's line protocol.
  const tree = git(cwd, ['ls-tree', '-r', '-z', revision]).split('\0').filter(Boolean)
  const blobs = new Map(tree.map(line => {
    const tab = line.indexOf('\t')
    return [line.slice(tab + 1), line.slice(0, tab).split(' ')[2]!]
  }))
  const output = Buffer.from(checked(execute(cwd, ['cat-file', '--batch'], selected.map(path => blobs.get(path)).join('\n') + '\n')))
  let offset = 0
  const result: PackageManifest[] = []
  const names = new Set<string>()
  for (const path of selected) {
    const end = output.indexOf(10, offset)
    const header = output.subarray(offset, end).toString('utf8').split(' ')
    const size = Number(header[2])
    if (end < offset || header[1] !== 'blob' || !Number.isSafeInteger(size) || size < 0 || end + size + 1 >= output.length) {
      throw new Error('Incomplete manifest batch at ' + path)
    }
    const value: unknown = JSON.parse(output.subarray(end + 1, end + 1 + size).toString('utf8'))
    offset = end + size + 2
    if (!object(value) || typeof value.name !== 'string' || !value.name) throw new Error('Missing package name at ' + path)
    if (names.has(value.name)) throw new Error('Duplicate package name: ' + value.name)
    names.add(value.name)
    const keys = (section: string): string[] => {
      const deps = value[section] ?? {}
      if (!object(deps) || !Object.values(deps).every(item => typeof item === 'string')) throw new Error('Invalid ' + section + ' at ' + path)
      return Object.keys(deps)
    }
    result.push({ name: value.name, path: path === 'package.json' ? '' : path.slice(0, -13),
      dependencies: [...new Set([...keys('dependencies'), ...keys('optionalDependencies'), ...keys('peerDependencies')])].sort(),
      devDependencies: keys('devDependencies').sort(),
      buildInputs: Object.fromEntries(Object.entries(value).filter(([key]) =>
        !['version', 'description', 'license', 'author', 'contributors', 'repository', 'homepage', 'bugs', 'keywords', 'funding'].includes(key))),
    })
  }
  return result
}

function owner(path: string, packages: PackageManifest[]): string | null {
  return packages.filter(pkg => pkg.path && (path === pkg.path || path.startsWith(pkg.path + '/')))
    .sort((a, b) => b.path.length - a.path.length)[0]?.name ?? packages.find(pkg => !pkg.path)?.name ?? null
}

/** Condense runtime/optional/peer cycles before dependency-first Kahn batches. */
function dependencyOrder(packages: PackageManifest[], affected: Set<string>) {
  const graph = new Map(packages.map(pkg => [pkg.name, pkg.dependencies.filter(name => affected.has(name))]))
  const visited = new Set<string>()
  const order: string[] = []
  const visit = (name: string) => {
    if (visited.has(name)) return
    visited.add(name)
    for (const dependency of graph.get(name) ?? []) visit(dependency)
    order.push(name)
  }
  for (const name of [...affected].sort()) visit(name)
  const reverse = new Map<string, string[]>()
  for (const [name, dependencies] of graph) for (const dep of dependencies) reverse.set(dep, [...(reverse.get(dep) ?? []), name])
  visited.clear()
  const components: string[][] = []
  const collect = (name: string, component: string[]) => {
    if (visited.has(name) || !affected.has(name)) return
    visited.add(name)
    component.push(name)
    for (const dependent of reverse.get(name) ?? []) collect(dependent, component)
  }
  for (const name of order.reverse()) {
    if (visited.has(name)) continue
    const component: string[] = []
    collect(name, component)
    components.push(component.sort())
  }
  const pending = [...components]
  const done = new Set<string>()
  const batches: string[][][] = []
  while (pending.length) {
    const ready = pending.filter(component => component.every(name =>
      (graph.get(name) ?? []).every(dep => done.has(dep) || component.includes(dep))))
    if (!ready.length) throw new Error('Could not order package components')
    batches.push(ready.sort((a, b) => a[0]!.localeCompare(b[0]!)))
    for (const component of ready) {
      pending.splice(pending.indexOf(component), 1)
      for (const name of component) done.add(name)
    }
  }
  return { batches, cycles: components.filter(component => component.length > 1 || (graph.get(component[0]!) ?? []).includes(component[0]!)) }
}

function incrementalPlan(cwd: string, B: string, U: string, entries: DiffEntry[]) {
  const before = manifests(cwd, B)
  const after = B === U ? before : manifests(cwd, U)
  const categories = {
    'host-direct-update': { paths: [] as string[], minimum: ['Review and apply upstream delta', 'Run affected Host specs, lint and typecheck'] },
    'client-convert-or-review': { paths: [] as string[], minimum: ['Review upstream client delta against Personal Vue implementation', 'Convert changed behavior only; run affected specs, client build and browser checks'] },
    'build-tooling': { paths: [] as string[], minimum: ['Separate manifest metadata-only bumps from dependency/script/export changes using manifestChanges', 'For metadata-only bumps verify version and lockfile consistency; otherwise run changed gate specs, lint and generated artifact consumer checks'] },
    'tests-docs': { paths: [] as string[], minimum: ['Run changed specs or documentation gates'] },
    'unclassified-review': { paths: [] as string[], minimum: ['Determine owner and affected execution path before selecting checks'] },
  }
  const changes = entries.map(entry => {
    const oldPath = entry.oldPath ?? entry.path
    const oldOwner = entry.status.startsWith('A') ? null : owner(oldPath, before)
    const newOwner = entry.status.startsWith('D') ? null : owner(entry.path, after)
    const paths = [...new Set([oldPath, entry.path])]
    const kinds = paths.map(path => {
      if (/^(scripts\/|native\/|vendor\/)|(^|\/)(package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig[^/]*|vite[^/]*|[^/]*config\.[^/]+)$/.test(path)) return 'build-tooling' as const
      if (/^(docs|website|snapshots|\.agents|\.github)\/|\.(md|yaml)$|\.(spec|test)\.[^/]+$|(^|\/)(tests|__tests__)\//.test(path)) return 'tests-docs' as const
      if (/^packages\/client\/|^apps\/(web|desktop)\/|\/src\/client\/|\.tsx$/.test(path)) return 'client-convert-or-review' as const
      if (/^packages\/|^apps\//.test(path)) return 'host-direct-update' as const
      return 'unclassified-review' as const
    })
    for (let i = 0; i < paths.length; i++) categories[kinds[i]!].paths.push(paths[i]!)
    return { ...entry, oldOwner, newOwner, categories: [...new Set(kinds)] }
  })
  const manifestChanges = [...new Set([...before, ...after].map(pkg => pkg.name))].sort().flatMap(name => {
    const oldPackage = before.find(pkg => pkg.name === name)
    const newPackage = after.find(pkg => pkg.name === name)
    const manifestPath = (pkg: PackageManifest) => (pkg.path ? pkg.path + '/' : '') + 'package.json'
    if (!entries.some(entry => [oldPackage, newPackage].some(pkg => pkg &&
      [entry.path, entry.oldPath].includes(manifestPath(pkg))))) return []
    return [{ name, beforePath: oldPackage?.path ?? null, afterPath: newPackage?.path ?? null,
      kind: !oldPackage ? 'added' : !newPackage ? 'removed' :
        oldPackage.path === newPackage.path && isDeepStrictEqual(oldPackage.buildInputs, newPackage.buildInputs) ? 'metadata-only' : 'build-inputs' }]
  })
  const metadataNames = new Set(manifestChanges.filter(change => change.kind === 'metadata-only').map(change => change.name))
  const executionChanges = changes.filter(change => !((change.path === 'package.json' || change.path.endsWith('/package.json')) &&
    metadataNames.has(change.newOwner ?? change.oldOwner ?? '')))
  const executionChanged = new Set(executionChanges.flatMap(change => [change.oldOwner, change.newOwner].filter((name): name is string => name !== null)))
  const directlyChanged = new Set(changes.flatMap(change => [change.oldOwner, change.newOwner].filter((name): name is string => name !== null)))
  const affected = new Set(executionChanged)
  // Baseline edges retain removed dependencies/packages as impact seeds; U owns build order.
  let previous = -1
  while (previous !== affected.size) {
    previous = affected.size
    for (const pkg of [...before, ...after]) if (pkg.dependencies.some(dep => affected.has(dep))) affected.add(pkg.name)
  }
  const targetNames = new Set(after.map(pkg => pkg.name))
  const targetAffected = new Set([...affected].filter(name => targetNames.has(name)))
  const devTestDependents = after.filter(pkg => pkg.devDependencies.some(dep => affected.has(dep))).map(pkg => pkg.name).sort()
  const fullBuildReasons: string[] = []
  if (manifestChanges.some(change => change.kind !== 'metadata-only')) fullBuildReasons.push('Package dependency, script, export, build input or membership changes')
  if (entries.some(entry => [entry.path, entry.oldPath ?? entry.path].some(path =>
    /^(pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig[^/]*|vite[^/]*)$|^scripts\/(build|compile|generate)|^native\/|^vendor\//.test(path)))) fullBuildReasons.push('Workspace dependency, shared compiler/build pipeline, vendor or native changes')
  if (changes.some(change => change.oldOwner === null && change.newOwner === null)) fullBuildReasons.push('Ownership incomplete: review impact; full build required until narrowed with evidence')
  for (const category of Object.values(categories)) category.paths = [...new Set(category.paths)].sort()
  return {
    range: { from: B, to: U, comparison: 'B..U tree delta', manifestTrees: { baseline: B, target: U } },
    changes, directlyChangedPackages: [...directlyChanged].sort(), affectedPackages: [...affected].sort(),
    executionChangedPackages: [...executionChanged].sort(),
    metadataOnlyPackages: [...metadataNames].filter(name => !executionChanged.has(name)).sort(),
    downstreamPackages: [...affected].filter(name => !executionChanged.has(name)).sort(),
    removedPackages: before.filter(pkg => !targetNames.has(pkg.name)).map(pkg => pkg.name).sort(),
    packages: after.map(({ buildInputs: _buildInputs, ...pkg }) => pkg), manifestChanges,
    ...dependencyOrder(after, targetAffected), devTestDependents,
    dependencyPolicy: 'Runtime, optional and peer dependencies order SCC batches and downstream closure; dev dependencies are separate test consumers, not production build edges.',
    categories, personalCustomization: { action: 'retain-unchanged', reason: 'Only B..U deltas are planned; existing Personal customizations outside this delta are not migration work. Overlaps require review, not overwrite.' },
    validation: { status: 'not-run', fullBuildRequired: fullBuildReasons.length > 0, fullBuildReasons,
      fullBuild: ['pnpm run build:artifacts', 'pnpm run build:check'],
      escalation: ['Run full build when ownership cannot be resolved, shared dependency/config/code generation changes, public type surfaces cross build faces, or focused checks expose broader breakage.'],
      note: 'Suggestions only; passing tests/builds must be recorded separately. No acceptance or baseline mutation.' },
  }
}

function scopeMode(mode: string | undefined, baseRef: string | undefined, targetRef: string | undefined): string {
  if (mode !== undefined && mode !== 'release' && mode !== 'master') throw new Error('--mode must be release or master')
  if ((baseRef === undefined) !== (targetRef === undefined)) throw new Error('--release-base and --release-target must be supplied together')
  if (mode === 'release' && baseRef === undefined) throw new Error('--mode release requires --release-base and --release-target')
  return mode ?? (baseRef === undefined ? 'explicit-commit' : 'release')
}

function releaseScope(cwd: string, B: string, U: string, entryCount: number,
  selectedMode: string, baseRef: string | undefined, targetRef: string | undefined) {
  const commitRange = { from: B, to: U, entryCount,
    commitCount: Number(git(cwd, ['rev-list', '--count', B + '..' + U]).trim()),
    shortstat: git(cwd, ['diff', '--shortstat', B, U, '--']).trim() }
  if (baseRef === undefined || targetRef === undefined) {
    return { mode: selectedMode, status: 'release-not-checked', commitRange,
      note: 'Explicit commit/master scope; no claim that this equals a release tag upgrade.' }
  }
  const resolveRef = (ref: string): string => {
    if (!ref || ref.startsWith('-')) throw new Error('Invalid release ref: ' + ref)
    return hash(git(cwd, ['rev-parse', '--verify', '--end-of-options', ref + '^{commit}']).trim(), 'release commit')
  }
  const from = resolveRef(baseRef)
  const to = resolveRef(targetRef)
  checked(execute(cwd, ['merge-base', '--is-ancestor', from, to]))
  const tree = (commit: string) => git(cwd, ['rev-parse', '--verify', commit + '^{tree}']).trim()
  const baselineTreeMatches = tree(B) === tree(from)
  const targetTreeMatches = tree(U) === tree(to)
  const releaseEntries = parseDiff(git(cwd, ['diff', '--name-status', '-z', '--find-renames', from, to, '--']))
  return { mode: selectedMode, status: baselineTreeMatches && targetTreeMatches ? 'scope-match' : 'scope-mismatch',
    commitRange, releaseRange: { baseRef, targetRef, from, to, entryCount: releaseEntries.length,
      commitCount: Number(git(cwd, ['rev-list', '--count', from + '..' + to]).trim()),
      shortstat: git(cwd, ['diff', '--shortstat', from, to, '--']).trim() },
    baselineTreeMatches, targetTreeMatches,
    entryCountDifference: entryCount - releaseEntries.length,
    note: baselineTreeMatches && targetTreeMatches ? 'Endpoint trees match release scope; commit counts may differ through merges.' :
      'B..U differs from the requested release endpoint trees. Review scope before migration; no commits or accepted baseline were changed.' }
}

const HELP = `Usage (run from dsh-personal):
  pnpm exec tsx scripts/upstream-sync.ts --personal . --upstream PATH --target FULL_HASH --state STATE_PATH
  pnpm exec tsx scripts/upstream-sync.ts --personal . --upstream PATH --target FULL_HASH --baseline FULL_HASH
  pnpm exec tsx scripts/upstream-sync.ts --personal . --upstream PATH --target FULL_HASH --initial
  pnpm exec tsx scripts/upstream-sync.ts --discover REMOTE_URL

--initial reads source-inventory.json sourceCommit for the FIRST comparison only.
Later runs require --state or --baseline: the last fully accepted upstream commit.
--state reads schemaVersion:1, acceptedUpstreamCommit and acceptedPersonalCommit (full hash or null).
The state file must exist inside Personal; candidates never select the baseline.
An unresolved pending.targetUpstreamCommit must match --target.
--upstream must name the checkout root, separate from --personal.
All planning is local and read-only. --discover only runs git ls-remote --symref.
JSON stdout reports B (baseline), U (target), P (Personal), counts and complete entries.
Use --mode release --release-base TAG --release-target TAG to compare release trees with B/U.
Use --mode master for an explicit master sync; omitted mode reports explicit-commit.
A scope-mismatch must be reviewed before migration; the script never substitutes refs for B/U.
Save stdout with shell redirection if needed; no state or source files are written.
`

/** Render a read-only plan or remote discovery; reject ambiguous CLI inputs.
 * @param argv CLI arguments without the executable and script.
 * @param cwd Directory used to resolve explicit paths and run remote discovery.
 * @returns JSON report or command help.
 */
export function renderUpstreamSync(argv: string[], cwd: string): string {
  const { values } = parseArgs({ args: argv, strict: true, allowPositionals: false, options: {
    personal: { type: 'string' }, upstream: { type: 'string' }, target: { type: 'string' },
    baseline: { type: 'string' }, state: { type: 'string' }, initial: { type: 'boolean' }, discover: { type: 'string' },
    mode: { type: 'string' }, 'release-base': { type: 'string' }, 'release-target': { type: 'string' },
    help: { type: 'boolean' },
  } })
  if (values.help) return HELP
  if (values.discover !== undefined) {
    if (!values.discover || values.discover.startsWith('-') || Object.keys(values).length !== 1) {
      throw new Error('--discover REMOTE_URL must be used alone')
    }
    return JSON.stringify({ status: 'discovered', ...parseRemoteHead(
      execute(cwd, ['ls-remote', '--symref', values.discover, 'HEAD']),
    ) }, null, 2) + '\n'
  }
  if (!values.personal || !values.upstream || !values.target ||
    [values.baseline !== undefined, values.state !== undefined, Boolean(values.initial)].filter(Boolean).length !== 1) {
    throw new Error('Required: --personal PATH --upstream PATH --target FULL_HASH and exactly one of --state PATH / --baseline FULL_HASH / --initial')
  }
  const mode = scopeMode(values.mode, values['release-base'], values['release-target'])
  const personal = realpathSync(resolve(cwd, values.personal))
  const upstream = realpathSync(resolve(cwd, values.upstream))
  if (inside(personal, upstream) || inside(upstream, personal)) {
    throw new Error('Personal and upstream must be separate, non-nested directories')
  }
  const upstreamRoot = realpathSync(git(upstream, ['rev-parse', '--show-toplevel']).trim())
  if (upstreamRoot !== upstream) throw new Error('--upstream must name the Git checkout root')
  // Personal may be a subtree of the integration repository.
  const personalGitRoot = realpathSync(git(personal, ['rev-parse', '--show-toplevel']).trim())
  if (!inside(personalGitRoot, personal) || personalGitRoot === upstreamRoot) {
    throw new Error('Personal must belong to a different Git checkout')
  }
  let baseline = values.baseline
  if (values.state !== undefined) {
    const statePath = realpathSync(resolve(cwd, values.state))
    if (!inside(personal, statePath)) throw new Error('--state must name a file inside Personal')
    const state: unknown = JSON.parse(readFileSync(statePath, 'utf8'))
    if (typeof state !== 'object' || state === null || !('schemaVersion' in state) || state.schemaVersion !== 1 ||
      !('acceptedUpstreamCommit' in state) || typeof state.acceptedUpstreamCommit !== 'string' ||
      !('acceptedPersonalCommit' in state) ||
      (state.acceptedPersonalCommit !== null && typeof state.acceptedPersonalCommit !== 'string')) {
      throw new Error('Invalid state: expected schemaVersion:1, acceptedUpstreamCommit and acceptedPersonalCommit (hash or null)')
    }
    baseline = hash(state.acceptedUpstreamCommit, 'acceptedUpstreamCommit')
    if (state.acceptedPersonalCommit !== null) hash(state.acceptedPersonalCommit, 'acceptedPersonalCommit')
    if ('pending' in state && state.pending !== null) {
      const pending = state.pending
      if (typeof pending !== 'object' || pending === null ||
        !('targetUpstreamCommit' in pending) || typeof pending.targetUpstreamCommit !== 'string' ||
        !('personalBaseCommit' in pending) || typeof pending.personalBaseCommit !== 'string' ||
        !('record' in pending) || typeof pending.record !== 'string' || !pending.record.trim()) {
        throw new Error('Invalid pending state: expected targetUpstreamCommit, personalBaseCommit and record')
      }
      hash(pending.targetUpstreamCommit, 'pending.targetUpstreamCommit')
      hash(pending.personalBaseCommit, 'pending.personalBaseCommit')
      if (pending.targetUpstreamCommit !== values.target) {
        throw new Error('--target differs from the unresolved pending target')
      }
    }
  } else if (values.initial) {
    const inventoryPath = realpathSync(resolve(personal, 'source-inventory.json'))
    if (!inside(personal, inventoryPath)) throw new Error('source-inventory.json must be inside Personal')
    const inventory: unknown = JSON.parse(readFileSync(inventoryPath, 'utf8'))
    if (typeof inventory !== 'object' || inventory === null || !('sourceCommit' in inventory) || typeof inventory.sourceCommit !== 'string') {
      throw new Error('Personal source-inventory.json must contain sourceCommit')
    }
    baseline = inventory.sourceCommit
  }
  if (baseline === undefined) throw new Error('Missing baseline')
  const B = commit(upstream, baseline, 'Baseline')
  const U = commit(upstream, values.target, 'Target')
  const ancestry = execute(upstream, ['merge-base', '--is-ancestor', B, U])
  if (ancestry.status === 1 && !ancestry.error && !ancestry.signal) throw new Error('Baseline is not an ancestor of target')
  checked(ancestry)
  const count = git(upstream, ['rev-list', '--count', `${B}..${U}`]).trim()
  if (!/^\d+$/.test(count) || !Number.isSafeInteger(Number(count))) throw new Error('Invalid Git commit count')
  const entries = parseDiff(git(upstream, ['diff', '--no-ext-diff', '--no-textconv', '--name-status', '-z', '--find-renames', B, U, '--']))
  const byStatus: Record<string, number> = {}
  const paths = new Set<string>()
  for (const entry of entries) {
    const code = entry.status[0]!
    byStatus[code] = (byStatus[code] ?? 0) + 1
    paths.add(entry.path)
    if (entry.oldPath) paths.add(entry.oldPath)
  }
  return JSON.stringify({ formatVersion: 1, status: B === U ? 'no-change' : 'update-available',
    B, U, P: { root: personal, gitRoot: personalGitRoot, head: git(personal, ['rev-parse', '--verify', 'HEAD']).trim(),
      status: git(personal, ['status', '--porcelain=v1', '-z', '--untracked-files=normal', '--', personal]) },
    upstream, baselineSource: values.initial ? 'initial-source-inventory' : values.state !== undefined ? 'accepted-state' : 'explicit',
    commitCount: Number(count), summary: { entryCount: entries.length, pathCount: paths.size, byStatus }, entries,
    upgradeScope: releaseScope(upstream, B, U, entries.length, mode, values['release-base'], values['release-target']),
    incremental: incrementalPlan(upstream, B, U, entries),
  }, null, 2) + '\n'
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.stdout.write(renderUpstreamSync(process.argv.slice(2), process.cwd()))
  } catch (error) {
    process.stderr.write(`upstream-sync: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
