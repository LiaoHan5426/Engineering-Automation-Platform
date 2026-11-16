/** The published Host loader must retain lowered decorators before the Client pass. */
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { build } from 'tsdown'
import { transpileModule, ScriptTarget, ModuleKind } from 'typescript'
import { expect, it } from 'vitest'
import uploadBuild from '../tsdown.config.ts'

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
    await mkdir(join(root, 'src'), { recursive: true })
    await mkdir(join(root, 'lib/types'), { recursive: true })
    await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }))
    await writeFile(join(root, 'src/index.ts'), source)
    await writeFile(join(root, 'lib/types/index.js'), transpileModule(source, {
      compilerOptions: { target: ScriptTarget.ES2024, module: ModuleKind.ESNext },
    }).outputText)
    const host = uploadBuild({ env: { DSH_BUILD_FACE: 'host' } })
    for (const config of host) {
      const bundles = await build({ ...config, cwd: root, config: false, tsconfig: false, logLevel: 'silent' })
      for (const bundle of bundles) await bundle[Symbol.asyncDispose]()
    }
    const { stdout } = await execute(process.execPath, ['--input-type=module', '-e', `
      import { FileUploads } from './lib/index.js';
      const service = new FileUploads();
      console.log(service.endpoint, service.upload());
    `], { cwd: root })
    expect(stdout.trim()).toBe('upload ready')
    const client = uploadBuild({ env: { DSH_BUILD_FACE: 'client' } })
    expect(client.every(config => config.platform !== 'node')).toBe(true)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
