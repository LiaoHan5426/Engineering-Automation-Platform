import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const manifest = process.argv[2],
  output = dirname(manifest)
const host = JSON.parse(await readFile(manifest, 'utf8'))
const require = createRequire(resolve('package.json'))
const { createServer } = await import(
  pathToFileURL(resolve(dirname(require.resolve('vite-plus/package.json')), 'dist/index.js')).href
)
const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href)
const { default: tailwind } = await import(pathToFileURL(require.resolve('@tailwindcss/vite')).href)
const { chromium } = loadPlaywright()
const server = await createServer({
  configFile: false,
  root: resolve('apps/web'),
  cacheDir: resolve(output, 'vite-cache'),
  plugins: [vue(), tailwind()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
    'import.meta.env.VITE_API_SCOPE': JSON.stringify(host.backend + '/api'),
  },
  server: {
    host: '127.0.0.1',
    port: 5197,
    strictPort: true,
    proxy: { '/api': { target: host.backend, changeOrigin: true } },
  },
})
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(server.resolvedUrls.local[0] + '#knowledge')
  await page.getByRole('button').filter({ hasText: 'Browser update base' }).first().click()
  await page.getByRole('button').filter({ hasText: 'Browser source' }).first().click()
  await page.getByTestId('knowledge-edit-open').click()
  await page.getByTestId('knowledge-edit-content').fill('browsernewterm updated content')
  await page.getByTestId('knowledge-edit-title').fill('Browser saved title')
  const saved = page.waitForResponse(
    (response) => response.request().method() === 'PUT' && response.url().includes('/documents/'),
  )
  await page.getByTestId('knowledge-edit-save').click()
  assert.equal((await saved).status(), 200)
  await page.getByRole('heading', { name: 'Browser saved title', exact: true }).last().waitFor()
  await page.getByText('browsernewterm updated content', { exact: true }).waitFor()
  await page.screenshot({ path: resolve(output, 'document-updated-narrow.png') })
  const result = await (
    await page.request.get(host.backend + '/api/knowledge/' + host.baseId + '/documents')
  ).json()
  assert.equal(result.items[0].id, host.documentId)
  assert.equal(result.items[0].content, 'browsernewterm updated content')
  assert.deepEqual(errors, [])
  await writeFile(
    resolve(output, 'browser-validation.json'),
    JSON.stringify(
      { updated: true, sameDocument: true, pageErrors: errors, modelCalls: 0 },
      null,
      2,
    ),
  )
} finally {
  await browser?.close()
  await server.close()
}
