import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite-plus'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const base = 'http://127.0.0.1:8080'
const output = resolve('apps/web/__tests__/browser/artifacts/full-current-contract')
await mkdir(output, { recursive: true })
const { chromium } = loadPlaywright()
const server = await createServer({
  configFile: false,
  root: resolve('apps/web'),
  plugins: [vue(), tailwindcss()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: base, changeOrigin: true } },
  },
})
const errors = [],
  mutations = [],
  external = [],
  checks = []
let browser
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(20000)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('dialog', (dialog) => dialog.accept())
  page.on('request', (request) => {
    if (/^https?:/.test(request.url()) && new URL(request.url()).hostname !== '127.0.0.1')
      external.push(new URL(request.url()).origin)
    if (request.url().includes('/api/') && !['GET', 'HEAD'].includes(request.method()))
      mutations.push({ method: request.method(), path: new URL(request.url()).pathname })
  })
  await page.route('**/*', (route) =>
    /^https?:/.test(route.request().url()) &&
    new URL(route.request().url()).hostname !== '127.0.0.1'
      ? route.abort()
      : route.continue(),
  )
  const api = async (method, path, data) => {
    const response = await page.request.fetch(base + path, { method, data })
    assert(response.ok(), `${method} ${path} ${response.status()} ${await response.text()}`)
    return response.json()
  }
  const before = await api('GET', '/api/prototype-versions?sourceRef=builder-alpha')
  await page.goto('http://127.0.0.1:5173/#builder-alpha')
  await page.getByTestId('builder-alpha').waitFor()
  await page.waitForFunction(() =>
    document.querySelector('[data-testid=grapes-status]')?.textContent.includes('已挂载'),
  )
  assert.equal(await page.getByTestId('builder-tab-legacy').count(), 0)
  await page.getByRole('tab', { name: '页面设置', exact: true }).click()
  const existing = before.items.find((item) => item.title.startsWith('Full application V30 '))
  const title = existing?.title ?? 'Full application V30 ' + Date.now()
  let version = existing
  if (!version) {
    await page.getByTestId('grapes-title').fill(title)
    await page.getByTestId('grapes-add-button').click()
    const published = page.waitForResponse(
      (response) =>
        response.url().includes('/api/prototype-versions') &&
        response.request().method() === 'POST',
    )
    await page.getByTestId('grapes-publish').click()
    const response = await published
    assert.equal(response.status(), 200)
    version = await response.json()
  } else {
    await page.getByTestId('builder-alpha').getByTestId('builder-tab-versions').click()
    await page
      .getByTestId('builder-alpha')
      .locator('[data-testid=prototype-version] li')
      .filter({ hasText: title })
      .getByTestId('open-version')
      .click()
  }
  await writeFile(
    resolve(output, 'publication.json'),
    JSON.stringify({ id: version.id, title, contentHash: version.contentHash }),
  )
  assert.equal(version.title, title)
  assert.equal('buttonPresses' in version, false)
  assert.equal('interaction' in version, false)
  await page.getByTestId('version-preview').waitFor()
  await page
    .locator('[data-testid=version-preview] [data-testid=semantic-preview] button')
    .first()
    .click()
  assert.equal(await page.locator('[data-testid=version-preview] output').first().innerText(), '1')
  assert.deepEqual(await api('GET', '/api/prototype-versions/' + version.id), version)
  const after = await api('GET', '/api/prototype-versions?sourceRef=builder-alpha')
  assert.equal(after.items.length, before.items.length + (existing ? 0 : 1))
  checks.push(
    'production App -> real GrapesJS -> full-application HTTP -> application PostgreSQL publication/readback -> interactive semantic preview',
  )
  await page.getByTestId('builder-tab-design').click()
  await page.getByRole('tab', { name: '页面设置', exact: true }).click()
  const draft = title + ' unpublished'
  await page.getByTestId('grapes-title').fill(draft)
  await page.getByTestId('grapes-add-text').click()
  await page.evaluate(() => {
    location.hash = 'plugins'
  })
  await page.getByTestId('plugin-toggle-builder').click()
  await page
    .getByRole('dialog', { name: '停用设计器' })
    .getByRole('button', { name: '保存恢复草稿并停用', exact: true })
    .click()
  assert.equal(await page.getByTestId('grapes-scaffold').count(), 0)
  await page.reload()
  assert.equal(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem('eap.plugin.installation')).enabled.builder,
    ),
    false,
  )
  await page.getByTestId('plugin-toggle-builder').click()
  await page.evaluate(() => {
    location.hash = 'builder-alpha'
  })
  await page.waitForFunction(() =>
    document.querySelector('[data-testid=grapes-status]')?.textContent.includes('已挂载'),
  )
  await page.getByRole('tab', { name: '页面设置', exact: true }).click()
  assert.equal(await page.getByTestId('grapes-title').inputValue(), draft)
  assert.deepEqual(await api('GET', '/api/prototype-versions/' + version.id), version)
  checks.push(
    'production PluginCenter disable/reload/re-enable restores unpublished draft and leaves the persisted published version unchanged',
  )
  await page.screenshot({ path: resolve(output, 'designer-restored.png'), fullPage: true })
  await page.evaluate(() => {
    location.hash = 'scenes'
  })
  const detail = page.locator('[data-testid=scene-open-detail][data-scene-id=prototype-to-code]')
  if (await detail.count()) await detail.click()
  await page.getByTestId('composition-check').click()
  await page
    .getByTestId('scenario-composition')
    .getByText('原型版本目录可读取', { exact: true })
    .waitFor()
  checks.push(
    'production scenario composition observes the real version service and published resource',
  )
  assert.equal(
    (
      await page.request.post(base + '/api/runtime/trusted-tools/git-status/invoke', { data: {} })
    ).status(),
    404,
  )
  for (const operation of ['git-status', 'git-diff']) {
    const route = '/api/cli-programs/git/operations/' + operation + '/executions'
    const request = { requestId: crypto.randomUUID() }
    const row = await api('POST', route, request)
    assert.equal((await api('POST', route, request)).id, row.id)
    let latest = row
    for (let i = 0; i < 200 && !['SUCCEEDED', 'FAILED', 'UNKNOWN'].includes(latest.status); i++) {
      await new Promise((done) => setTimeout(done, 50))
      latest = await api('GET', route + '/' + row.id)
    }
    assert.equal(latest.status, 'SUCCEEDED', JSON.stringify(latest))
    assert.equal(latest.exitCode, 0)
  }
  checks.push(
    'full-application durable status/diff execute real repository Git with stable request identities; old invoke route is absent',
  )
  const expert = await api('POST', '/api/experts/sql-expert/execute', {
    sql: 'select 1',
    question: 'V30 deterministic full application verification',
    enhanceWithModel: false,
  })
  assert.deepEqual(expert.behavior, { id: 'sql-analysis', version: 1 })
  checks.push(
    'shipped explicit SQL expert executes through the real product service and persists its behavior version without requesting model enhancement',
  )
  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  await writeFile(
    resolve(output, 'result.json'),
    JSON.stringify(
      {
        host: 'production executable full-application jar',
        schema: 31,
        checks,
        errors,
        externalRequests: external,
        browserMutations: mutations,
        version: { id: version.id, title, contentHash: version.contentHash },
        expertTaskId: expert.id,
        existingVersionsPreserved: true,
        formalHostLeftRunning: true,
      },
      null,
      2,
    ),
  )
  process.stdout.write(
    JSON.stringify({
      passed: checks.length,
      versionId: version.id,
      expertTaskId: expert.id,
      pageErrors: errors.length,
    }),
  )
} catch (error) {
  await writeFile(
    resolve(output, 'failure.json'),
    JSON.stringify({ message: error.message, checks, errors, external, mutations }, null, 2),
  )
  throw error
} finally {
  await browser?.close()
  await server.close()
}
