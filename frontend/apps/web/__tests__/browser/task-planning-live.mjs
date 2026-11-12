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
    port: 5201,
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
  await page.addInitScript(() => {
    localStorage.setItem('eap.locale', 'zh-CN')
    localStorage.setItem(
      'eap.local-projects.v1',
      JSON.stringify([{ id: 'task-planning-qa', label: 'Task planning', intendedPath: '' }]),
    )
    localStorage.setItem('eap.selected-project.v1', 'task-planning-qa')
  })
  await page.goto(server.resolvedUrls.local[0] + '#board')
  await page.getByRole('button').filter({ hasText: 'Plan and implement task' }).first().click()
  await page.getByTestId('board-plan-task').click()
  const adopt = async () => {
    await page.getByTestId('adopt-board-draft').click()
    await page
      .getByRole('dialog', { name: '采用任务草稿并新建对话', exact: true })
      .getByRole('button', { name: '采用任务草稿并新建对话', exact: true })
      .click()
    await page.getByTestId('model-picker').click()
    await page
      .getByRole('button', { name: 'Directory fixture · directory-fixture', exact: true })
      .click()
    await page.keyboard.press('Escape')
  }
  await adopt()
  await page.getByTestId('composer-task-binding').waitFor()
  assert.match(await page.getByTestId('composer-task-binding').innerText(), new RegExp(host.taskId))
  assert.match(await page.getByTestId('execution-mode').innerText(), /规划/)
  await page.getByTestId('send-message').click()
  await page
    .getByText(
      'Review the task, preserve the existing page, then implement the heading and verify it.',
      { exact: true },
    )
    .waitFor()
  await page.getByTestId('task-plan-open').click()
  await page.getByTestId('task-plan-adopt').click()
  await page.getByTestId('task-plan-notes').fill('Reviewed implementation plan for task')
  await page.getByTestId('task-plan-save').click()
  await page.getByTestId('task-plan-ready').waitFor()
  assert.equal(await page.getByTestId('task-plan-prepare').isDisabled(), true)
  await page.getByTestId('task-plan-ready').click()
  await page.getByTestId('task-plan-ready').waitFor({ state: 'hidden' })
  await page.screenshot({ path: resolve(output, 'planned-task-ready-narrow.png') })
  await page.getByTestId('task-plan-prepare').click()
  await page.getByTestId('prepare-target').fill('frontend/Page.vue')
  await page.getByTestId('prepare-check').click()
  await page.getByTestId('prepare-result').waitFor()
  await page.getByTestId('prepare-adopt').click()
  await adopt()
  assert.match(await page.getByTestId('composer-task-binding').innerText(), /r3/)
  assert.doesNotMatch(await page.getByTestId('execution-mode').innerText(), /规划/)
  assert.equal(await page.getByTestId('generation-target').inputValue(), 'frontend/Page.vue')
  await page.getByTestId('send-message').click()
  await page.getByTestId('proposal-application').waitFor()
  assert.equal(await page.getByTestId('proposal-apply').isDisabled(), true)
  await page.getByTestId('proposal-application').getByRole('checkbox').check()
  const applied = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/apply'),
  )
  await page.getByTestId('proposal-apply').click()
  assert.equal((await applied).status(), 200)
  await page.screenshot({ path: resolve(output, 'planned-task-applied-narrow.png') })
  assert.deepEqual(errors, [])
  await writeFile(
    resolve(output, 'browser-validation.json'),
    JSON.stringify(
      {
        productionBundle: true,
        originalTaskId: host.taskId,
        planningModeAdopted: true,
        explicitReady: true,
        latestRevisionAdopted: 3,
        candidateConfirmedAndApplied: true,
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
