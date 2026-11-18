/** Real fixture text and shell-free CLI regressions for incremental platform review. */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { inspectPlatformSource, renderPlatformPreflight, runPlatformPreflight } from './upstream-platform-preflight.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'platform preflight '))
  roots.push(root)
  mkdirSync(join(root, 'tests'))
  writeFileSync(join(root, 'tests', 'bad.spec.ts'), 'const fixture = { command: "printf hello" };')
  writeFileSync(join(root, 'tests', 'good.spec.tsx'), 'const fixture = { command: "printf hello", shell: "bash" };')
  return root
}
const badPath = [
  'import { join as diskJoin } from "node:path";',
  'const disk = diskJoin(scaffold.workspaceCwd, "first.txt");',
  'expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(disk);',
  'expect(mention).toHaveValue(diskJoin(cwd, "note.txt"));',
  'expect("file://" + actual).toBe(diskJoin(cwd, "note.txt"));',
].join('\n')
const badSnapshot = [
  'const cwd = process.cwd();',
  'captureStableAria(page, "main", cwd, { replacements: [[cwd, "{{cwd}}"]] });',
  'JSON.stringify({ cwd }).replaceAll(cwd, "{{cwd}}");',
].join('\n')

describe('incremental platform evidence', () => {
  it('reports native path expectations with source lines and review reasons', () => {
    const findings = inspectPlatformSource('tests/context-menus.e2e.ts', badPath, 'win32')
    expect(findings.map(item => [item.code, item.line, item.classification])).toEqual([
      ['NATIVE_PATH_PROTOCOL_EXPECTATION', 3, 'review'],
      ['NATIVE_PATH_PROTOCOL_EXPECTATION', 4, 'review'],
      ['NATIVE_PATH_PROTOCOL_EXPECTATION', 5, 'review'],
    ])
    expect(findings.every(item => item.path === 'tests/context-menus.e2e.ts' && item.reason.includes('protocol'))).toBe(true)
    expect(inspectPlatformSource('tests/context-menus.e2e.ts', badPath, 'linux')).toEqual([])
  })
  it('accepts explicit protocol conversion, posix paths, and disk-only assertions', () => {
    const good = [
      'import path, { join } from "node:path";',
      'const disk = join(cwd, "a");',
      'expect(clipboard).toBe(toMentionPath(disk));',
      'expect(clipboard).toBe(pathToFileURL(disk).href);',
      'expect(mention).toBe(path.posix.join("/root", "a"));',
      'expect(readFileSync(disk)).toBe(join(cwd, "a"));',
      '// expect(clipboard).toBe(join(cwd, "a"));',
      'const docs = "expect(clipboard).toBe(join(cwd))";',
    ].join('\n')
    expect(inspectPlatformSource('tests/good.tsx', good, 'win32')).toEqual([])
    expect(inspectPlatformSource('tests/ns.ts', 'import * as disk from "path"; expect(clipboard).toBe(disk.resolve(cwd));', 'win32')).toHaveLength(1)
    expect(inspectPlatformSource('tests/unrelated.ts', 'function join() {} expect(clipboard).toBe(join());', 'win32')).toEqual([])
  })
  it('separates scenario helper review from direct JSON encoding mismatch', () => {
    expect(inspectPlatformSource('tests/snapshot.ts', badSnapshot, 'win32').map(item => [item.code, item.line, item.classification])).toEqual([
      ['RAW_CWD_JSON_REPLACEMENT', 2, 'review'],
      ['RAW_CWD_JSON_REPLACEMENT', 3, 'problem'],
    ])
    expect(inspectPlatformSource('tests/helper.ts', 'JSON.stringify(snapshot).replaceAll(scaffold.workspaceCwd, "{{cwd}}")', 'win32')[0]?.classification).toBe('review')
    const good = [
      'const cwd = process.cwd();',
      'const escapedCwd = JSON.stringify(cwd).slice(1, -1);',
      'captureStableAria(page, "main", cwd, { replacements: [[escapedCwd, "{{cwd}}"]] });',
      'JSON.stringify({ cwd }).replaceAll(JSON.stringify(cwd).slice(1, -1), "{{cwd}}");',
      'const replacements = [["fixed", "{{fixed}}"]];',
    ].join('\n')
    expect(inspectPlatformSource('tests/snapshot.ts', good, 'win32')).toEqual([])
    const windowsCwd = 'C:' + String.fromCharCode(92) + 'work'
    const serialized = JSON.stringify({ cwd: windowsCwd })
    expect(serialized.replaceAll(windowsCwd, '{{cwd}}')).not.toContain('{{cwd}}')
    expect(serialized.replaceAll(JSON.stringify(windowsCwd).slice(1, -1), '{{cwd}}')).toContain('{{cwd}}')
  })
  it.each(['printf hello', 'export FIXTURE=1', 'cat <<EOF\nfixture\nEOF'])(
    'reviews POSIX command %s only without an explicit Bash executor', command => {
      const literal = JSON.stringify(command)
      expect(inspectPlatformSource('tests/shell.ts', 'const fixture = { command: ' + literal + ' };', 'win32').map(item => item.code)).toEqual(['POSIX_FIXTURE_SHELL'])
      for (const shell of ['bash', '/bin/bash', 'C:/tools/bash.exe']) {
        expect(inspectPlatformSource('tests/shell.ts', 'const fixture = { command: ' + literal + ', shell: ' + JSON.stringify(shell) + ' };', 'win32')).toEqual([])
      }
      expect(inspectPlatformSource('tests/shell.ts', 'const fixture = { command: ' + literal + ', shell: "powershell.exe" };', 'win32')).toHaveLength(1)
    },
  )
  it('checks exec payload context but leaves argv-based Bash and Node alone', () => {
    expect(inspectPlatformSource('scripts/fixture.ts', 'execSync("printf hello")', 'win32')).toHaveLength(1)
    expect(inspectPlatformSource('scripts/fixture.ts', 'execSync("printf hello", { shell: "/bin/bash" })', 'win32')).toEqual([])
    expect(inspectPlatformSource('scripts/fixture.ts', 'spawnSync("bash", ["-c", "printf hello"], { shell: false }); spawnSync(process.execPath, ["-e", "process.stdout.write(1)"]);', 'win32')).toEqual([])
    expect(inspectPlatformSource('tests/docs.ts', 'const documentation = "printf hello"; // export X=1', 'win32')).toEqual([])
    expect(inspectPlatformSource('tests/bash.ts', 'tools.ops_bash({ command: "printf hello" }); bash({ command: "export X=1" }); const fixture = { tool: "bash", command: "printf hi" };', 'win32')).toEqual([])
  })
  it('deduplicates and normalizes disk input, skips deleted/non-fixture paths, reads no other files', () => {
    const root = fixture()
    writeFileSync(join(root, 'tests', 'unselected.ts'), 'throw new Error("must not execute")')
    const options = { root, platform: 'win32' as const, plan: { entries: [
      { status: 'M', path: 'tests\\bad.spec.ts' }, { status: 'M', path: './tests/bad.spec.ts' },
      { status: 'R100', path: 'tests/good.spec.tsx' }, { status: 'D', path: 'tests/deleted.ts' },
      { status: 'M', path: 'src/production.ts' }, { status: 'M', path: 'README.md' },
    ] } }
    const before = readFileSync(join(root, 'tests', 'bad.spec.ts'), 'utf8')
    const report = runPlatformPreflight(options)
    expect(report.checked).toEqual(['tests/bad.spec.ts', 'tests/good.spec.tsx'])
    expect(report.skipped).toHaveLength(3)
    expect(report.findings).toHaveLength(1)
    expect(runPlatformPreflight(options)).toEqual(report)
    expect(readFileSync(join(root, 'tests', 'bad.spec.ts'), 'utf8')).toBe(before)
    expect(readdirSync(root)).toEqual(['tests'])
    expect(runPlatformPreflight({ root, platform: 'linux', files: ['tests/bad.spec.ts'] }).findings).toEqual([])
  })
  it('marks empty selection explicitly and rejects escaping paths and URLs', () => {
    const root = fixture()
    expect(runPlatformPreflight({ root, platform: 'win32' })).toEqual({ platform: 'win32', scope: 'empty', checked: [], skipped: [], findings: [] })
    expect(runPlatformPreflight({ root, platform: 'win32', plan: { entries: [] } }).scope).toBe('empty')
    for (const path of ['../outside.spec.ts', 'file:///tests/a.spec.ts', 'https://example.test/a.ts']) {
      expect(() => runPlatformPreflight({ root, platform: 'win32', files: [path] })).toThrow('PREFLIGHT_PATH')
    }
    expect(() => runPlatformPreflight({ root, platform: 'win32', files: ['tests/missing.ts'] })).toThrow()
    expect(() => runPlatformPreflight({ root, platform: 'win32', files: [], plan: { entries: [] } })).toThrow('PREFLIGHT_INPUT')
  })
  it('rejects a selected symlink outside the incremental root', () => {
    const root = fixture()
    const outside = fixture()
    symlinkSync(join(outside, 'tests'), join(root, 'tests', 'linked'), 'junction')
    expect(() => runPlatformPreflight({ root, platform: 'win32', files: ['tests/linked/bad.spec.ts'] })).toThrow('PREFLIGHT_PATH: symlink escapes root')
  })
  it('parses existing plans and rejects malformed or ambiguous CLI input', () => {
    const root = fixture()
    writeFileSync(join(root, 'plan.json'), JSON.stringify({ entries: [{ status: 'M', path: 'tests/bad.spec.ts' }] }))
    const parsed: unknown = JSON.parse(renderPlatformPreflight(['--root', root, '--plan', 'plan.json', '--platform', 'win32']))
    expect(parsed).toMatchObject({ checked: ['tests/bad.spec.ts'], findings: [{ code: 'POSIX_FIXTURE_SHELL' }] })
    for (const args of [['--platform', 'darwin'], ['--file'], ['--payload', 'printf hi'], ['--plan', 'plan.json', '--file', 'tests/bad.spec.ts']]) {
      expect(() => renderPlatformPreflight(['--root', root, ...args])).toThrow('PREFLIGHT_INPUT')
    }
    for (const content of [{}, { entries: 'all' }, { entries: [{ path: 1, status: 'M' }] }]) {
      writeFileSync(join(root, 'invalid.json'), JSON.stringify(content))
      expect(() => renderPlatformPreflight(['--root', root, '--plan', 'invalid.json'])).toThrow('PREFLIGHT_INPUT')
    }
  })
  it('launches CLI via node argv with spaces and never executes fixture payload', () => {
    const root = fixture()
    const marker = join(root, 'executed.txt')
    writeFileSync(join(root, 'tests', 'bad.spec.ts'), 'import { writeFileSync } from "node:fs"; writeFileSync(' + JSON.stringify(marker) + ', "executed"); const fixture = { command: "printf hi" };')
    const result = spawnSync(process.execPath, ['--import', 'tsx/esm', resolve(import.meta.dirname, 'upstream-platform-preflight.ts'), '--root', root, '--file', 'tests/bad.spec.ts', '--platform', 'win32'], {
      cwd: resolve(import.meta.dirname, '..'), encoding: 'utf8', shell: false, timeout: 30_000,
    })
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toMatchObject({ checked: ['tests/bad.spec.ts'], findings: [{ code: 'POSIX_FIXTURE_SHELL' }] })
    expect(readdirSync(root)).toEqual(['tests'])
  })
})
