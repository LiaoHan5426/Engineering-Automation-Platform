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
    port: 5202,
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
      JSON.stringify([{ id: 'engineering-agent-qa', label: 'Engineering task', intendedPath: '' }]),
    )
    localStorage.setItem('eap.selected-project.v1', 'engineering-agent-qa')
  })
  await page.goto(server.resolvedUrls.local[0] + '#board')
  await page.getByRole('button').filter({ hasText: 'Plan and implement task' }).first().click()
  await page.getByTestId('board-prepare-code').click()
  await page.getByTestId('prepare-target').fill('frontend/Page.vue')
  await page.getByTestId('prepare-companions').fill('frontend/page.css')
  await page.getByTestId('prepare-check').click()
  await page.getByTestId('prepare-result').waitFor()
  await page.getByTestId('prepare-adopt').click()
  await page.getByTestId('adopt-board-draft').click()
  await page
    .getByRole('dialog', { name: '采用任务草稿并新建对话', exact: true })
    .getByRole('button', { name: '采用任务草稿并新建对话', exact: true })
    .click()
  await page.getByTestId('model-picker').click()
  await page.getByRole('button', { name: host.modelLabel, exact: true }).click()
  await page.keyboard.press('Escape')
  await page.getByTestId('execution-mode').click()
  assert.equal(await page.getByTestId('execution-agent').isDisabled(), false)
  await page.getByTestId('execution-agent').click()
  await page.getByTestId('agent-boundary').waitFor()
  const sent = []
  let applies = 0
  let runStarts = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/messages'))
      sent.push(request.postDataJSON())
    if (request.method() === 'POST' && request.url().endsWith('/apply')) applies++
    if (request.method() === 'POST' && request.url().endsWith('/runs')) runStarts++
  })
  await page.getByTestId('send-message').click()
  await page.getByTestId('proposal-application').waitFor({ timeout: 120_000 })
  assert.equal(sent.length, 1)
  assert.equal(sent[0].toolMode, 'code_sources')
  assert.equal(sent[0].context.mode, 'code')
  assert.equal(sent[0].context.taskRef.taskId, host.taskId)
  assert.equal(applies, 0)
  assert.equal(await page.getByTestId('proposal-apply').isDisabled(), true)
  await page.getByTestId('proposal-apply').scrollIntoViewIfNeeded()
  const feedHeight = await page.getByTestId('chat-feed').evaluate((node) => node.clientHeight)
  assert.ok(feedHeight >= 180, `Conversation must remain readable: ${feedHeight}px`)
  assert.ok(
    await page.getByTestId('proposal-apply').evaluate((node) => {
      const box = node.getBoundingClientRect()
      const top = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)
      return top === node || node.contains(top)
    }),
    'Approval action must be visible and unobscured',
  )
  await page.screenshot({ path: resolve(output, 'agent-proposal-narrow.png') })
  await page.getByTestId('proposal-application').getByRole('checkbox').check()
  const applied = page.waitForResponse(
    (response) => response.request().method() === 'POST' && response.url().endsWith('/apply'),
  )
  await page.getByTestId('proposal-apply').click()
  assert.equal((await applied).status(), 200)
  assert.equal(applies, 1)
  await page.getByTestId('application-continue').waitFor()
  await page.getByTestId('application-continue').scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve(output, 'agent-applied-narrow.png') })
  const taskRead = page.waitForResponse(
    (response) =>
      response.request().method() === 'GET' &&
      response.url().includes('/board/tasks/' + host.taskId + '?'),
  )
  await page.getByTestId('application-continue').click()
  const currentTask = await (await taskRead).json()
  assert.equal(currentTask.id, host.taskId)
  assert.equal(currentTask.projectId, 'engineering-agent-qa')
  assert.equal(currentTask.revision, 1)
  await page.getByTestId('board-runs-section').waitFor()
  await page.waitForFunction(() => {
    const refresh = document.querySelector('[data-testid=board-run-refresh]')
    return refresh && !refresh.disabled
  })
  assert.equal(new URLSearchParams(page.url().split('?')[1]).get('taskId'), host.taskId)
  assert.equal(await page.getByTestId('board-tab-runs').getAttribute('aria-selected'), 'true')
  await page.screenshot({ path: resolve(output, 'agent-task-continuation-narrow.png') })
  await page.reload()
  await page.getByTestId('board-runs-section').waitFor()
  await page.waitForFunction(() => {
    const refresh = document.querySelector('[data-testid=board-run-refresh]')
    return refresh && !refresh.disabled
  })
  assert.equal(runStarts, 0)
  assert.deepEqual(errors, [])
  await writeFile(
    resolve(output, 'browser-validation.json'),
    JSON.stringify(
      {
        productionBundle: true,
        taskId: host.taskId,
        selectedEngineeringAgent: true,
        frozenSources: 2,
        toolMode: sent[0].toolMode,
        noAutomaticApply: true,
        feedHeight,
        explicitApply: applies,
        taskContinuationAndReload: true,
        automaticRunStarts: runStarts,
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
