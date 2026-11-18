/** The published Host loader must retain lowered decorators before the Client pass. */
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { build } from 'vite-plus/pack'
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript'
import { expect, it } from 'vite-plus/test'
import { loadPackConfig } from '../../../../scripts/pack-config.ts'

const execute = promisify(execFile)

it('publishes the decorated Node service during the Host pass and preserves it during the Client pass', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-upload-build-'))
  try {
    const source = `
      function remote(_method: Function, context: ClassMethodDecoratorContext) {
        context.addInitializer(function () { Object.defineProperty(this, 'endpoint', { value: 'upload' }) })
      }
      export class FileUploads {
        @remote
        upload() { return 'ready' }
      }
    `
    await mkdir(join(root, 'src/client'), { recursive: true })
    await writeFile(join(root, 'src/client/index.ts'), 'export const browserFace = true\n')
    await mkdir(join(root, 'lib/types'), { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }))
    await writeFile(join(root, 'src/index.ts'), source)
    await writeFile(join(root, 'lib/types/index.js'), transpileModule(source, {
      compilerOptions: { target: ScriptTarget.ES2024, module: ModuleKind.ESNext },
    }).outputText)
    for (const face of ['host', 'client']) {
      const previousFace = process.env.DSH_BUILD_FACE
      process.env.DSH_BUILD_FACE = face
      let configs
      try {
        configs = await loadPackConfig(join(import.meta.dirname, '../vite.config.ts'))
      } finally {
        if (previousFace === undefined) delete process.env.DSH_BUILD_FACE
        else process.env.DSH_BUILD_FACE = previousFace
      }
      for (const config of configs) {
        const { bundles } = await build({ ...config, cwd: root, config: false, tsconfig: false, logLevel: 'silent' })
        for (const bundle of bundles) await bundle[Symbol.asyncDispose]()
      }
      const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', `
        import { FileUploads } from './lib/index.js';
        const service = new FileUploads();
        console.log(service.endpoint, service.upload());
      `], { cwd: root })
      expect(stdout.trim()).toBe('upload ready')
    }
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
