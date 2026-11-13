import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// This runner only previews a previously built production App. The Java host owns DB lifecycle.
const manifest = resolve(process.argv[2])
const output = dirname(manifest)
const host = JSON.parse(await readFile(manifest, 'utf8'))
const save = (name, value) => writeFile(resolve(output, name), JSON.stringify(value, null, 2))
const require = createRequire(resolve('package.json'))
const { preview } = await import(pathToFileURL(resolve(dirname(require.resolve('vite-plus/package.json')), 'dist/index.js')).href)
const { chromium, expect } = loadPlaywright()
const server = await preview({
  configFile: false,
  root: resolve('apps/web'),
  preview: { host: '127.0.0.1', port: 5203, strictPort: true, proxy: { '/api': { target: host.backend, changeOrigin: true } } },
})
let browser, page
const tasks = [], creationAttempts = [], faults = [], pageErrors = [], http = []
let realOptimizationCalls = 0, createMode = 'normal', optimizationMode = 'real', pendingMock
const optimizationPath = '**/api/ai/task-description/optimizations/*'
try {
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(12_000)
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('response', (response) => {
    if (response.url().includes('/api/')) http.push({ method: response.request().method(), url: response.url(), status: response.status() })
  })
  await page.addInitScript(({ project }) => {
    localStorage.setItem('eap.locale', 'zh-CN')
    localStorage.setItem('eap.local-projects.v1', JSON.stringify([{ id: project, label: '看板新建任务验收', intendedPath: '' }]))
    localStorage.setItem('eap.selected-project.v1', project)
  }, { project: host.project })
  // One lifetime route avoids unroute races. Only explicit fault phases intercept optimization POST.
  await page.route(optimizationPath, async (route) => {
    const request = route.request()
    if (request.method() === 'DELETE') {
      const response = await route.fetch()
      const id = request.url().split('/').at(-1)
      faults.push({ phase: 'real cancellation tombstone', id, status: response.status() })
      await save('faults.json', faults)
      assert.equal(response.status(), 204)
      await route.fulfill({ response })
      if (pendingMock?.id === id) pendingMock.release()
      return
    }
    if (request.method() !== 'POST') return route.continue()
    if (optimizationMode === 'real') {
      realOptimizationCalls++
      assert.equal(realOptimizationCalls, 1, 'Only one real provider optimization is allowed')
      return route.continue()
    }
    const phase = optimizationMode
    const id = request.url().split('/').at(-1)
    let release
    const gate = new Promise((done) => { release = done })
    pendingMock = { id, release }
    faults.push({ phase, id, request: request.postDataJSON(), boundary: 'explicit mocked late response; no provider call' })
    await save('faults.json', faults)
    // Release only after the same UUID DELETE has reached the backend and returned 204.
    await gate
    try {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        text: 'MOCK LATE RESULT — must never replace the current draft', connectionId: 'explicit-fault-fixture', model: 'mock-only',
      }) })
    } catch (error) {
      faults.push({ phase, abortedTransport: String(error) })
    }
    faults.push({ phase, lateResponseReleased: true, id })
    pendingMock = null
    await save('faults.json', faults)
  })
  await page.route('**/api/board/tasks', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const request = route.request().postDataJSON()
    const attempt = { mode: createMode, request }
    creationAttempts.push(attempt)
    await save('creation-attempts.json', creationAttempts)
    if (createMode === 'reject-once') {
      createMode = 'normal'
      attempt.status = 400
      await save('creation-attempts.json', creationAttempts)
      return route.fulfill({ status: 400, contentType: 'application/problem+json', body: JSON.stringify({
        type: 'about:blank', title: 'Invalid task', status: 400, detail: 'Explicit acceptance fixture rejection', code: 'INVALID_REQUEST',
      }) })
    }
    // The write always reaches the real backend before the response-loss injection.
    const response = await route.fetch()
    const body = await response.json()
    attempt.status = response.status()
    attempt.response = body
    await save('creation-attempts.json', creationAttempts)
    assert.ok(response.ok(), JSON.stringify(body))
    if (createMode === 'lose-once') {
      createMode = 'normal'
      return route.abort('failed')
    }
    tasks.push({ ...request, id: body.id })
    await save('creation.json', { tasks })
    return route.fulfill({ response })
  })
  await page.goto(server.resolvedUrls.local[0] + '#board')
  const field = (id) => page.getByTestId(id)
  const open = async () => {
    if (await field('board-detail-dialog').count()) {
      await field('board-close-detail').click()
      await field('board-detail-dialog').waitFor({ state: 'hidden' })
    }
    await field('board-create-task').click()
    await field('board-create-form').waitFor()
  }
  const submit = async () => {
    await field('board-create-save').click()
    await field('board-create-form').waitFor({ state: 'hidden' })
  }
  const screenshot = (name) => page.screenshot({ path: resolve(output, name), fullPage: true })
  const original = '为工程自动化平台实现任务看板的新建任务表单。\n目标描述和验收标准支持多行输入，AI优化结果先预览，由用户明确采用。'
  const criteria = '目标描述保留换行\n建议未经采用时保持用户原文\n创建后可重新读取任务且没有启动执行'
  await open()
  await field('board-create-column').selectOption('ready')
  await field('board-new-title').fill('真实 AI 优化后创建待执行任务')
  const assertIncompleteReady = async (missingField) => {
    const before = creationAttempts.length
    if (await field('board-create-save').isEnabled()) await field('board-create-save').click()
    assert.equal(creationAttempts.length, before, 'Incomplete ready draft must not reach creation API')
    assert.equal(await field(missingField).evaluate((node) => node.validity.valueMissing), true)
  }
  await assertIncompleteReady('board-new-goal')
  await field('board-new-goal').fill(original)
  await assertIncompleteReady('board-new-criteria')
  await field('board-new-criteria').fill(criteria)
  assert.equal(await field('board-create-save').isEnabled(), true)
  await screenshot('form-1440.png')
  await page.setViewportSize({ width: 390, height: 844 })
  await screenshot('form-390.png')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No horizontal document overflow')
  const optimizedResponse = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/ai/task-description/optimizations/'), { timeout: 75_000 })
  await field('board-optimize-goal').click()
  const response = await optimizedResponse
  const suggestion = await response.json()
  await save('real-optimization.json', { boundary: 'real configured provider, exactly one POST', status: response.status(), request: response.request().postDataJSON(), suggestion })
  assert.equal(response.status(), 200)
  assert.ok(suggestion.text?.trim())
  assert.ok(suggestion.model)
  assert.ok(suggestion.connectionId)
  await field('board-goal-suggestion').waitFor()
  assert.equal(await field('board-new-goal').inputValue(), original, 'Suggestion is not automatically adopted')
  await save('real-optimization-drafts.json', { original, beforeAdoption: await field('board-new-goal').inputValue(), suggestion: suggestion.text })
  await screenshot('optimization-preview-390.png')
  await field('board-goal-adopt').click()
  assert.equal(await field('board-new-goal').inputValue(), suggestion.text)
  await save('real-optimization-drafts.json', { original, beforeAdoption: original, afterAdoption: await field('board-new-goal').inputValue(), suggestion: suggestion.text })
  await submit()

  // Genuine committed write with a client-side lost response, followed by identical retry.
  await open()
  await field('board-create-column').selectOption('ready')
  await field('board-new-title').fill('响应丢失后按原请求重试')
  await field('board-new-goal').fill('保留同一个创建请求\n重试不会重复创建')
  await field('board-new-criteria').fill('实库仅一条任务\n没有Run')
  createMode = 'lose-once'
  await field('board-create-save').click()
  await expect.poll(() => creationAttempts.at(-1)?.response?.title).toBe('响应丢失后按原请求重试')
  await field('board-create-note').waitFor()
  await expect(field('board-create-save')).toBeEnabled()
  const lost = creationAttempts.at(-1)
  assert.ok(lost.response?.id, 'First write reached backend before client response loss')
  assert.equal(await field('board-new-title').inputValue(), lost.request.title)
  assert.equal(await field('board-new-goal').inputValue(), lost.request.goal)
  assert.equal(await field('board-new-title').isDisabled(), true, 'Uncertain write locks payload')
  await screenshot('lost-response-390.png')
  await submit()
  const retry = creationAttempts.at(-1)
  assert.deepEqual(retry.request, lost.request)
  assert.equal(retry.response.id, lost.response.id)

  // A definitive 4xx preserves an editable draft and allows a corrected, fresh request identity.
  await open()
  await field('board-create-column').selectOption('planned')
  await field('board-new-title').fill('明确失败后保留可修改草稿')
  await field('board-new-goal').fill('')
  await field('board-new-criteria').fill('')
  createMode = 'reject-once'
  await field('board-create-save').click()
  await field('board-create-note').waitFor()
  await expect(field('board-new-title')).toBeEnabled()
  assert.equal(await field('board-new-title').inputValue(), '明确失败后保留可修改草稿')
  const rejected = creationAttempts.at(-1)
  await field('board-new-title').fill('已修正的待规划任务允许空目标')
  await submit()
  assert.notEqual(creationAttempts.at(-1).request.requestId, rejected.request.requestId)
  assert.equal(tasks.at(-1).goal, '')

  const readback = []
  for (const task of tasks) {
    const response = await page.request.get(`${host.backend}/api/board/tasks/${task.id}?projectId=${encodeURIComponent(host.project)}`)
    assert.equal(response.status(), 200)
    const current = await response.json()
    for (const key of ['title', 'goal', 'acceptanceCriteria', 'column']) assert.equal(current[key], task[key])
    assert.equal(current.executionActive, false)
    readback.push(current)
  }
  await save('http-readback.json', readback)
  await page.setViewportSize({ width: 1440, height: 1000 })
  await screenshot('created-1440.png')

  // Fault-only phases: never invoke the provider. Stale results must not overwrite user drafts.
  await open()
  await field('board-new-title').fill('故障段草稿保护')
  await field('board-new-goal').fill('故障段原文')
  for (const phase of ['draft-drift', 'explicit-cancel', 'close']) {
    optimizationMode = phase
    const requestSeen = page.waitForRequest((request) => request.method() === 'POST' && request.url().includes('/ai/task-description/optimizations/'))
    await field('board-optimize-goal').click()
    const request = await requestSeen
    // Wait for the route handler to register its gate before initiating cancellation.
    await expect.poll(() => pendingMock?.id).toBe(request.url().split('/').at(-1))
    const deleted = page.waitForResponse((response) => response.request().method() === 'DELETE' && response.url() === request.url())
    if (phase === 'draft-drift') await field('board-new-goal').fill('用户修改后的多行草稿\n必须保留')
    if (phase === 'explicit-cancel') await field('board-optimize-cancel').click()
    if (phase === 'close') await field('board-create-close').click()
    assert.equal((await deleted).status(), 204)
    await expect.poll(() => pendingMock === null).toBe(true)
    if (phase === 'close') {
      // Close opens the existing unsaved confirmation; preserve the draft by canceling it.
      await page.keyboard.press('Escape')
      await field('board-create-form').waitFor()
    }
    assert.equal(await field('board-new-goal').inputValue(), '用户修改后的多行草稿\n必须保留')
    assert.equal(await field('board-goal-suggestion').count(), 0)
    await screenshot(`fault-${phase}.png`)
  }
  assert.equal(realOptimizationCalls, 1)
  assert.deepEqual(pageErrors, [])
  await save('validation.json', {
    productionApp: true, route: '#board', widths: [1440, 390], realOptimizationCalls,
    suggestionRequiresAdoption: true, multilineCriteriaPreserved: true, readyRequirements: true,
    responseLossAfterRealCommit: true, identicalRequestAndTaskOnRetry: true,
    definitive4xxDraftEditableAndNewRequest: true, plannedAllowsEmptyGoal: true,
    mockFaultPhases: ['draft-drift', 'explicit-cancel', 'close'],
    cancellationDelete204BeforeLateResponse: true, pageErrors, tasks: tasks.map((task) => task.id),
  })
} catch (error) {
  await save('failure.json', { message: String(error), stack: error.stack, realOptimizationCalls, creationAttempts, faults, pageErrors, http })
  if (page && !page.isClosed()) {
    await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {})
    await writeFile(resolve(output, 'failure.txt'), await page.locator('body').innerText()).catch(() => {})
  }
  throw error
} finally {
  if (pendingMock && page && !page.isClosed()) {
    const tombstone = await page.request.delete(`${host.backend}/api/ai/task-description/optimizations/${pendingMock.id}`).catch(() => null)
    if (tombstone?.status() === 204) pendingMock?.release()
  }
  await save('http.json', http)
  await browser?.close()
  await new Promise((done, reject) => server.httpServer.close((error) => error ? reject(error) : done()))
}
