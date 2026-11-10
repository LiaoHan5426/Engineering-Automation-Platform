import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite-plus'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

const repository = resolve('..')
const session = JSON.parse(
  await readFile(resolve(repository, 'backend/target/component-live/session.json'), 'utf8'),
)
const host = JSON.parse(
  await readFile(resolve(repository, 'backend/target/component-live/process.json'), 'utf8'),
)
const output = resolve('apps/web/__tests__/browser/artifacts/component-page-delivery')
await mkdir(output, { recursive: true })
const { chromium } = createRequire(import.meta.url)(process.env.EAP_PLAYWRIGHT_MODULE)
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
    proxy: { '/api': { target: host.base, changeOrigin: true } },
  },
})
const errors = [],
  mutations = [],
  external = [],
  checks = []
let browser, page
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(20000)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.url().includes('/api/') && !['GET', 'HEAD'].includes(request.method()))
      mutations.push(request.url())
  })
  await page.route('**/*', (route) => {
    const url = route.request().url()
    if (/^https?:/.test(url) && new URL(url).hostname !== '127.0.0.1') {
      external.push(url)
      return route.abort()
    }
    return route.continue()
  })
  await page.addInitScript(({ projectId }) => {
    localStorage.setItem(
      'eap.local-projects.v1',
      JSON.stringify([{ id: projectId, label: 'Reviewed component delivery', intendedPath: '' }]),
    )
    localStorage.setItem('eap.selected-project.v1', projectId)
  }, session)
  await page.goto(server.resolvedUrls.local[0] + '#board')
  await page.getByTestId('preview-board').waitFor()
  await page.getByRole('button').filter({ hasText: session.task.title }).first().click()
  await page.getByTestId('board-tab-code').click()
  await page.getByTestId('board-code-refresh').click()
  await page.getByTestId('board-code-open').click()
  await page.getByTestId('evidence-panel').waitFor()
  assert.equal(await page.getByTestId('proposal-apply').count(), 0)
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await page.getByTestId('evidence-filter').fill('SUMMARY')
    assert.equal(await page.getByTestId('evidence-file').count(), 1)
    await page.getByTestId('evidence-file').click()
    assert.match(
      await page.getByTestId('evidence-detail').innerText(),
      /DeliveryEvidenceSummary.vue/,
    )
    const bounds = await page.getByTestId('evidence-panel').boundingBox()
    assert.ok(
      bounds.x >= 0 && bounds.x + bounds.width <= width + 1,
      JSON.stringify({ width, bounds }),
    )
    await page.screenshot({ path: resolve(output, 'main-page-' + width + '.png'), fullPage: true })
    await page.getByTestId('evidence-filter').fill('no-such-file')
    assert.equal(await page.getByTestId('evidence-detail').count(), 0)
    await page.getByTestId('evidence-filter').fill('')
    assert.equal(await page.getByTestId('evidence-file').count(), 3)
    checks.push({ width, filterSelectionEmpty: true, panelInsideViewport: true })
  }
  assert.deepEqual(errors, [])
  assert.deepEqual(mutations, [])
  assert.deepEqual(external, [])
  await writeFile(
    resolve(output, 'main-preview.json'),
    JSON.stringify(
      {
        kind: 'Current main-worktree format/CSS normalization preview against original durable evidence; read only',
        checks,
        errors,
        mutations,
        external,
        userProductAcceptance: false,
      },
      null,
      2,
    ),
  )
  process.stdout.write(JSON.stringify({ checks, errors, mutations, external }) + '\n')
} catch (error) {
  process.stdout.write(
    JSON.stringify(
      await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            '[role=dialog], .eap-dialog__body, .board-code, .eap-panel, .eap-panel__body, .eap-collapse, .proposal-diff, .proposal-application',
          ),
        ].map((node) => ({
          class: node.className,
          width: node.getBoundingClientRect().width,
          left: node.getBoundingClientRect().left,
          minWidth: getComputedStyle(node).minWidth,
          scrollWidth: node.scrollWidth,
        })),
      ),
    ) + '\n',
  )
  await page
    ?.screenshot({ path: resolve(output, 'main-preview-failure.png'), fullPage: true })
    .catch(() => {})
  throw error
} finally {
  await browser?.close()
  await server.close()
}
