import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { createServer } from 'vite-plus'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const { values } = parseArgs({ options: { session: { type: 'string' } } })
const session = resolve(values.session)
const input = JSON.parse(await readFile(resolve(session, 'browser-input.json'), 'utf8'))
assert.equal(input.session, session)
assert.match(input.base, /^http:\/\/127\.0\.0\.1:\d+$/)
const { chromium } = createRequire(import.meta.url)(process.env.EAP_PLAYWRIGHT_MODULE)
const server = await createServer({
  configFile: false,
  root: resolve(input.frontend, 'apps/web'),
  plugins: [vue(), tailwindcss()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
    'import.meta.env.VITE_USE_MOCK': JSON.stringify('false'),
  },
  server: {
    host: '127.0.0.1',
    port: 5187,
    strictPort: true,
    proxy: { '/api': { target: input.base, changeOrigin: true } },
  },
})
let browser, page
const checks = [],
  errors = [],
  mutations = []
const wait = (ms) => new Promise((done) => setTimeout(done, ms))
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(15000)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.method() !== 'GET') mutations.push({ method: request.method(), url: request.url() })
  })
  const by = (id) => page.getByTestId(id)
  await page.goto('http://127.0.0.1:5187/__tests__/browser/fixtures/board-runtime/index.html')
  await by('board-contribution')
    .getByText('Core run survives board UI disable', { exact: true })
    .waitFor()
  assert.match(await by('plugin-runtime-board').innerText(), /未检查/)
  await by('plugin-check-project').fill('local-eap')
  await by('plugin-check-dependencies').click()
  await by('plugin-runtime-snapshot')
    .getByText('Run：在途 1 · 结果未知 0', { exact: true })
    .waitFor()
  await by('plugin-open-work').waitFor()
  checks.push(
    'real core RUNNING and one Task/Run are read from PostgreSQL without dispatching work',
  )
  await by('plugin-toggle-board').click()
  const dialog = page.getByRole('dialog', { name: '停用看板显示' })
  await dialog.waitFor()
  assert.match(await dialog.innerText(), /1 条在途/)
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  assert.equal(await by('board-contribution').count(), 1)
  checks.push('canceling disable confirmation keeps the actual board contribution and core work')
  await by('plugin-toggle-board').click()
  await dialog.getByRole('button', { name: '仅停用看板显示', exact: true }).click()
  await by('plugin-board-disabled-boundary').waitFor()
  assert.equal(await by('board-contribution').count(), 0)
  assert.equal(
    JSON.parse(await page.evaluate(() => localStorage.getItem('eap.plugin.installation'))).enabled
      .board,
    false,
  )
  await by('plugin-check-dependencies').click()
  await by('plugin-runtime-snapshot')
    .getByText('Run：在途 1 · 结果未知 0', { exact: true })
    .waitFor()
  checks.push(
    'confirmed disable releases board UI and persists preference while the real core run remains active',
  )
  for (const width of [1440, 900, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      true,
    )
    await page.screenshot({
      path: resolve(session, 'disabled-active-' + width + '.png'),
      fullPage: true,
    })
  }
  await writeFile(resolve(session, 'release-worker.request'), 'continue actual Git while disabled')
  let snapshot
  for (let i = 0; i < 200; i++) {
    const response = await page.request.get(input.base + '/api/board/runtime?projectId=local-eap')
    assert.equal(response.status(), 200)
    snapshot = await response.json()
    if (snapshot.activeRunCount === 0) break
    await wait(50)
  }
  assert.equal(snapshot.activeRunCount, 0)
  assert.equal(snapshot.runCount, 1)
  await by('plugin-check-dependencies').click()
  await by('plugin-no-open-work').waitFor()
  assert.equal(await by('board-contribution').count(), 0)
  checks.push(
    'the actual Git run completes through the original core service while its UI stays disabled',
  )
  await page.reload()
  await by('plugin-board-disabled-boundary').waitFor()
  assert.equal(await by('board-contribution').count(), 0)
  await by('plugin-check-project').fill('local-eap')
  await by('plugin-check-dependencies').click()
  await by('plugin-no-open-work').waitFor()
  await by('plugin-toggle-board').click()
  await by('board-contribution')
    .getByText('Core run survives board UI disable', { exact: true })
    .waitFor()
  const run = await page.request.get(
    input.base + '/api/board/tasks/' + input.taskId + '/runs?projectId=local-eap',
  )
  const runs = await run.json()
  assert.equal(runs.items.length, 1)
  assert.equal(runs.items[0].execution.id, input.executionId)
  assert.equal(runs.items[0].execution.status, 'SUCCEEDED')
  assert.equal(runs.items[0].execution.cancelRequested, false)
  assert.match(runs.items[0].execution.stdout, /file-0-/)
  checks.push(
    'reload preserves disabled preference; re-enabling reloads the original task and successful run without replay',
  )
  await by('plugin-check-project').fill('scope-matrix')
  await by('plugin-check-stale').waitFor()
  await by('plugin-check-dependencies').click()
  await by('plugin-runtime-snapshot')
    .getByText('Run：在途 1 · 结果未知 25', { exact: true })
    .waitFor()
  assert.match(await by('plugin-runtime-snapshot').innerText(), /独立验证：在途 1 · 结果未知 1/)
  assert.match(await by('plugin-runtime-snapshot').innerText(), /源码写入：在途 1 · 结果未知 1/)
  await by('plugin-open-items').locator('summary').click()
  assert.equal(await by('plugin-open-items').locator('li').count(), 20)
  assert.match(await by('plugin-open-items').innerText(), /保存状态 RUNNING/)
  checks.push(
    'persisted scope fixtures distinguish unknown from saved RUNNING, count all records and bound IDs to 20',
  )
  await page.screenshot({ path: resolve(session, 'unknown-scope.png'), fullPage: true })
  assert.deepEqual(mutations, [])
  assert.deepEqual(errors, [])
  await writeFile(
    resolve(session, 'browser-result.json'),
    JSON.stringify({ passed: checks.length, checks, errors, mutations }, null, 2),
  )
} catch (error) {
  if (page && !page.isClosed()) {
    await page.screenshot({ path: resolve(session, 'failure.png'), fullPage: true })
    await writeFile(resolve(session, 'failure.txt'), await page.locator('body').innerText())
  }
  throw error
} finally {
  await browser?.close()
  await server.close()
}
