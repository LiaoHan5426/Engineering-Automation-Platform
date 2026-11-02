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
