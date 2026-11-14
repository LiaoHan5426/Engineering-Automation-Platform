import { build } from 'esbuild'
import { existsSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = fileURLToPath(new URL('.', import.meta.url))
const source = (p) => resolve(root, 'upstream/packages/client', p)
const primitives =
  ['Menu', 'Toast', 'Button', 'Tooltip']
    .map((n) => `export { ${n} } from ${JSON.stringify(source(`ui-primitives/src/${n}.tsx`))}`)
    .join('\n') +
  `\nexport { MENU_TRANSITION_MS } from ${JSON.stringify(source('ui-primitives/src/MenuSurface.tsx'))}\nexport { modalSelector } from ${JSON.stringify(source('ui-primitives/src/useModalLayer.ts'))}\nexport { observeComposition } from ${JSON.stringify(source('ui-primitives/src/keyboard-composition.ts'))}\nexport { IconChevronDownOutlineRegular, IconEllipsisOutlineRegular } from ${JSON.stringify(source('ui-primitives/src/icons/index.tsx'))}`
await build({
  stdin: {
    contents: `export * as contextMenu from ${JSON.stringify(source('ui-context-menu/src/client/index.ts'))};\nexport { createClientModuleSystem } from ${JSON.stringify(source('modules/src/client/index.ts'))};\nexport { LocaleRuntime } from ${JSON.stringify(source('locale/src/client/index.ts'))};\nexport { default as ShortcutsService } from ${JSON.stringify(source('shortcuts/src/client/index.ts'))};`,
    resolveDir: root,
    loader: 'ts',
  },
  outfile: resolve(root, 'generated/original.js'),
  bundle: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  external: [
    'react',
    'react-dom',
    'react-dom/client',
    'react/jsx-runtime',
    '@deepseek-ai/cordis',
    '@deepseek-ai/schemastery',
    'clsx',
  ],
  alias: {
    '@deepseek-ai/dsh-client-store': source('store/src/index.ts.snapshot'),
    '@deepseek-ai/dsh-util-crypto': resolve(
      root,
      'upstream/packages/util/crypto/src/index.ts.snapshot',
    ),
    '@deepseek-ai/dsh-util-values': resolve(
      root,
      'upstream/packages/util/values/src/index.ts.snapshot',
    ),
  },
  plugins: [
    {
      name: 'immutable-snapshots',
      setup(b) {
        b.onResolve({ filter: /^(\.|\/)/ }, (args) => {
          const path = resolve(args.resolveDir, args.path)
          if (existsSync(path + '.snapshot')) return { path: path + '.snapshot' }
        })
        b.onLoad({ filter: /\.snapshot$/ }, (args) => {
          const path = args.path.slice(0, -9)
          const relative = path.slice(resolve(root, 'upstream').length + 1)
          const content = readFileSync(args.path)
          const accepted = JSON.parse(readFileSync(resolve(root, 'baseline/accepted.json'), 'utf8'))
          if (createHash('sha256').update(content).digest('hex') !== accepted.sources[relative])
            throw new Error('DSH_SOURCE_DIGEST_MISMATCH:' + relative)
          return {
            contents: content.toString(),
            loader: path.endsWith('.tsx') ? 'tsx' : path.endsWith('.css') ? 'local-css' : 'ts',
            resolveDir: resolve(path, '..'),
          }
        })
      },
    },
    {
      name: 'reviewed-primitives',
      setup(b) {
        b.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({
          path: 'primitives',
          namespace: 'reviewed',
        }))
        b.onLoad({ filter: /.*/, namespace: 'reviewed' }, () => ({
          contents: primitives,
          loader: 'ts',
          resolveDir: root,
        }))
      },
    },
  ],
  metafile: true,
}).then(async (result) => {
  const { writeFile } = await import('node:fs/promises')
  await writeFile(
    resolve(root, 'generated/inputs.json'),
    JSON.stringify(Object.keys(result.metafile.inputs).sort(), null, 2) + '\n',
  )
})
