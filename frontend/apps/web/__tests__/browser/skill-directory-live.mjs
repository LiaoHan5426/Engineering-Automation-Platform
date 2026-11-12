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
    port: 5198,
    strictPort: true,
    proxy: { '/api': { target: host.backend, changeOrigin: true } },
  },
})
let browser, page
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('eap.locale', 'zh-CN'))
  await page.goto(server.resolvedUrls.local[0] + '#skills')
  await page.getByTestId('skill-import').click()
  await page.getByTestId('skill-raw').fill('Retain this draft until the directory is accepted')
  let writes = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/skills') writes++
  })
  await page
    .getByTestId('skill-directory')
    .locator('input[type=file]')
    .setInputFiles(host.invalidDirectory)
  await page.getByRole('dialog').getByText('目录必须含根 SKILL.md', { exact: false }).waitFor()
  assert.equal(
    await page.getByTestId('skill-raw').inputValue(),
    'Retain this draft until the directory is accepted',
  )
  assert.equal(writes, 0)
  await page
    .getByTestId('skill-directory')
    .locator('input[type=file]')
    .setInputFiles(host.directory)
  await page.getByText('references/checks.md', { exact: true }).waitFor()
  assert.match(await page.getByTestId('skill-raw').inputValue(), /name: directory-review/)
  assert.equal(await page.getByTestId('skill-source').inputValue(), 'local-directory:review-guide')
  assert.equal(await page.getByTestId('skill-save').isDisabled(), true)
  assert.equal(writes, 0)
  await page.getByTestId('skill-preview').click()
  await page.getByTestId('skill-preview-result').waitFor()
  assert.equal(await page.getByTestId('skill-save').isDisabled(), true)
  assert.equal(
    await page.getByRole('dialog').evaluate((node) => node.scrollWidth <= node.clientWidth + 1),
    true,
    'directory preview must fit the narrow dialog',
  )
  await page.screenshot({ path: resolve(output, 'directory-preview-narrow.png') })
  await page.getByTestId('skill-confirm').check()
  await page.getByTestId('skill-save').click()
  const firstButton = page.getByTestId('skill-activate-directory-review-1.0.0')
  await firstButton.filter({ hasText: '启用' }).waitFor()
  await firstButton.click()
  await firstButton.filter({ hasText: '停用' }).waitFor()
  await page.getByTestId('skill-detail-directory-review-1.0.0').click()
  await page
    .getByTestId('skill-detail-result')
    .getByText('references/checks.md', { exact: true })
    .waitFor()
  await page.getByRole('dialog').locator('[data-eap-dialog-close]').click()

  // New immutable version from the retained directory draft, saved disabled.
  await page.getByTestId('skill-import').click()
  await page.getByTestId('skill-version').fill('1.1.0')
  await page.getByTestId('skill-preview').click()
  await page.getByTestId('skill-preview-result').waitFor()
  await page.getByTestId('skill-confirm').check()
  await page.getByTestId('skill-save').click()
  await page
    .getByTestId('skill-activate-directory-review-1.1.0')
    .filter({ hasText: '启用' })
    .waitFor()
  await page.getByTestId('skill-activate-directory-review-1.0.0').click()
  await page
    .getByTestId('skill-activate-directory-review-1.0.0')
    .filter({ hasText: '启用' })
    .waitFor()
  await page.reload()
  await page
    .getByTestId('skill-activate-directory-review-1.0.0')
    .filter({ hasText: '启用' })
    .waitFor()
  await page.getByTestId('skill-activate-directory-review-1.0.0').click()
  await page
    .getByTestId('skill-activate-directory-review-1.0.0')
    .filter({ hasText: '停用' })
    .waitFor()
  await page.reload()
  await page
    .getByTestId('skill-activate-directory-review-1.0.0')
    .filter({ hasText: '停用' })
    .waitFor()
  assert.equal(writes, 2)
  assert.deepEqual(errors, [])
  await page.screenshot({ path: resolve(output, 'directory-versions-narrow.png') })
  await writeFile(
    resolve(output, 'browser-validation.json'),
    JSON.stringify(
      {
        browser: browser.version(),
        directorySelected: true,
        invalidDirectoryPreservesDraft: true,
        nestedPathsPreserved: true,
        explicitPreviewAndTrust: true,
        saves: writes,
        immutableVersions: 2,
        activationReloaded: true,
        pageErrors: errors,
      },
      null,
      2,
    ),
  )
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true })
    await writeFile(resolve(output, 'failure.txt'), await page.locator('body').innerText())
  }
  throw error
} finally {
  await browser?.close()
  await server.close()
}
