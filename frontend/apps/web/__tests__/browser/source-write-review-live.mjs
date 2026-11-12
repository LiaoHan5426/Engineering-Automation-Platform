import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(resolve('package.json'))
const { createServer } = await import(
  pathToFileURL(resolve(dirname(require.resolve('vite-plus/package.json')), 'dist/index.js')).href
)
const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href)
const { default: tailwindcss } = await import(
  pathToFileURL(require.resolve('@tailwindcss/vite')).href
)
const { chromium } = loadPlaywright()
const manifest = process.argv[2]
const { port, id, workspace, project, title } = JSON.parse(await readFile(manifest, 'utf8'))
const output = dirname(manifest)
const backend = 'http://127.0.0.1:' + port
const route = '/api/board/source-write-reviews/' + id
const server = await createServer({
  configFile: false,
  root: resolve('apps/web'),
  cacheDir: resolve(output, 'vite-cache'),
  plugins: [vue(), tailwindcss()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
    'import.meta.env.VITE_API_SCOPE': JSON.stringify(backend + '/api'),
  },
  server: {
    host: '127.0.0.1',
    port: 5191,
    strictPort: true,
    proxy: { '/api': { target: backend, changeOrigin: true } },
  },
})

let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.setDefaultTimeout(15000)
  const pageErrors = []
  const failedRequests = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('response', (response) => {
    if (response.status() >= 500) failedRequests.push(new URL(response.url()).pathname)
  })
  await page.addInitScript((id) => {
    localStorage.setItem(
      'eap.local-projects.v1',
      JSON.stringify([{ id, label: 'Source review', intendedPath: '' }]),
    )
    localStorage.setItem('eap.selected-project.v1', id)
  }, project)
  const origin = server.resolvedUrls.local[0]
  const files = page.getByTestId('source-write-file')
  const audit = page.getByTestId('source-write-audit')
  const dialog = page.getByRole('dialog', { name: '源码写入核对', exact: true })
  const confirm = page.getByTestId('source-write-confirm')
  const openDirectory = async () => {
    await page.getByRole('tab', { name: '源码写入核对' }).click()
    await page.getByTestId('source-write-review-open').click()
  }
  const visible = async (locator, value) => {
    await locator.getByText(value, { exact: false }).waitFor()
  }
  const submit = async () => {
    await page.getByTestId('source-write-note').fill('逐项核对后保留当前文件，允许重新生成候选。')
    await page.getByTestId('source-write-checked').check()
    await confirm.click()
    await page.getByRole('button', { name: '保存核对决定', exact: true }).click()
  }

  await page.goto(origin + '#capabilities')
  await openDirectory()
  await visible(files.nth(0), '与候选一致')
  await visible(files.nth(1), '与写入前一致')
  assert.equal(await confirm.isDisabled(), true)
  await files.first().locator('summary').click()
  await visible(files.first(), '写入前摘要')
  assert.equal(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), true)
  await page.screenshot({ path: resolve(output, 'source-write-review-mobile.png') })

  await writeFile(
    resolve(workspace, 'frontend/Summary.vue'),
    '<template><span>External edit</span></template>\n',
  )
  const conflict = page.waitForResponse(
    (response) =>
      response.url().endsWith(route + '/close') && response.request().method() === 'POST',
  )
  await submit()
  const refused = await conflict
  assert.equal(refused.status(), 409)
  assert.equal((await refused.json()).code, 'CODE_REVIEW_CHANGED')
  await visible(files.nth(1), '与两者均不同')
  assert.equal(await confirm.isDisabled(), true)

  let closes = 0
  await page.route('**' + route + '/close', async (intercept) => {
    closes++
    const response = await intercept.fetch()
    assert.equal(response.status(), 200, await response.text())
    await intercept.abort('connectionreset')
  })
  await submit()
  await visible(audit, '原写入结果仍未知')
  assert.equal(closes, 1)
  assert.equal(await confirm.count(), 0)
  await page.reload()
  await openDirectory()
  await visible(audit, '逐项核对后保留当前文件')
  const saved = await page.request.get(new URL(route, origin).href)
  assert.equal(saved.status(), 200)
  const record = await saved.json()
  assert.equal(record.item.status, 'CLOSED_UNKNOWN')
  assert.equal(record.resolution.observation.files[1].match, 'DIFFERENT')
  assert.equal(closes, 1)

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto(origin + '#board')
  await dialog.waitFor({ state: 'hidden' })
  await page.getByTestId('preview-board').waitFor()
  await page.getByRole('button').filter({ hasText: title }).first().click()
  await page.getByTestId('board-tab-code').click()
  await page.getByTestId('board-code-refresh').click()
  await page.getByTestId('board-code-open').click()
  await visible(page.getByTestId('proposal-status'), '已核对关闭')
  assert.equal(await page.getByTestId('proposal-apply').count(), 0)
  await page.getByTestId('source-write-review-open').click()
  await visible(audit, '原写入结果仍未知')
  await page.screenshot({ path: resolve(output, 'source-write-audit-board.png') })
  assert.deepEqual(pageErrors, [])
  await writeFile(
    resolve(output, 'chromium-evidence.json'),
    JSON.stringify(
      {
        browser: await browser.version(),
        fixture:
          'full application, V35 durable claim → V36, partial filesystem effect seeded by test',
        checks: [
          'capability directory and authorized multi-file hash evidence at 390px',
          'changed file refuses the old digest, rechecks and requires fresh confirmation',
          'real close HTTP response lost after success; one POST and persisted audit read-back',
          'browser reload and independent Board candidate detail show the same audit; original apply unavailable',
        ],
        pageErrors,
        failedRequests,
      },
      null,
      2,
    ),
  )
} finally {
  try {
    await browser?.close()
  } finally {
    await server.close()
  }
}
