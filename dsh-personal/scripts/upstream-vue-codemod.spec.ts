/** Tests the admitted selector repairs and the per-file original preservation protocol. */
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyVuePlan, planVueCodemod, runVueCodemod, sourceHash } from './upstream-vue-codemod.ts'

const hooks = ['useAccount', 'useConnectorAccounts']
const wrap = (render: string) =>   "import { defineComponent, computed, h } from 'vue'\nexport const View = defineComponent((props: Props) => {\n  " + render + "\n})\n"
const fixture = wrap('return () => { const account = props.useAccount(state => state).value; return h("div", account.status) }')
const directories: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
async function scratch(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), 'vue-codemod-'))
  directories.push(directory)
  return directory
}

describe('bounded Vue selector repairs', () => {
  it('moves render selector ownership to setup and leaves the Ref read in render', () => {
    const plan = planVueCodemod(fixture, hooks)
    expect(plan.findings).toEqual([expect.objectContaining({ category: 'supported', code: 'render-selector' })])
    expect(plan.output).toBe(wrap('const __vueSelector1 = props.useAccount(state => state)\n  return () => { const account = __vueSelector1.value; return h("div", account.status) }'))
    expect(planVueCodemod(plan.output, hooks).output).toBe(plan.output)
    expect(planVueCodemod(plan.output, hooks).findings).toEqual([])
  })
  it('repairs a computed getter while retaining live props inside the selector', () => {
    const source = wrap('const entry = computed(() => props.useConnectorAccounts(s => s.accounts.get(props.account)).value)\n  return () => h("span", entry.value)')
    const plan = planVueCodemod(source, hooks, 'C:\\work tree\\component.tsx')
    expect(plan.findings).toEqual([expect.objectContaining({ category: 'supported', code: 'computed-selector' })])
    expect(plan.output).toBe(wrap('const __vueSelector1 = props.useConnectorAccounts(s => s.accounts.get(props.account))\n  const entry = computed(() => __vueSelector1.value)\n  return () => h("span", entry.value)'))
    expect(plan.findings[0]?.code).toBe('computed-selector')
    expect(planVueCodemod(plan.output, hooks).output).toBe(plan.output)
  })
  it('keeps subject property reads inside the selector rather than freezing setup props', () => {
    const plan = planVueCodemod(wrap('return () => props.useConnectorAccounts(s => s.accounts.get(props.subject.packageName)).value'), hooks)
    expect(plan.output).toContain('const __vueSelector1 = props.useConnectorAccounts(s => s.accounts.get(props.subject.packageName))')
    expect(plan.output).toContain('return () => __vueSelector1.value')
  })
  it('repairs a selector before render branches, as in account notices', () => {
    const source = wrap('return () => { const notice = props.useConnectorAccounts(s => s.notice).value; if (notice === undefined) return null; return h("div", notice.text) }')
    const plan = planVueCodemod(source, hooks)
    expect(plan.findings[0]?.category).toBe('supported')
    expect(plan.output).toContain('const __vueSelector1 = props.useConnectorAccounts(s => s.notice)')
    expect(plan.output).toContain('const notice = __vueSelector1.value; if (notice === undefined)')
  })
  it('handles aliases, multiple selectors, collision avoidance and CRLF idempotently', () => {
    const source = fixture.replace('defineComponent,', 'defineComponent as component,').replace('= defineComponent(', '= component(')
      .replace('return () => {', 'const __vueSelector1 = 1; return () => {')
      .replace('return h("div", account.status)', 'return h("div", [account.status, props.useAccount(s => s.status).value])').replaceAll('\n', '\r\n')
    const plan = planVueCodemod(source, hooks)
    expect(plan.output).toContain('const __vueSelector2 = props.useAccount(state => state)\r\n')
    expect(plan.output).toContain('const __vueSelector3 = props.useAccount(s => s.status)\r\n')
    expect(plan.findings).toHaveLength(2)
    expect(planVueCodemod(plan.output, hooks).output).toBe(plan.output)
  })
  it.each([
    ['render local', 'return () => { const key = props.account; return props.useConnectorAccounts(s => s.accounts.get(key)).value }', 'selector-dependency'],
    ['block body', 'return () => props.useAccount(s => { return s.status }).value', 'selector-dependency'],
    ['effectful selector', 'return () => props.useAccount(s => s.update()).value', 'selector-dependency'],
    ['nested callback', 'return () => () => props.useAccount(s => s).value', 'unsupported-position'],
    ['conditional setup', 'if (props.visible) return () => props.useAccount(s => s).value', 'unsupported-position'],
    ['event callback', 'const click = () => props.useAccount(s => s); return () => h("div")', 'unsupported-position'],
    ['extra argument', 'return () => props.useAccount(s => s, true).value', 'unsupported-position'],
    ['optional hook', 'return () => props.useAccount?.(s => s).value', 'unsupported-position'],
    ['earlier return', 'return () => { if (props.hidden) return null; return props.useAccount(s => s).value }', 'conditional-selector'],
    ['async render', 'return async () => props.useAccount(s => s).value', 'conditional-selector'],
    ['conditional expression', 'return () => props.visible ? props.useAccount(s => s).value : null', 'conditional-selector'],
    ['shadowed receiver', 'return () => { const props = other; return props.useAccount(s => s).value }', 'shadowed-props'],
    ['shadowed selector props', 'return () => { const props = other; return original.useAccount(s => props.account).value }', 'unproven-owner'],
    ['selector default', 'return () => props.useAccount((s = other) => s).value', 'selector-dependency'],
  ])('classifies %s without changing the source', (_name, body, code) => {
    const source = wrap(body)
    const plan = planVueCodemod(source, hooks)
    expect(plan.output).toBe(source)
    expect(plan.findings).toContainEqual(expect.objectContaining({ category: 'manual-review', code }))
  })
  it('blocks an entire file when one selector needs review', () => {
    const source = fixture + wrap('return () => props.useAccount(s => other).value').replace('View', 'Other')
    const plan = planVueCodemod(source, hooks)
    expect(plan.output).toBe(source)
    expect(plan.findings.map(item => item.category)).toEqual(['supported', 'manual-review'])
  })
  it('does not confuse hook-valued computed reads, setup selectors, actions or Vue useId with selector creation', () => {
    const source = wrap('const selector = props.useAccount(s => s); const hook = computed(() => props.useAccount); return () => [selector.value, props.useApiKey(), useId()]')
    const plan = planVueCodemod(source, hooks)
    expect(plan.output).toBe(source)
    expect(plan.findings).toEqual([])
  })
  it('requires the Vue import and explicit member attestation', () => {
    expect(planVueCodemod(fixture, []).findings).toEqual([])
    const source = fixture.replace("from 'vue'", "from 'other'")
    expect(planVueCodemod(source, hooks).findings[0]?.code).toBe('unproven-owner')
  })
  it('reports React semantics and parse errors rather than guessing a rewrite', () => {
    const react = "import React from 'react'; export const View = () => <div/>"
    expect(planVueCodemod(react, hooks).findings[0]?.code).toBe('react-semantics')
    const broken = fixture + 'const = ;'
    expect(planVueCodemod(broken, hooks).output).toBe(broken)
    expect(planVueCodemod(broken, hooks).findings[0]?.code).toBe('parse-error')
  })
})

describe('reviewed per-file application', () => {
  it('defaults to dry-run, applies only the expected file, retains exact original and runs twice unchanged', async () => {
    const directory = await scratch()
    const target = path.join(directory, 'space in name.tsx')
    const status = path.join(directory, 'accepted.json')
    await writeFile(target, fixture)
    await writeFile(status, '{"accepted":false}')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await runVueCodemod(['--hook', 'useAccount', '--file', target])).toBe(0)
    expect(await readFile(target, 'utf8')).toBe(fixture)
    const report = JSON.parse(log.mock.calls[0]![0] as string) as { beforeHash: string; status: string }
    expect(report.status).toBe('planned')
    expect(await runVueCodemod(['--hook', 'useAccount', '--apply', '--file', target, '--expect', report.beforeHash])).toBe(0)
    const output = planVueCodemod(fixture, hooks).output
    expect(await readFile(target, 'utf8')).toBe(output)
    expect(await readFile(target + '.vue-codemod.' + report.beforeHash + '.bak', 'utf8')).toBe(fixture)
    expect(await runVueCodemod(['--hook', 'useAccount', '--apply', '--file', target, '--expect', sourceHash(output)])).toBe(0)
    expect(await readFile(status, 'utf8')).toBe('{"accepted":false}')
  })
  it('rejects stale hashes, changed content, tampered output and missing per-file expectations', async () => {
    const target = path.join(await scratch(), 'source.tsx')
    await writeFile(target, fixture)
    const plan = planVueCodemod(fixture, hooks)
    await expect(applyVuePlan(target, plan, '0'.repeat(64))).rejects.toThrow('hash-mismatch')
    await expect(applyVuePlan(target, { ...plan, output: 'tampered' }, plan.beforeHash)).rejects.toThrow('hash-mismatch')
    await expect(runVueCodemod(['--hook', 'useAccount', '--apply', '--file', target])).rejects.toThrow('--expect')
    await writeFile(target, fixture + '// concurrent edit\n')
    await expect(applyVuePlan(target, plan, plan.beforeHash)).rejects.toThrow('source-changed')
    expect(await readFile(target, 'utf8')).toContain('// concurrent edit')
  })
  it('preserves an existing backup and rejects unsupported or symbolic files', async () => {
    const directory = await scratch()
    const target = path.join(directory, 'source.tsx')
    await writeFile(target, fixture)
    const plan = planVueCodemod(fixture, hooks)
    const backup = target + '.vue-codemod.' + plan.beforeHash + '.bak'
    await writeFile(backup, 'existing original')
    await expect(applyVuePlan(target, plan, plan.beforeHash)).rejects.toThrow()
    expect(await readFile(target, 'utf8')).toBe(fixture)
    expect(await readFile(backup, 'utf8')).toBe('existing original')
    const manual = planVueCodemod(wrap('return () => props.useAccount(s => local).value'), hooks)
    await expect(applyVuePlan(target, manual, manual.beforeHash)).rejects.toThrow('manual-review')
    const link = path.join(directory, 'link.tsx')
    // Windows junctions need no developer-mode symlink privilege and still fail isFile().
    await symlink(directory, link, process.platform === 'win32' ? 'junction' : 'dir')
    await expect(applyVuePlan(link, plan, plan.beforeHash)).rejects.toThrow('not-regular-file')
  })
  it('returns manual-review exit status and leaves the file intact', async () => {
    const target = path.join(await scratch(), 'source.tsx')
    const source = wrap('return () => props.useAccount(s => local).value')
    await writeFile(target, source)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await runVueCodemod(['--hook', 'useAccount', '--apply', '--file', target, '--expect', sourceHash(source)])).toBe(2)
    expect(await readFile(target, 'utf8')).toBe(source)
  })
  it.each([{ args: [] }, { args: ['--file'] }, { args: ['--hook', 'bad.name'] }, { args: ['--other', 'x'] }])('rejects incomplete or unrecognized arguments $args', async ({ args }) => {
    await expect(runVueCodemod(args)).rejects.toThrow('arguments:')
  })
})
