import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite-plus'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const repository = resolve('..')
const host = JSON.parse(
  await readFile(resolve(repository, 'backend/target/status-i18n/live/host.json'), 'utf8'),
)
const output = resolve('apps/web/__tests__/browser/artifacts/status-i18n')
await mkdir(output, { recursive: true })
const { chromium } = loadPlaywright()
const target = 'http://127.0.0.1:' + host.port
const server = await createServer({
  configFile: false,
  root: resolve('apps/web'),
  plugins: [vue(), tailwindcss()],
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
  },
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: { '/api': { target, changeOrigin: true }, '/qa': { target, changeOrigin: true } },
  },
})
const checks = [],
  errors = [],
  requests = [],
  external = []
let browser, page
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(20000)
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('request', (request) => {
    if (request.url().includes('/api/'))
      requests.push({
        method: request.method(),
        path: new URL(request.url()).pathname,
        language: request.headers()['accept-language'],
      })
  })
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (/^https?:/.test(url) && new URL(url).hostname !== '127.0.0.1') {
      external.push(url)
      return route.abort()
    }
    return route.continue()
  })
  await page.goto(server.resolvedUrls.local[0] + '#capabilities')
  await page.addScriptTag({ type: 'module', url: '/__tests__/browser/statusI18nProbe.ts' })
  const panel = page.getByTestId('trusted-git-status-execution-panel')
  await panel.waitFor()
  await page.getByTestId('trusted-git-status-review-resolution').waitFor()
  for (const language of ['zh-CN', 'en-US']) {
    const transport = await page.evaluate(
      async ({ language, conversationId }) => {
        return window.__eapStatusI18nProbe(language, conversationId)
      },
      { language, conversationId: host.conversationId },
    )
    assert.equal(transport.axiosProblem.code, 'UNKNOWN_CONVERSATION')
    assert.equal(transport.sseProblem.code, 'UNKNOWN_CONVERSATION')
    assert.equal(transport.axiosProblem.status, 404)
    assert.equal(transport.sseProblem.status, 404)
    await page
      .getByTestId('trusted-git-status-review-resolution')
      .getByText(transport.expectedClosed, { exact: false })
      .waitFor()
    await page.request.post(server.resolvedUrls.local[0] + 'qa/status-i18n/store-failure', {
      data: { enabled: true },
    })
    try {
      await page.getByTestId('trusted-git-status-recheck').click()
      await page
        .getByTestId('trusted-git-status-environment')
        .getByText(transport.expectedStore, { exact: false })
        .waitFor()
      await page.waitForFunction(
        () => !document.querySelector('[data-testid="trusted-git-status-recheck"]').disabled,
      )
      assert.match(await panel.innerText(), new RegExp(host.toolExecutionId))
      await panel.scrollIntoViewIfNeeded()
      await page.screenshot({ path: resolve(output, 'tool-store-' + language + '.png') })
    } finally {
      await page.request.post(server.resolvedUrls.local[0] + 'qa/status-i18n/store-failure', {
        data: { enabled: false },
      })
    }
    checks.push({ language, ...transport, preservedExecution: host.toolExecutionId })
  }
  const old = checks[0].axiosProblem,
    current = checks[1].axiosProblem
  assert.equal(old.code, current.code)
  assert.notEqual(old.detail, current.detail)
  assert.ok(requests.some((r) => r.language === 'zh-CN' && r.path.endsWith('/messages')))
  assert.ok(requests.some((r) => r.language === 'en-US' && r.path.endsWith('/messages')))
  assert.deepEqual(errors, [])
  assert.deepEqual(external, [])
  const result = {
    kind: 'Current production Vue page and Axios/SSE client against isolated full application; real HTTP/JDBC, explicit database failure fixture',
    checks,
    requests,
    errors,
    external,
    userProductAcceptance: false,
  }
  await writeFile(resolve(output, 'browser-result.json'), JSON.stringify(result, null, 2))
  process.stdout.write(
    JSON.stringify({
      checks: checks.length,
      pageErrors: errors.length,
      externalRequests: external.length,
    }) + '\n',
  )
} catch (error) {
  if (page) {
    await page.screenshot({ path: resolve(output, 'browser-failure.png') })
    process.stdout.write((await page.locator('body').innerText()).slice(-8000))
  }
  throw error
} finally {
  await browser?.close()
  await server.close()
}
