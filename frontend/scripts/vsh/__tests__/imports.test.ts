import { expect, it } from 'vite-plus/test'
import { inspectImport, extractImports } from '../src/imports.ts'

const ui = {
  name: '@eap/ui',
  root: '/workspace/packages/ui',
  exports: { '.': './src/index.ts', './styles.css': './src/styles.css' },
  dependencies: {},
}
const app = {
  name: '@eap/web',
  root: '/workspace/apps/web',
  exports: {},
  dependencies: { '@eap/ui': 'workspace:*' },
}
const file = '/workspace/apps/web/src/main.ts'

it('allows declared public exports but rejects private deep imports and undeclared dependencies', () => {
  expect(inspectImport(app, file, '@eap/ui', [app, ui])).toEqual([])
  expect(inspectImport(app, file, '@eap/ui/styles.css', [app, ui])).toEqual([])
  expect(inspectImport(app, file, '@eap/ui/src/index', [app, ui])).not.toEqual([])
  expect(inspectImport(app, file, '@eap/ui/button/Button.vue', [app, ui])).not.toEqual([])
  expect(inspectImport({ ...app, dependencies: {} }, file, '@eap/ui', [app, ui])).not.toEqual([])
})
it('rejects cross-package relative, absolute, file URL and alias-resolved private files', () => {
  for (const target of [
    '../../../packages/ui/src/index.ts',
    '/workspace/packages/ui/src/index.ts',
    'file:///workspace/packages/ui/src/index.ts',
  ])
    expect(inspectImport(app, file, target, [app, ui])).not.toEqual([])
  expect(
    inspectImport(app, file, '@/ui', [app, ui], '/workspace/packages/ui/src/index.ts'),
  ).not.toEqual([])
  expect(inspectImport(app, file, './local.ts', [app, ui])).toEqual([])
  const root = { name: 'workspace', root: '/workspace', exports: {}, dependencies: {} }
  expect(inspectImport(app, file, './local.ts', [root, app, ui])).toEqual([])
  expect(
    inspectImport(
      { ...app, dependencies: { vue: '*' } },
      file,
      'vue',
      [root, app, ui],
      '/workspace/node_modules/vue/index.d.ts',
    ),
  ).toEqual([])
})
it('rejects production imports of test code and respects exact conditional exports', () => {
  expect(inspectImport(app, file, '../__tests__/fixture.ts', [app, ui])).not.toEqual([])
  const conditional = {
    ...ui,
    exports: { '.': { types: './src/index.ts', default: './src/index.ts' }, './internal': null },
  }
  expect(inspectImport(app, file, '@eap/ui', [app, conditional])).toEqual([])
  expect(inspectImport(app, file, '@eap/ui/internal', [app, conditional])).not.toEqual([])
})
it('does not let realpath symlinks or a public-name tsconfig alias expose private source', () => {
  expect(
    inspectImport(app, file, './linked.ts', [app, ui], '/workspace/packages/ui/src/private.ts'),
  ).not.toEqual([])
  expect(
    inspectImport(app, file, '@eap/ui', [app, ui], '/workspace/packages/ui/src/private.ts'),
  ).not.toEqual([])
  expect(
    inspectImport(app, file, '@eap/ui', [app, ui], '/workspace/packages/ui/src/index.ts'),
  ).toEqual([])
})
it('extracts multiline imports, exports, require and dynamic imports without comment false positives', () => {
  const source = `// import fake from 'not-a-dependency';
  const text="import fake from 'also-fake'";
  import { type A, b }\n from '@eap/ui'; export * from './local';
  const c = import('@eap/ui/private'); const d = require('node:fs');`
  expect(extractImports(source, 'file.ts')).toEqual([
    '@eap/ui',
    './local',
    '@eap/ui/private',
    'node:fs',
  ])
})
it('extracts Vue script, external script/style and CSS imports', () => {
  expect(
    extractImports(
      '<script setup>import { x } from "@eap/ui";</script><template><Button /></template><style>@import "@eap/style/index.css";</style>',
      'page.vue',
    ),
  ).toEqual(['@eap/ui', '@eap/style/index.css'])
  expect(
    extractImports('@import "@eap/style/index.css"; /* @import "fake"; */', 'page.css'),
  ).toEqual(['@eap/style/index.css'])
})
it.each([
  'type X = import("@eap/ui/src/private").X;',
  'import X = require("@eap/ui/src/private");',
  'const x = import(`@eap/ui/src/private`);',
  'const x = require(`@eap/ui/src/private`);',
  'const x = import.meta.glob(["@eap/ui/src/private"]);',
])('rejects a private path in every static import form: %s', (source) => {
  const imports = extractImports(source, 'file.ts')
  expect(imports).toEqual(['@eap/ui/src/private'])
  expect(inspectImport(app, file, imports[0]!, [app, ui])).not.toEqual([])
})
