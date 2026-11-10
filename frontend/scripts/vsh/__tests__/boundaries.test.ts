import { afterEach, expect, it } from 'vite-plus/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkBoundaries } from '../src/boundaries.ts'

const cache = fileURLToPath(new URL('../node_modules/.cache/', import.meta.url))
const owned: string[] = []
afterEach(() => {
  for (const directory of owned.splice(0)) fs.rmSync(directory, { recursive: true, force: true })
})
function workspace(source: string) {
  fs.mkdirSync(cache, { recursive: true })
  const root = fs.mkdtempSync(path.join(cache, 'vsh-boundary-'))
  owned.push(root)
  const files: Record<string, string> = {
    'package.json': JSON.stringify({ name: 'fixture', devDependencies: {} }),
    'apps/web/package.json': JSON.stringify({
      name: '@fixture/web',
      dependencies: { '@fixture/ui': 'workspace:*' },
    }),
    'packages/ui/package.json': JSON.stringify({
      name: '@fixture/ui',
      exports: { '.': './src/index.ts' },
    }),
    'packages/ui/src/index.ts': 'export const value = 1',
    'apps/web/src/main.ts': source,
  }
  for (const [filename, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, filename)), { recursive: true })
    fs.writeFileSync(path.join(root, filename), content)
  }
  return root
}
it('checks actual workspace files while allowing only declared public entrypoints', () => {
  expect(checkBoundaries(workspace("import { value } from '@fixture/ui'; void value"))).toEqual([])
  expect(checkBoundaries(workspace("export * from '@fixture/ui/src/index.ts'"))).toEqual([
    expect.stringContaining('not publicly exported'),
  ])
})
it('does not lose multiline or dynamic private imports in the filesystem scan', () => {
  const issues = checkBoundaries(
    workspace(
      "import { value }\n from '../../../packages/ui/src/index.ts'; const lazy = import('@fixture/ui/src/index.ts');",
    ),
  )
  expect(issues).toHaveLength(2)
})
it('rejects generated JavaScript next to its TypeScript source', () => {
  const root = workspace('export const value = 1')
  fs.writeFileSync(path.join(root, 'apps/web/src/main.js'), 'export const value = 1')
  expect(checkBoundaries(root)).toEqual([expect.stringContaining('generated JavaScript')])
})

it('allows UI transport types while rejecting production mock imports and domain-dependent transports', () => {
  const root = workspace(
    "import type { UploadRequest } from '@eap/request'; export type Request = UploadRequest",
  )
  const put = (file: string, content: unknown) => {
    const target = path.join(root, file)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content))
  }
  put('packages/request/package.json', { name: '@eap/request', exports: { '.': './src/index.ts' } })
  put('packages/request/src/index.ts', 'export type UploadRequest = () => Promise<unknown>')
  put('packages/ui/package.json', {
    name: '@eap/ui',
    dependencies: { '@eap/request': 'workspace:*' },
    exports: { '.': './src/index.ts' },
  })
  put('packages/ui/src/index.ts', "export type { UploadRequest } from '@eap/request'")
  put('apps/web/package.json', {
    name: '@eap/web',
    dependencies: { '@eap/request': 'workspace:*' },
    devDependencies: { '@eap/backend-mock': 'workspace:*' },
  })
  expect(checkBoundaries(root)).toEqual([])
  put('apps/backend-mock/package.json', {
    name: '@eap/backend-mock',
    exports: { '.': './src/index.ts' },
  })
  put('apps/backend-mock/src/index.ts', 'export const fixture = {}')
  put('apps/web/src/main.ts', "import { fixture } from '@eap/backend-mock'; void fixture")
  expect(checkBoundaries(root)).toContainEqual(
    expect.stringContaining('production source must not import'),
  )
  put('packages/domain/package.json', {
    name: '@eap/runtime-client',
    exports: { '.': './src/index.ts' },
  })
  put('packages/domain/src/index.ts', 'export const api = {}')
  put('packages/request/package.json', {
    name: '@eap/request',
    dependencies: { '@eap/runtime-client': 'workspace:*' },
    exports: { '.': './src/index.ts' },
  })
  put('packages/request/src/index.ts', "export * from '@eap/runtime-client'")
  expect(checkBoundaries(root)).toContainEqual(
    expect.stringContaining('@eap/request must remain independent'),
  )
})
