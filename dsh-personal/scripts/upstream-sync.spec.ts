/** Real Git regressions for read-only upstream planning. */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { parseDiff, parseRemoteHead, renderUpstreamSync } from './upstream-sync.ts'

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'Planner test', GIT_AUTHOR_EMAIL: 'planner@example.test',
      GIT_COMMITTER_NAME: 'Planner test', GIT_COMMITTER_EMAIL: 'planner@example.test',
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' },
  })
  if (result.status !== 0 || result.error) throw new Error(result.error?.message ?? result.stderr)
  return result.stdout.trim()
}

function save(cwd: string, name: string, text = name): void {
  writeFileSync(join(cwd, name), text)
}

function commit(cwd: string): string {
  git(cwd, 'add', '--all')
  git(cwd, '-c', 'core.hooksPath=', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture')
  return git(cwd, 'rev-parse', 'HEAD')
}

describe('upstream plan', () => {
  let root: string
  let upstream: string
  let personal: string
  let baseline: string
  let target: string
  let args: string[]

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'dsh-upstream-sync-'))
    upstream = join(root, 'upstream')
    personal = join(root, 'personal')
    for (const cwd of [upstream, personal]) {
      mkdirSync(cwd)
      git(cwd, 'init', '--initial-branch=main')
    }
    save(upstream, 'deleted.txt')
    save(upstream, 'before rename.txt', 'unchanged rename content\n')
    save(upstream, 'modified.txt', 'old')
    baseline = commit(upstream)
    rmSync(join(upstream, 'deleted.txt'))
    renameSync(join(upstream, 'before rename.txt'), join(upstream, 'after rename.txt'))
    save(upstream, 'added.txt')
    save(upstream, 'modified.txt', 'new')
    target = commit(upstream)
    save(personal, 'source-inventory.json', JSON.stringify({ sourceCommit: baseline }))
    commit(personal)
    args = ['--personal', personal, '--upstream', upstream, '--target', target, '--baseline', baseline]
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    rmSync(root, { recursive: true, force: true })
  })

  it('reports complete additions, removals, renames and edits without changing either tree', () => {
    const inventory = readFileSync(join(personal, 'source-inventory.json'), 'utf8')
    const originalHead = git(personal, 'rev-parse', 'HEAD')
    const plan = JSON.parse(renderUpstreamSync(args, root))
    expect(plan).toMatchObject({ status: 'update-available', B: baseline, U: target,
      commitCount: 1, baselineSource: 'explicit', P: { head: originalHead, status: '' },
      summary: { entryCount: 4, pathCount: 5, byStatus: { A: 1, D: 1, R: 1, M: 1 } } })
    expect(plan.entries).toEqual(expect.arrayContaining([
      { status: 'A', path: 'added.txt' }, { status: 'D', path: 'deleted.txt' },
      { status: 'R100', oldPath: 'before rename.txt', path: 'after rename.txt' },
      { status: 'M', path: 'modified.txt' },
    ]))
    expect(readFileSync(join(personal, 'source-inventory.json'), 'utf8')).toBe(inventory)
    expect(git(personal, 'status', '--porcelain')).toBe('')
    expect(git(upstream, 'status', '--porcelain')).toBe('')
    expect(git(personal, 'rev-parse', 'HEAD')).toBe(originalHead)
    expect(git(upstream, 'rev-parse', 'HEAD')).toBe(target)
  })

  it('uses inventory only with explicit first-run mode and never reads partial candidate state', () => {
    save(personal, 'upstream-candidate.json', JSON.stringify({ status: 'partial', target }))
    expect(() => renderUpstreamSync(args.slice(0, -2), root)).toThrow('exactly one')
    const plan = JSON.parse(renderUpstreamSync([...args.slice(0, -2), '--initial'], root))
    expect(plan.B).toBe(baseline)
    expect(plan.baselineSource).toBe('initial-source-inventory')
    expect(() => renderUpstreamSync([...args, '--initial'], root)).toThrow('exactly one')
  })

  it('reads only the accepted upstream baseline from versioned state', () => {
    const state = { schemaVersion: 1, acceptedUpstreamCommit: baseline, acceptedPersonalCommit: null,
      candidate: { status: 'partial', target } }
    const statePath = join(personal, 'state.json')
    save(personal, 'state.json', JSON.stringify(state))
    save(personal, 'source-inventory.json', 'invalid inventory intentionally unused')
    const plan = JSON.parse(renderUpstreamSync([...args.slice(0, -2), '--state', statePath], root))
    expect(plan).toMatchObject({ B: baseline, U: target, baselineSource: 'accepted-state' })
    expect(JSON.parse(readFileSync(statePath, 'utf8'))).toEqual(state)
    expect(() => renderUpstreamSync([...args, '--state', statePath], root)).toThrow('exactly one')
  })

  it('rejects absent, malformed, unsupported and invalid-hash accepted state without fallback', () => {
    const statePath = join(personal, 'state.json')
    const input = [...args.slice(0, -2), '--state', statePath]
    expect(() => renderUpstreamSync(input, root)).toThrow()
    for (const state of ['{', '{}',
      JSON.stringify({ schemaVersion: 2, acceptedUpstreamCommit: baseline, acceptedPersonalCommit: null }),
      JSON.stringify({ schemaVersion: 1, acceptedUpstreamCommit: 'HEAD', acceptedPersonalCommit: null }),
      JSON.stringify({ schemaVersion: 1, acceptedUpstreamCommit: baseline, acceptedPersonalCommit: 'bad' }),
      JSON.stringify({ schemaVersion: 1, acceptedUpstreamCommit: baseline }),
    ]) {
      save(personal, 'state.json', state)
      expect(() => renderUpstreamSync(input, root)).toThrow()
    }
  })

  it('preserves the unresolved pending target and rejects malformed pending records', () => {
    const statePath = join(personal, 'state.json')
    const input = [...args.slice(0, -2), '--state', statePath]
    const state = { schemaVersion: 1, acceptedUpstreamCommit: baseline, acceptedPersonalCommit: null,
      acceptedRecord: null, pending: { targetUpstreamCommit: target,
        personalBaseCommit: git(personal, 'rev-parse', 'HEAD'), record: '../docs/evidence/sync.md' } }
    save(personal, 'state.json', JSON.stringify(state))
    expect(JSON.parse(renderUpstreamSync(input, root)).B).toBe(baseline)
    state.pending.targetUpstreamCommit = baseline
    save(personal, 'state.json', JSON.stringify(state))
    expect(() => renderUpstreamSync(input, root)).toThrow('unresolved pending target')
    save(personal, 'state.json', JSON.stringify({ ...state, pending: { targetUpstreamCommit: target } }))
    expect(() => renderUpstreamSync(input, root)).toThrow('Invalid pending state')
  })

  it('rejects an accepted-state file outside Personal', () => {
    save(upstream, 'outside-state.json', JSON.stringify({ schemaVersion: 1, acceptedUpstreamCommit: baseline, acceptedPersonalCommit: null }))
    expect(() => renderUpstreamSync([...args.slice(0, -2), '--state', join(upstream, 'outside-state.json')], root)).toThrow('inside Personal')
  })

  it('reports equal commits as no-change with no entries', () => {
    const plan = JSON.parse(renderUpstreamSync([...args.slice(0, -1), target], root))
    expect(plan).toMatchObject({ status: 'no-change', commitCount: 0, entries: [],
      summary: { entryCount: 0, pathCount: 0, byStatus: {} } })
  })

  it('requires full existing commit objects rather than refs, missing hashes or blobs', () => {
    for (const bad of ['HEAD', baseline.slice(0, 10), 'f'.repeat(40), git(upstream, 'rev-parse', target + ':added.txt')]) {
      expect(() => renderUpstreamSync([...args.slice(0, -1), bad], root)).toThrow()
      expect(() => renderUpstreamSync([...args.slice(0, 5), bad, ...args.slice(6)], root)).toThrow()
    }
  })

  it('rejects diverged history and reversed baselines', () => {
    git(upstream, 'checkout', '-b', 'other', baseline)
    save(upstream, 'other.txt')
    const diverged = commit(upstream)
    expect(() => renderUpstreamSync([...args.slice(0, -1), diverged], root)).toThrow('not an ancestor')
    expect(() => renderUpstreamSync([...args.slice(0, 5), baseline, '--baseline', target], root)).toThrow('not an ancestor')
  })

  it('rejects same, nested, non-root and confused checkout paths', () => {
    expect(() => renderUpstreamSync(['--personal', upstream, ...args.slice(2)], root)).toThrow('separate')
    mkdirSync(join(upstream, 'child'))
    expect(() => renderUpstreamSync(['--personal', personal, '--upstream', join(upstream, 'child'), ...args.slice(4)], root)).toThrow('checkout root')
    expect(() => renderUpstreamSync(['--personal', root, ...args.slice(2)], root)).toThrow('separate')
    expect(() => renderUpstreamSync([...args, '--unknown'], root)).toThrow()
  })

  it('supports Personal as a repository subtree and scopes dirty paths to that subtree', () => {
    const subtree = join(personal, 'nested')
    mkdirSync(subtree)
    save(subtree, 'source-inventory.json', JSON.stringify({ sourceCommit: baseline }))
    commit(personal)
    save(personal, 'outside.txt')
    const plan = JSON.parse(renderUpstreamSync(['--personal', subtree, ...args.slice(2)], root))
    expect(plan.P.root).toBe(subtree)
    expect(plan.P.status).toBe('')
  })

  it('ignores inherited Git checkout routing variables', () => {
    vi.stubEnv('GIT_DIR', join(personal, '.git'))
    vi.stubEnv('GIT_WORK_TREE', personal)
    vi.stubEnv('GIT_INDEX_FILE', join(root, 'wrong-index'))
    const plan = JSON.parse(renderUpstreamSync(args, root))
    expect(plan.U).toBe(target)
    expect(plan.summary.byStatus).toEqual({ A: 1, D: 1, R: 1, M: 1 })
  })

  function packageFixture(pnpm = true): string {
    save(upstream, 'package.json', JSON.stringify({ name: 'root', workspaces: pnpm ? ['obsolete/*'] : ['packages/*/*'] }))
    if (pnpm) save(upstream, 'pnpm-workspace.yaml', 'packages:\n  - packages/*/*\n')
    const manifests = [
      { name: 'base', dependencies: {} },
      { name: 'host', dependencies: { base: 'workspace:*' } },
      { name: 'client', peerDependencies: { host: 'workspace:*' } },
      { name: 'test-only', devDependencies: { base: 'workspace:*' } },
      { name: 'optional', optionalDependencies: { host: 'workspace:*' } },
    ]
    for (const manifest of manifests) {
      const directory = join(upstream, 'packages', manifest.name === 'client' ? 'client' : 'core', manifest.name)
      mkdirSync(directory, { recursive: true })
      save(directory, 'package.json', JSON.stringify(manifest))
      save(directory, 'source.ts', 'export const value = 1\n')
    }
    return commit(upstream)
  }

  it('uses B and U manifests even when checkout differs; orders runtime and peer dependents before dev-only checks', () => {
    const B = packageFixture()
    save(join(upstream, 'packages/core/base'), 'source.ts', 'export const value = 2\n')
    const U = commit(upstream)
    git(upstream, 'checkout', '--detach', baseline)
    const report = JSON.parse(renderUpstreamSync([...args.slice(0, 5), U, '--baseline', B], root)).incremental
    expect(report.range).toMatchObject({ from: B, to: U, manifestTrees: { baseline: B, target: U } })
    expect(report.directlyChangedPackages).toEqual(['base'])
    expect(report.downstreamPackages).toEqual(['client', 'host', 'optional'])
    expect(report.batches).toEqual([[['base']], [['host']], [['client'], ['optional']]])
    expect(report.devTestDependents).toEqual(['test-only'])
    expect(report.cycles).toEqual([])
    expect(report.validation).toMatchObject({ status: 'not-run', fullBuildRequired: false })
    expect(report.categories['host-direct-update'].paths).toEqual(['packages/core/base/source.ts'])
    expect(git(upstream, 'rev-parse', 'HEAD')).toBe(baseline)
    const noChange = JSON.parse(renderUpstreamSync([...args.slice(0, 5), U, '--baseline', U], root)).incremental
    expect(noChange.batches).toEqual([])
    expect(noChange.directlyChangedPackages).toEqual([])
  })

  it('retains deleted and renamed package ownership and baseline dependency impact', () => {
    const B = packageFixture()
    rmSync(join(upstream, 'packages/core/base'), { recursive: true })
    renameSync(join(upstream, 'packages/core/host'), join(upstream, 'packages/core/renamed'))
    const U = commit(upstream)
    const report = JSON.parse(renderUpstreamSync([...args.slice(0, 5), U, '--baseline', B], root)).incremental
    expect(report.removedPackages).toEqual(['base'])
    expect(report.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'D', path: 'packages/core/base/package.json', oldOwner: 'base', newOwner: null }),
      expect.objectContaining({ status: 'R100', oldOwner: 'host', newOwner: 'host' }),
    ]))
    expect(report.affectedPackages).toEqual(['base', 'client', 'host', 'optional'])
    expect(report.batches).toEqual([[['host']], [['client'], ['optional']]])
    expect(report.packages.find((pkg: { name: string }) => pkg.name === 'host').path).toBe('packages/core/renamed')
  })

  it('condenses peer/runtime cycles and separates client, tooling and test review', () => {
    const B = packageFixture(false)
    save(join(upstream, 'packages/core/base'), 'package.json', JSON.stringify({ name: 'base', dependencies: { host: 'workspace:*' } }))
    save(join(upstream, 'packages/client/client'), 'source.ts', 'export const value = 2\n')
    mkdirSync(join(upstream, 'scripts'))
    save(join(upstream, 'scripts'), 'build.ts')
    save(upstream, 'notes.md')
    const U = commit(upstream)
    const report = JSON.parse(renderUpstreamSync([...args.slice(0, 5), U, '--baseline', B], root)).incremental
    expect(report.cycles).toEqual([['base', 'host']])
    expect(report.batches[0]).toContainEqual(['base', 'host'])
    expect(report.batches[1]).toEqual([['client'], ['optional']])
    expect(report.categories['client-convert-or-review'].paths).toEqual(['packages/client/client/source.ts'])
    expect(report.categories['build-tooling'].paths).toContain('scripts/build.ts')
    expect(report.categories['tests-docs'].paths).toEqual(['notes.md'])
    expect(report.personalCustomization.action).toBe('retain-unchanged')
    expect(report.validation.fullBuildRequired).toBe(true)
  })

  it('retains version-only manifest attribution without expanding production validation or requiring full build', () => {
    const B = packageFixture()
    save(upstream, 'package.json', JSON.stringify({ name: 'root', workspaces: ['obsolete/*'], version: '2.0.0' }))
    save(join(upstream, 'packages/core/base'), 'package.json', JSON.stringify({ name: 'base', dependencies: {}, version: '2.0.0' }))
    const U = commit(upstream)
    const report = JSON.parse(renderUpstreamSync([...args.slice(0, 5), U, '--baseline', B], root)).incremental
    expect(report.directlyChangedPackages).toEqual(['base', 'root'])
    expect(report.metadataOnlyPackages).toEqual(['base', 'root'])
    expect(report.executionChangedPackages).toEqual([])
    expect(report.affectedPackages).toEqual([])
    expect(report.batches).toEqual([])
    expect(report.manifestChanges.map((change: { kind: string }) => change.kind)).toEqual(['metadata-only', 'metadata-only'])
    expect(report.validation.fullBuildRequired).toBe(false)
    expect(report.validation.status).toBe('not-run')
  })

  it('rejects malformed target manifests instead of using local checkout data', () => {
    const B = packageFixture()
    save(join(upstream, 'packages/core/base'), 'package.json', '{')
    const U = commit(upstream)
    git(upstream, 'checkout', '--detach', B)
    expect(() => renderUpstreamSync([...args.slice(0, 5), U, '--baseline', B], root)).toThrow()
  })

  it('compares release refs with commit ranges and reports differing endpoint trees', () => {
    git(upstream, 'tag', 'rc3', baseline)
    git(upstream, 'tag', 'rc4', target)
    save(upstream, 'master-only.ts')
    const master = commit(upstream)
    const releaseArgs = [...args.slice(0, 5), master, '--baseline', baseline,
      '--mode', 'release', '--release-base', 'rc3', '--release-target', 'rc4']
    const report = JSON.parse(renderUpstreamSync(releaseArgs, root))
    expect(report.B).toBe(baseline)
    expect(report.U).toBe(master)
    expect(report.upgradeScope).toMatchObject({ mode: 'release', status: 'scope-mismatch',
      baselineTreeMatches: true, targetTreeMatches: false, entryCountDifference: 1,
      releaseRange: { baseRef: 'rc3', targetRef: 'rc4', from: baseline, to: target, entryCount: 4 },
      commitRange: { from: baseline, to: master, entryCount: 5 } })
    expect(report.upgradeScope.releaseRange.shortstat).toContain('4 files changed')
    expect(git(upstream, 'rev-parse', 'HEAD')).toBe(master)
    expect(git(upstream, 'status', '--porcelain')).toBe('')
    const matching = JSON.parse(renderUpstreamSync([...args, '--release-base', 'rc3', '--release-target', 'rc4'], root))
    expect(matching.upgradeScope).toMatchObject({ mode: 'release', status: 'scope-match', baselineTreeMatches: true, targetTreeMatches: true })
  })

  it('keeps legacy explicit-commit reporting and validates explicit mode and release pairs', () => {
    expect(JSON.parse(renderUpstreamSync(args, root)).upgradeScope).toMatchObject({ mode: 'explicit-commit', status: 'release-not-checked' })
    expect(JSON.parse(renderUpstreamSync([...args, '--mode', 'master'], root)).upgradeScope.mode).toBe('master')
    for (const extra of [['--mode', 'release'], ['--mode', 'other'], ['--release-base', 'missing'],
      ['--release-base', 'missing', '--release-target', 'also-missing']]) {
      expect(() => renderUpstreamSync([...args, ...extra], root)).toThrow()
    }
  })

  it('runs the actual CLI with JSON stdout and a nonzero exit for bad input', () => {
    const script = fileURLToPath(new URL('./upstream-sync.ts', import.meta.url))
    const cwd = resolve(fileURLToPath(new URL('..', import.meta.url)))
    const run = (input: string[]) => spawnSync(process.execPath, ['--import', 'tsx/esm', script, ...input], { cwd, encoding: 'utf8' })
    const success = run(args)
    expect(success.status, success.stderr).toBe(0)
    expect(JSON.parse(success.stdout).U).toBe(target)
    const failure = run(['--target', 'HEAD'])
    expect(failure.status).toBe(1)
    expect(failure.stdout).toBe('')
    expect(failure.stderr).toContain('upstream-sync:')
    expect(run(['--help']).stdout).toContain('--initial')
    const remoteFailure = run(['--discover', join(root, 'missing-remote')])
    expect(remoteFailure.status).toBe(1)
    expect(remoteFailure.stdout).toBe('')
  })

  it('discovers a real local remote default HEAD without fetch or state writes', () => {
    const discovery = JSON.parse(renderUpstreamSync(['--discover', upstream], root))
    expect(discovery).toEqual({ status: 'discovered', commit: target, ref: 'refs/heads/main' })
    expect(git(upstream, 'status', '--porcelain')).toBe('')
  })
})

describe('Git response parsing', () => {
  it('keeps tabs and line breaks in paths and rejects truncated or escaping entries', () => {
    expect(parseDiff('A\0tab\tline\n.txt\0')).toEqual([{ status: 'A', path: 'tab\tline\n.txt' }])
    for (const output of ['A\0file', 'R100\0old\0', 'A\0../escape\0', 'oops\0file\0', 'A\0/absolute\0']) {
      expect(() => parseDiff(output)).toThrow()
    }
  })

  it('requires a successful, unambiguous symbolic HEAD advertisement', () => {
    const sha = '1'.repeat(40)
    const output = 'ref: refs/heads/main\tHEAD\n' + sha + '\tHEAD\n'
    expect(parseRemoteHead({ status: 0, stdout: output, stderr: '' })).toEqual({ commit: sha, ref: 'refs/heads/main' })
    for (const result of [
      { status: 128, stdout: output, stderr: 'network failed' },
      { status: null, stdout: output, stderr: '', error: new Error('spawn failed') },
      { status: 0, stdout: output, stderr: '', signal: 'SIGTERM' },
      { status: 0, stdout: '', stderr: '' },
      { status: 0, stdout: sha + '\tHEAD\n', stderr: '' },
      { status: 0, stdout: output + output, stderr: '' },
      { status: 0, stdout: output.replace(sha, '1234'), stderr: '' },
      { status: 0, stdout: 'unexpected output', stderr: '' },
    ]) expect(() => parseRemoteHead(result)).toThrow()
  })
})
