import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite-plus/pack'
import { expect, it } from 'vite-plus/test'
import { inheritPackDefaults, selectPackConfigs } from './pack-config.ts'
import type { UserConfig } from 'vite-plus/pack'

it.each([
  ['a package without Client configuration', [{}]],
  ['an explicitly disabled face', [{ entry: '' }]],
] satisfies Array<[string, UserConfig[]]>)('preserves Host output for %s while building an explicit Client entry', async (_label, disabled) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-pack-face-'))
  try {
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'pack-face-fixture', type: 'module' }))
    await mkdir(join(root, 'src'))
    await mkdir(join(root, 'lib'))
    const host = 'export const host = "preserved";\n'
    await writeFile(join(root, 'lib/index.js'), host)
    await writeFile(join(root, 'src/index.ts'), 'export const host = "overwritten-by-autodiscovery";\n')
    await writeFile(join(root, 'src/client.ts'), 'export const client = "explicit-client";\n')
    const defaults: UserConfig = {
      entry: '', outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
      fixedExtension: false, dts: false, clean: false,
    }
    const selected = selectPackConfigs(defaults, [...disabled, { entry: { client: 'src/client.ts' } }])
    for (const config of selected) {
      const { bundles } = await build({ ...config, cwd: root, config: false, tsconfig: false, exports: false, logLevel: 'silent' })
      for (const bundle of bundles) await bundle[Symbol.asyncDispose]()
    }
    expect(await readFile(join(root, 'lib/index.js'), 'utf8')).toBe(host)
    expect(await readFile(join(root, 'lib/client.js'), 'utf8')).toContain('explicit-client')
  } finally { await rm(root, { recursive: true, force: true }) }
})

it('keeps explicit output formats so each format builds once', () => {
  const defaults: UserConfig = { format: ['esm'] }
  expect(inheritPackDefaults(defaults, { format: ['esm'] }).format).toEqual(['esm'])
  expect(inheritPackDefaults(defaults, { format: ['cjs'] }).format).toEqual(['cjs'])
  expect(inheritPackDefaults(defaults, {}).format).toEqual(['esm'])
})

it('keeps package plugins before workspace plugins', () => {
  const workspacePlugin = { name: 'workspace' }
  const packagePlugin = { name: 'package' }
  const defaults: UserConfig = { plugins: [workspacePlugin] }
  const config: UserConfig = { plugins: [packagePlugin] }
  expect(inheritPackDefaults(defaults, config).plugins).toEqual([packagePlugin, workspacePlugin])
  expect(defaults.plugins).toEqual([workspacePlugin])
  expect(config.plugins).toEqual([packagePlugin])
})

it('retains an explicit single entry without introducing default inputs', () => {
  const defaults = { entry: ['lib/types/index.js'], clean: false, dts: false }
  const config = { entry: ['lib/types/worker.js'], outDir: 'lib' }
  expect(inheritPackDefaults(defaults, config)).toEqual({ entry: ['lib/types/worker.js'], outDir: 'lib', clean: false, dts: false })
  expect(defaults.entry).toEqual(['lib/types/index.js'])
  expect(config.entry).toEqual(['lib/types/worker.js'])
})

it('fills undefined scalar defaults while retaining explicit false and empty entries', () => {
  const defaults = { entry: ['lib/types/index.js'], clean: true, dts: true, outDir: 'lib' }
  expect(inheritPackDefaults(defaults, { entry: '', clean: false, dts: false })).toEqual({ entry: '', clean: false, dts: false, outDir: 'lib' })
})

it('preserves named entry maps and package scalar overrides', () => {
  const defaults = { entry: ['lib/types/index.js'], outDir: 'lib' }
  const config = { entry: { bin: 'lib/types/bin.js' }, outDir: 'dist' }
  expect(inheritPackDefaults(defaults, config)).toEqual(config)
})
