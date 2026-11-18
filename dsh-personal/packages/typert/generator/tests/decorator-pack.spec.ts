import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'vite-plus/pack'
import { expect, it } from 'vite-plus/test'
import { decoratorPlugin } from '../src/tsdown-plugin.ts'

it.each(['js', 'mjs', 'ts'])('runs decorated %s inputs under plain Node after packing', async extension => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-decorator-pack-'))
  try {
    await writeFile(join(root, `entry.${extension}`), `
function remote(value, context) {
  context.addInitializer(function () { this.registered = context.name })
  return function () { return value.call(this) + '-remote' }
}
class Service {
  @remote
  listProviders() { return 'providers' }
}
const service = new Service()
console.log(JSON.stringify([service.listProviders(), service.registered]))
`)
    const { bundles } = await build({
      cwd: root, config: false, tsconfig: false,
      entry: [`entry.${extension}`], outDir: 'output', format: ['esm'],
      platform: 'node', target: 'es2024', dts: false, exports: false,
      plugins: [decoratorPlugin()], logLevel: 'silent',
    })
    try {
      const chunk = bundles.flatMap(bundle => bundle.chunks).find(chunk => chunk.type === 'chunk')!
      const stdout = execFileSync(process.execPath, [join(root, 'output', chunk.fileName)], { encoding: 'utf8' })
      expect(JSON.parse(stdout.trim())).toEqual(['providers-remote', 'listProviders'])
    } finally {
      for (const bundle of bundles) await bundle[Symbol.asyncDispose]()
    }
  } finally { await rm(root, {recursive: true, force: true}) }
})
