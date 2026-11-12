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
    port: 5196,
    strictPort: true,
    proxy: { '/api': { target: host.backend, changeOrigin: true } },
  },
})
let browser
const errors = [],
  requests = [],
  creates = []
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  page.setDefaultTimeout(20000)
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (request) => {
    if (request.url().endsWith('/api/board/tasks') && request.method() === 'POST')
      creates.push(request.postDataJSON())
  })
  page.on('request', (request) => {
    if (request.url().includes('/messages')) requests.push(request.postDataJSON())
  })
  await page.addInitScript((host) => {
    localStorage.setItem('eap.locale', 'zh-CN')
    localStorage.setItem(
      'eap.local-projects.v1',
      JSON.stringify([{ id: 'planning-task-qa', label: 'Planning task review', intendedPath: '' }]),
    )
    localStorage.setItem('eap.selected-project.v1', 'planning-task-qa')
    const key = encodeURIComponent(host.backend + '/api') + '.eap.chat.history.v1'
    if (localStorage.getItem(key)) return
    localStorage.setItem(
      key,
      JSON.stringify({
        version: 1,
        activeId: host.conversationId,
        transcripts: { [host.conversationId]: [] },
        items: [
          {
            id: host.conversationId,
            title: 'Planning review',
            draft: 'Plan the selected page without changing it',
            archived: false,
            workspaceLabel: host.workspaceLabel,
            memory: '',
            connectionId: null,
            model: null,
            context: {
              mode: 'code',
              expert: 'frontend',
              instructions: '',
              reasoning: 'default',
              approval: 'review',
              files: [],
              prototypeVersionId: '',
              targetPath: 'frontend/Page.vue',
            },
          },
        ],
      }),
    )
  }, host)
  await page.goto(server.resolvedUrls.local[0] + '#chat')
  await page.getByTestId('generation-target').waitFor()
  assert.equal(await page.getByTestId('generation-target').inputValue(), 'frontend/Page.vue')
  await page.locator('textarea.composer-draft').fill('Plan the selected page without changing it')
  await page.getByTestId('execution-mode').click()
  assert.equal(await page.getByTestId('execution-agent').isDisabled(), true)
  await page.getByTestId('execution-plan').click()
  await page.getByTestId('planning-boundary').waitFor()
  await page.screenshot({ path: resolve(output, 'planning-before-send.png') })
  await writeFile(resolve(output, 'before-send.txt'), await page.locator('body').innerText())
  await page
    .waitForFunction(() => !document.querySelector('[data-testid="send-message"]')?.disabled)
    .catch(async (failure) => {
      await writeFile(
        resolve(output, 'browser-diagnostic.json'),
        JSON.stringify(
          {
            errors,
            storage: await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))),
          },
          null,
          2,
        ),
      )
      throw failure
    })
  const sent = page.waitForRequest(
    (request) => request.url().includes('/messages') && request.method() === 'POST',
  )
  await page.getByTestId('send-message').click()
  const body = (await sent).postDataJSON()
  assert.equal(body.context.mode, 'plan')
  assert.equal(body.context.targetPath, 'frontend/Page.vue')
  assert.equal(body.toolMode, 'none')
  await page.getByText('Read-only plan: preserve the existing page', { exact: false }).waitFor()
  assert.equal(await page.getByTestId('proposal-apply').count(), 0)
  await page.reload()
  await page.getByTestId('planning-boundary').waitFor()
  await page
    .getByText('Read-only plan: preserve the existing page', { exact: false })
    .scrollIntoViewIfNeeded()
  await page.screenshot({ path: resolve(output, 'planning-mode-narrow.png') })
  await page.getByTestId('execution-mode').click()
  await page.getByTestId('execution-chat').click()
  assert.equal(await page.getByTestId('planning-boundary').count(), 0)
  const guardConversation = await (
    await page.request.post(host.backend + '/api/ai/conversations', { data: {} })
  ).json()
  const denied = await page.request.post(
    host.backend + '/api/ai/conversations/' + guardConversation.conversationId + '/messages',
    {
      data: {
        message: 'Try a tool in planning mode',
        toolMode: 'git_status',
        context: { mode: 'plan' },
      },
    },
  )
  assert.equal(denied.status(), 400)
  await page.getByTestId('answer-create-task').click()
  const form = page.getByTestId('board-create-form')
  await form.waitFor()
  assert.equal(
    await page.getByTestId('board-new-goal').inputValue(),
    'Read-only plan: preserve the existing page, update the shared controls, then verify the result. No files changed.',
  )
  await page.getByTestId('board-new-title').fill('Reviewed page delivery')
  await page.getByTestId('board-new-goal').fill('Implement the reviewed page plan')
  await page.getByTestId('board-new-criteria').fill('Keep shared controls and verify the page')
  await page.getByTestId('board-handoff-source').locator('summary').click()
  await page
    .getByTestId('board-handoff-source')
    .getByText('Read-only plan: preserve the existing page', { exact: false })
    .waitFor()
  await page.screenshot({ path: resolve(output, 'planning-task-draft-narrow.png') })
  await page.getByRole('dialog').locator('[data-eap-dialog-close]').click()
  assert.equal(creates.length, 0)
  await page.getByTestId('board-handoff-resume').click()
  assert.equal(
    await page.getByTestId('board-new-goal').inputValue(),
    'Implement the reviewed page plan',
  )
  await page.reload()
  await page.getByTestId('board-create-form').waitFor()
  assert.equal(
    await page.getByTestId('board-new-criteria').inputValue(),
    'Keep shared controls and verify the page',
  )
  await page.route('**/api/board/tasks', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    await route.abort('failed')
  })
  await page.getByTestId('board-create-save').click()
  await page.getByTestId('board-create-note').filter({ hasText: '创建结果尚未确认' }).waitFor()
  assert.equal(await page.getByTestId('board-new-goal').isDisabled(), true)
  await page.unroute('**/api/board/tasks')
  await page.reload()
  await page.getByTestId('board-create-save').click()
  await page.getByTestId('board-detail').waitFor()
  assert.equal(creates.length, 2)
  assert.deepEqual(creates[0], creates[1])
  const tasks = await (
    await page.request.get(host.backend + '/api/board/tasks?projectId=planning-task-qa')
  ).json()
  assert.equal(tasks.items.length, 1)
  const task = tasks.items[0]
  assert.equal(task.sessionId, host.conversationId)
  assert.equal(task.column, 'planned')
  assert.equal(task.goal, 'Implement the reviewed page plan')
  const leftover = await page.evaluate(() =>
    Object.entries(localStorage).filter(([key]) => key.endsWith('.eap.board-task-handoff.v1')),
  )
  assert.deepEqual(leftover, [])
  await page
    .getByTestId('board-detail')
    .getByRole('button', { name: '待处理', exact: true })
    .click()
  await page.getByTestId('board-prepare-code').click()
  await page.getByTestId('prepare-target').fill('frontend/Page.vue')
  await page.getByTestId('prepare-check').click()
  await page.getByTestId('prepare-result').waitFor()
  await page.getByTestId('prepare-adopt').click()
  await page.getByTestId('adopt-board-draft').click()
  await page
    .getByRole('dialog', { name: '采用任务草稿并新建对话', exact: true })
    .getByRole('button', { name: '采用任务草稿并新建对话', exact: true })
    .click()
  await page.getByTestId('composer-task-binding').waitFor()
  assert.equal(await page.getByTestId('generation-target').inputValue(), 'frontend/Page.vue')
  assert.match(
    await page.locator('textarea.composer-draft').inputValue(),
    /Implement the reviewed page plan/,
  )
  assert.match(await page.getByTestId('composer-task-binding').innerText(), new RegExp(task.id))
  await page.getByTestId('execution-mode').click()
  await page.getByTestId('execution-plan').click()
  await page
    .locator('textarea.composer-draft')
    .fill('Review the bound task plan without executing it')
  await page.getByTestId('send-message').click()
  await page
    .getByText('Read-only plan: preserve the existing page', { exact: false })
    .last()
    .waitFor()
  await page.getByTestId('task-plan-open').click()
  await page.getByTestId('task-plan-adopt').click()
  await page.getByTestId('task-plan-notes').fill('Reviewed task implementation plan')
  let updatePosts = 0
  const taskRoute = '**/api/board/tasks/' + task.id
  await page.route(taskRoute, async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    updatePosts++
    const response = await route.fetch()
    assert.equal(response.status(), 200)
    await route.abort('failed')
  })
  await page.getByTestId('task-plan-save').click()
  await page.getByTestId('task-plan-reconcile').waitFor()
  assert.equal(await page.getByTestId('task-plan-notes').isDisabled(), true)
  await page.unroute(taskRoute)
  const reconciled = page.waitForResponse(
    (response) =>
      response.url().includes('/api/board/tasks/' + task.id + '?') &&
      response.request().method() === 'GET',
  )
  await page.getByTestId('task-plan-reconcile').click()
  assert.equal((await reconciled).status(), 200)
  await page.getByTestId('task-plan-reconcile').waitFor({ state: 'hidden' })
  assert.equal(updatePosts, 1)
  const updated = await (
    await page.request.get(host.backend + '/api/board/tasks?projectId=planning-task-qa')
  ).json()
  assert.equal(updated.items[0].notes, 'Reviewed task implementation plan')
  assert.equal(updated.items[0].revision, task.revision + 2)
  await page.screenshot({ path: resolve(output, 'planning-task-update-narrow.png') })
  await page.getByTestId('task-plan-prepare').click()
  await page.getByTestId('prepare-target').fill('frontend/Page.vue')
  await page.getByTestId('prepare-references').fill('frontend/Host.ts')
  await page.getByTestId('prepare-check').click()
  await page.getByTestId('prepare-result').waitFor()
  await page.getByTestId('prepare-adopt').click()
  await page.getByTestId('adopt-board-draft').click()
  await page
    .getByRole('dialog', { name: '采用任务草稿并新建对话', exact: true })
    .getByRole('button', { name: '采用任务草稿并新建对话', exact: true })
    .click()
  await page.getByTestId('composer-task-binding').waitFor()
  assert.equal(await page.getByTestId('generation-target').inputValue(), 'frontend/Page.vue')
  assert.match(
    await page.locator('textarea.composer-draft').inputValue(),
    /Reviewed task implementation plan/,
  )
  assert.match(
    await page.getByTestId('composer-task-binding').innerText(),
    new RegExp('r' + updated.items[0].revision),
  )
  await page.getByRole('button', { name: 'read-only:frontend/Host.ts', exact: true }).waitFor()
  await page.getByTestId('execution-mode').click()
  await page.getByTestId('execution-plan').click()
  await page
    .locator('textarea.composer-draft')
    .fill('Review the saved plan with its read-only host reference')
  await page.getByTestId('send-message').click()
  await page
    .getByText('Read-only plan: preserve the existing page', { exact: false })
    .last()
    .waitFor()
  await page.screenshot({ path: resolve(output, 'planning-task-implementation-narrow.png') })
  assert.deepEqual(errors, [])
  await writeFile(
    resolve(output, 'validation.json'),
    JSON.stringify(
      {
        browser: 'real Chromium',
        backend: 'full application with isolated PostgreSQL',
        model: 'explicit Fake ChatModel',
        planningRequests: requests.filter((request) => request?.context?.mode === 'plan').length,
        sourceRead: true,
        readOnlyHostReferenceAdoptedAndSent: true,
        noProposal: true,
        toolRequestRejected: 400,
        refreshedMode: true,
        taskHandoff: {
          taskId: task.id,
          draftRecovered: true,
          creationPosts: creates.length,
          sameRequestAfterLostResponse: true,
          sourceSessionLinked: true,
          implementationAdopted: true,
        },
        pageErrors: errors,
      },
      null,
      2,
    ),
  )
} finally {
  await browser?.close()
  await server.close()
}
