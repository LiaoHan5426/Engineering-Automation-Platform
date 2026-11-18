import { existsSync, globSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite-plus'
import type { UserConfig } from 'vite-plus/pack'
import { decoratorPlugin } from './packages/typert/generator/lib/types/tsdown-plugin.js'
import { workspacePackageGlobs } from './scripts/workspace-package-globs.ts'
import { selectPackConfigs, loadPackConfig } from './scripts/pack-config.ts'

/** Expand package-owned pack configs before packing; Host and Client run in separate processes. */
export default defineConfig(async () => {
  const face = process.env.DSH_BUILD_FACE
  if (face !== undefined && face !== 'host' && face !== 'client') {
    throw new Error('pack: DSH_BUILD_FACE must be host or client')
  }
  const client = face === 'client'
  const packages = workspacePackageGlobs(globSync(['vendor/*/package.json', 'packages/*/*/package.json'], { cwd: import.meta.dirname }))
  const defaults: UserConfig = {
    entry: client ? '' : ['lib/types/{index,startup}.js'],
    outDir: 'lib', format: ['esm'], platform: 'node', target: 'es2024',
    fixedExtension: false, dts: false, clean: false,
    plugins: client ? [] : [decoratorPlugin()],
  }
  const pack: UserConfig[] = []
  // Desktop inlines workspace output and runs only after this concurrent pass.
  for (const directory of [...packages, 'apps/cli', ...client ? [] : ['apps/desktop-host']]) {
    const cwd = resolve(import.meta.dirname, directory)
    const configFile = resolve(cwd, 'vite.config.ts')
    const configs = existsSync(configFile) ? await loadPackConfig(configFile) : [{}]
    const selected = selectPackConfigs(defaults, configs)
    pack.push(...selected.map(config => ({ ...config, cwd, config: false as const, workspace: false as const })))
  }
  return { pack }
})
