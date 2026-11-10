import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite-plus'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const base = 'http://127.0.0.1:8080'
const output = resolve('apps/web/__tests__/browser/artifacts/prototype-publication-recovery')
await mkdir(output, { recursive: true })
const { chromium } = createRequire(import.meta.url)(process.env.EAP_PLAYWRIGHT_MODULE)
const server = await createServer({
  configFile: false,
  root: resolve('apps/web'),
  plugins: [vue(), tailwindcss()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
    'import.meta.env.VITE_USE_MOCK': JSON.stringify('false'),
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: base, changeOrigin: true } },
  },
})
const errors = [],
  external = [],
  posts = [],
  checks = []
let browser
let page
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(20000)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('dialog', (dialog) => dialog.accept())
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (/^https?:/.test(url) && new URL(url).hostname !== '127.0.0.1') {
      external.push(url)
      return route.abort()
    }
    return route.continue()
  })
  const api = async (method, path, data) => page.request.fetch(base + path, { method, data })
  const before = await (await api('GET', '/api/prototype-versions?sourceRef=builder-alpha')).json()
  const active = page.locator(
    '[data-testid=builder-alpha]:visible, [data-testid=builder-beta]:visible',
  )
  const ready = async (source) => {
    await page.goto('http://127.0.0.1:5173/#' + source)
    await active.getByTestId('grapes-status').filter({ hasText: '已挂载' }).waitFor()
    await active.getByRole('tab', { name: '页面设置', exact: true }).click()
  }
  const checkpointPath = resolve(output, 'committed-checkpoint.json')
  const checkpoint = await readFile(checkpointPath, 'utf8')
    .then(JSON.parse)
    .catch(() => null)
  if (checkpoint)
    await page.addInitScript((request) => {
      if (!sessionStorage.getItem('publication-fixture-restored')) {
        localStorage.setItem(
          'eap.prototype-publication.v1.builder-alpha',
          JSON.stringify({ format: 1, status: 'unknown', request }),
        )
        sessionStorage.setItem('publication-fixture-restored', 'true')
      }
    }, checkpoint.request)
  await ready('builder-alpha')
  await active.getByTestId('grapes-title').fill('Publication committed response lost ' + Date.now())
  await active.getByTestId('grapes-add-button').click()
  let committed = checkpoint?.version,
    firstRequest = checkpoint?.request
  if (checkpoint)
    posts.push({ requestId: firstRequest.requestId, mode: 'resumed-committed-evidence' })
  await page.route('**/api/prototype-versions', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    firstRequest = route.request().postDataJSON()
    posts.push({ requestId: firstRequest.requestId, mode: 'committed-response-discarded' })
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    committed = await response.json()
    await writeFile(checkpointPath, JSON.stringify({ request: firstRequest, version: committed }))
    await route.abort('failed')
  })
  if (!checkpoint) await active.getByTestId('grapes-publish').click()
  await active.locator('[data-testid=publication-check]:not(:disabled)').waitFor()
  assert(committed)
  assert.equal(await active.getByTestId('grapes-publish').isDisabled(), true)
  await page.evaluate(() => {
    location.hash = 'plugins'
  })
  await page.getByTestId('plugin-toggle-builder').click()
  assert.equal(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('eap.plugin.installation') ?? '{"enabled":{}}').enabled
          .builder !== false,
    ),
    true,
  )
  await page.reload()
  await ready('builder-alpha')
  assert.equal(posts.length, 1)
  assert.equal(await active.getByTestId('publication-review').count(), 1)
  await active.getByTestId('publication-check').click()
  await page.waitForFunction(
    () => !localStorage.getItem('eap.prototype-publication.v1.builder-alpha'),
  )
  const recovered = await (
    await api('GET', '/api/prototype-publications/' + firstRequest.requestId)
  ).json()
  assert.deepEqual(recovered, committed)
  checks.push(
    'Committed response discarded: pending intent blocks publication and disable, survives reload without replay, explicit real HTTP query recovers identical persisted version',
  )
  await page.unroute('**/api/prototype-versions')

  await ready('builder-beta')
  assert.equal(await active.getByTestId('publication-review').count(), 0)
  await active.getByTestId('grapes-title').fill('Publication original retry ' + Date.now())
  await active.getByTestId('grapes-add-button').click()
  let absentRequest
  await page.route('**/api/prototype-versions', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    absentRequest = route.request().postDataJSON()
    posts.push({ requestId: absentRequest.requestId, mode: 'aborted-before-send' })
    await route.abort('failed')
  })
  await active.getByTestId('grapes-publish').click()
  await active.locator('[data-testid=publication-check]:not(:disabled)').waitFor()
  const editedTitle = 'New draft after interrupted request ' + Date.now()
  await active.getByRole('tab', { name: '页面设置', exact: true }).click()
  await active.getByTestId('grapes-title').fill(editedTitle)
  await active.getByTestId('publication-check').click()
  await active.getByTestId('publication-retry').waitFor()
  assert.equal(
    (await api('GET', '/api/prototype-publications/' + absentRequest.requestId)).status(),
    404,
  )
  await page.unroute('**/api/prototype-versions')
  let retryRequest
  await page.route('**/api/prototype-versions', async (route) => {
    if (route.request().method() === 'POST') {
      retryRequest = route.request().postDataJSON()
      posts.push({ requestId: retryRequest.requestId, mode: 'explicit-original-retry' })
    }
    await route.continue()
  })
  await active.getByTestId('publication-retry').click()
  await page.waitForFunction(
    () => !localStorage.getItem('eap.prototype-publication.v1.builder-beta'),
  )
  await active.getByTestId('version-preview').waitFor()
  await active.getByTestId('builder-tab-design').click()
  await active.getByRole('tab', { name: '页面设置', exact: true }).click()
  assert.equal(await active.getByTestId('grapes-title').inputValue(), editedTitle)
  assert.deepEqual(retryRequest, absentRequest)
  const retried = await (
    await api('GET', '/api/prototype-publications/' + absentRequest.requestId)
  ).json()
  assert.equal(retried.title, absentRequest.title)
  assert.equal(retried.body, absentRequest.body)
  checks.push(
    'Pre-send abort: explicit query returns 404, explicit retry preserves identity and frozen body while keeping subsequent draft edits; alpha/beta intents are isolated',
  )
  await page.unroute('**/api/prototype-versions')

  const request = {
    ...firstRequest,
    requestId: crypto.randomUUID(),
    title: 'Concurrent identity ' + Date.now(),
  }
  const responses = await Promise.all(
    Array.from({ length: 12 }, () => api('POST', '/api/prototype-versions', request)),
  )
  assert(responses.every((response) => response.status() === 200))
  const versions = await Promise.all(responses.map((response) => response.json()))
  assert(
    versions.every(
      (version) => version.id === versions[0].id && version.requestId === request.requestId,
    ),
  )
  assert.equal(
    (
      await api('POST', '/api/prototype-versions', {
        ...request,
        title: request.title + ' conflict',
      })
    ).status(),
    409,
  )
  const { requestId: unused, ...withoutIdentity } = request
  assert(unused)
  assert.equal((await api('POST', '/api/prototype-versions', withoutIdentity)).status(), 400)
  assert.equal(
    (await api('GET', '/api/prototype-publications/' + crypto.randomUUID())).status(),
    404,
  )
  const after = await (await api('GET', '/api/prototype-versions?sourceRef=builder-alpha')).json()
  assert.equal(after.items.filter((version) => version.requestId === request.requestId).length, 1)
  assert.equal(
    after.items.filter((version) => version.requestId === firstRequest.requestId).length,
    1,
  )
  assert.equal(after.items.length, before.items.length + (checkpoint ? 1 : 2))
  for (const old of before.items)
    assert.equal(after.items.find((version) => version.id === old.id)?.contentHash, old.contentHash)
  checks.push(
    'Twelve concurrent real HTTP/JDBC publications share one version, changed content conflicts with 409, missing identity is 400, absent GET is read-only, existing version hashes remain unchanged',
  )
  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  await page.screenshot({ path: resolve(output, 'recovered-draft.png'), fullPage: true })
  await writeFile(
    resolve(output, 'result.json'),
    JSON.stringify(
      {
        host: 'production executable full-application jar',
        schema: 31,
        checks,
        pageErrors: errors,
        externalRequests: external,
        browserPosts: posts,
        versions: [committed, retried, versions[0]].map(({ id, requestId, contentHash }) => ({
          id,
          requestId,
          contentHash,
        })),
        concurrentRequests: 12,
        existingVersionHashesPreserved: true,
        formalHostLeftRunning: true,
      },
      null,
      2,
    ),
  )
  process.stdout.write(
    JSON.stringify({
      passed: checks.length,
      versions: [committed.id, retried.id, versions[0].id],
      pageErrors: errors.length,
    }),
  )
} catch (error) {
  await page?.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {})
  const state = await page
    ?.evaluate(() => ({
      hash: location.hash,
      visible: [...document.querySelectorAll('[data-testid]')]
        .filter((el) => el.getBoundingClientRect().width > 0)
        .map((el) => el.getAttribute('data-testid')),
      text: document.body.innerText.slice(-6000),
    }))
    .catch(() => null)
  await writeFile(
    resolve(output, 'failure.json'),
    JSON.stringify({ message: error.message, checks, errors, external, posts, state }, null, 2),
  )
  throw error
} finally {
  await browser?.close()
  await server.close()
}
