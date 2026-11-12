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
const { preview } = await import(
  pathToFileURL(resolve(dirname(require.resolve('vite-plus/package.json')), 'dist/index.js')).href
)
const { chromium } = loadPlaywright()
// Run `vp build` first. Exercise the current production bundle, without dev-server optimization.
const server = await preview({
  configFile: false,
  root: resolve('apps/web'),
  preview: {
    host: '127.0.0.1',
    port: 5199,
    strictPort: true,
    proxy: { '/api': { target: host.backend, changeOrigin: true } },
  },
})
let browser, page
try {
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => localStorage.setItem('eap.locale', 'zh-CN'))
  await page.goto(server.resolvedUrls.local[0] + '#scenes')
  await page.getByTestId('create-scene').click()
  await page
    .getByTestId('scene-basic-fields')
    .locator('input')
    .first()
    .fill('Scenario skill review')
  await page
    .getByTestId('scene-basic-fields')
    .locator('textarea')
    .last()
    .fill('Scenario-specific instructions')
  await page.getByTestId('scene-tab-skills').click()
  await page.getByTestId('scene-skill-select').selectOption('directory-review')
  await page.getByTestId('scene-skill-add').click()
  await page
    .getByTestId('scene-skills-list')
    .getByText('directory-review', { exact: false })
    .waitFor()
  const saving = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' && response.url().includes('/api/scenarios/'),
  )
  await page.getByTestId('scene-save').click()
  const savedResponse = await saving
  assert.equal(savedResponse.status(), 200)
  const saved = await savedResponse.json()
  assert.deepEqual(saved.definition.skills, ['directory-review'])
  await page.getByTestId('scene-save-result').waitFor()
  await page.reload()
  await page.locator('[data-testid=scene-open-detail][data-scene-id="' + saved.id + '"]').click()
  await page.getByTestId('scene-tab-skills').click()
  await page.getByTestId('scene-skills-list').getByText('1 个启用版本', { exact: false }).waitFor()
  await page.screenshot({ path: resolve(output, 'scenario-skills-narrow.png') })
  await page.getByTestId('scene-tab-basic').click()
  await page.getByTestId('apply-scenario').click()
  await page.getByTestId('scenario-skill-open').waitFor()
  await page.getByTestId('scenario-skill-open').click()
  await page.getByTestId('skill-candidate-directory-review-1.0.0').waitFor()
  assert.equal(await page.getByTestId('skill-candidate-directory-review-1.1.0').isDisabled(), true)
  await page.getByTestId('skill-candidate-directory-review-1.0.0').click()
  await page.getByTestId('skill-resource-0').check()
  await page.getByTestId('skill-context-preview').click()
  await page.getByTestId('skill-context-result').waitFor()
  await page.getByTestId('skill-use').click()
  await page.getByTestId('skill-remove').waitFor()
  const question = page.locator('textarea.composer-draft')
  await question.fill('Review the scenario using the exact selected resource')
  await page.getByTestId('send-message').click()
  await page.getByText('Reviewed the selected text resources.', { exact: true }).waitFor()
  await page.getByTestId('turn-skill').waitFor()
  await page.screenshot({ path: resolve(output, 'scenario-skill-response-narrow.png') })
  assert.deepEqual(errors, [])
  await writeFile(
    resolve(output, 'browser-validation.json'),
    JSON.stringify(
      {
        scenarioId: saved.id,
        scenarioSavedAndReloaded: true,
        productionBundle: true,
        enabledVersionObserved: true,
        disabledVersionBlocked: true,
        explicitVersionAndResources: true,
        actualChatResponse: true,
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
  await new Promise((resolve, reject) =>
    server.httpServer.close((error) => (error ? reject(error) : resolve())),
  )
}
