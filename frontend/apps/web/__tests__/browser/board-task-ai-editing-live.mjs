import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile, rename } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Java owns Boot, the current V1 schema and SQL checkpoints. Preview only a previously built real App.
const manifest = resolve(process.argv[2])
const output = dirname(manifest)
const host = JSON.parse(await readFile(manifest, 'utf8'))
const save = (name, value) => writeFile(resolve(output, name), JSON.stringify(value, null, 2))
const require = createRequire(resolve('package.json'))
const { preview } = await import(pathToFileURL(resolve(dirname(require.resolve('vite-plus/package.json')), 'dist/index.js')).href)
const { chromium, expect } = loadPlaywright()
const server = await preview({ configFile: false, root: resolve('apps/web'), preview: {
  host: '127.0.0.1', port: 5204, strictPort: true, proxy: { '/api': { target: host.backend, changeOrigin: true } },
} })
let browser, page, pendingMock
let optimizationMode = 'real', realOptimizationCalls = 0
const http = [], faults = [], checks = [], pageErrors = [], updates = [], layouts = []
const optimizationPath = '**/api/ai/task-description/optimizations/*'
const taskUrl = (id = host.task.id) => `${host.backend}/api/board/tasks/${id}`
async function check(name, actual, expected) {
  checks.push({ name, actual, expected, passed: JSON.stringify(actual) === JSON.stringify(expected) })
  await save('checks.json', checks)
  assert.deepEqual(actual, expected, name)
}
async function checkpoint(stage) {
  const temporary = resolve(output, 'checkpoint-request.tmp')
  await writeFile(temporary, JSON.stringify({ stage, id: host.task.id }))
  await rename(temporary, resolve(output, 'checkpoint-request.json'))
  let result
  await expect.poll(async () => {
    try { result = JSON.parse(await readFile(resolve(output, 'checkpoint-response.json'), 'utf8')); return result.stage }
    catch { return '' }
  }, { timeout: 15_000 }).toBe(stage)
  return result.row
}
try {
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(12_000)
  const field = (id) => page.getByTestId(id)
  const screenshot = (name) => page.screenshot({ path: resolve(output, name), fullPage: true })
  const readTask = async (id = host.task.id) => {
    const response = await page.request.get(`${taskUrl(id)}?projectId=${encodeURIComponent(host.project)}`)
    await check(`GET ${id} status`, response.status(), 200)
    return response.json()
  }
  const draft = async () => ({ goal: await field('task-goal').inputValue(), acceptanceCriteria: await field('task-criteria').inputValue(),
    notes: await field('task-notes').inputValue(), priority: await field('task-priority').inputValue() })
  const open = async (task = host.task) => {
    await page.locator('.board-card').filter({ hasText: task.title }).click()
    await field('board-detail-dialog').waitFor()
    await field('board-tab-preparation').click()
    await field('task-goal').waitFor()
  }
  const close = async () => {
    await field('board-close-detail').click()
    await field('board-detail-dialog').waitFor({ state: 'hidden' })
  }
  const layout = async (width) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    await field('task-goal').scrollIntoViewIfNeeded()
    const goal = await field('task-goal').boundingBox()
    await field('board-save-fields').scrollIntoViewIfNeeded()
    const saveButton = await field('board-save-fields').boundingBox()
    const geometry = await page.evaluate(() => ({ width: innerWidth, height: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      scrollers: [...document.querySelectorAll('[data-testid="board-detail-dialog"] *')]
        .filter((node) => node.scrollHeight > node.clientHeight && ['auto', 'scroll'].includes(getComputedStyle(node).overflowY))
        .map((node) => ({ tag: node.tagName, clientHeight: node.clientHeight, scrollHeight: node.scrollHeight, scrollTop: node.scrollTop })),
    }))
    layouts.push({ width, goal, saveButton, ...geometry })
    await save('layout.json', layouts)
    await check(`layout ${width} no horizontal overflow`, geometry.documentWidth <= width, true)
    await check(`layout ${width} save reachable`, !!saveButton && saveButton.x >= 0 && saveButton.x + saveButton.width <= width + 1 && saveButton.y >= 0 && saveButton.y + saveButton.height <= geometry.height + 1, true)
    await screenshot(`detail-${width}.png`)
    await field('task-goal').scrollIntoViewIfNeeded()
  }
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('response', (response) => {
    if (response.url().includes('/api/')) http.push({ method: response.request().method(), url: response.url(), status: response.status() })
  })
  await page.addInitScript(({ project }) => {
    localStorage.setItem('eap.locale', 'zh-CN')
    localStorage.setItem('eap.local-projects.v1', JSON.stringify([{ id: project, label: '已有任务优化验收', intendedPath: '' }]))
    localStorage.setItem('eap.selected-project.v1', project)
  }, { project: host.project })
  await page.route('**/api/board/tasks/*', async (route) => {
    if (route.request().method() !== 'POST') return route.continue()
    const response = await route.fetch()
    updates.push({ url: route.request().url(), request: route.request().postDataJSON(), status: response.status(), response: await response.json() })
    await save('update-requests.json', updates)
    await route.fulfill({ response })
  })
  // Explicit transport fault injection only. Every DELETE still reaches the real cancellation endpoint.
  await page.route(optimizationPath, async (route) => {
    const request = route.request(), id = request.url().split('/').at(-1)
    if (request.method() === 'DELETE') {
      const response = await route.fetch()
      faults.push({ phase: optimizationMode, id, deleteStatus: response.status() })
      await save('faults.json', faults)
      await route.fulfill({ response })
      return
    }
    if (request.method() !== 'POST') return route.continue()
    if (optimizationMode === 'real') {
      realOptimizationCalls++
      await check('exactly one real provider POST', realOptimizationCalls, 1)
      return route.continue()
    }
    let release, done
    const gate = new Promise((resolve) => { release = resolve })
    const completed = new Promise((resolve) => { done = resolve })
    const phase = optimizationMode
    pendingMock = { id, release, completed }
    faults.push({ phase, id, boundary: 'explicit mocked late response, no provider call', request: request.postDataJSON() })
    await save('faults.json', faults)
    await gate
    try {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        text: 'MOCK LATE RESULT MUST NOT BE ADOPTED', model: 'mock-only', connectionId: 'explicit-fault-fixture',
      }) })
    } catch (error) { faults.push({ phase, id, abortedTransport: String(error) }) }
    faults.push({ phase, id, lateResponseReleased: true })
    pendingMock = null
    await save('faults.json', faults)
    done()
  })
  await page.goto(server.resolvedUrls.local[0] + '#board')
  await open()
  const original = { goal: host.task.goal, acceptanceCriteria: host.task.acceptanceCriteria, notes: host.task.notes, priority: host.task.priority }
  await check('seed in real detail', await draft(), original)
  await layout(1440)
  await close()
  await open()
  await layout(390)
  const optimized = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().includes('/ai/task-description/optimizations/'), { timeout: 90_000 })
  await field('task-goal-optimize').click()
  const response = await optimized, suggestion = await response.json()
  await save('real-optimization.json', { boundary: 'real configured provider', status: response.status(), request: response.request().postDataJSON(), suggestion })
  await check('real optimization HTTP', response.status(), 200)
  await check('provider identity and nonempty suggestion', !!(suggestion.text?.trim() && suggestion.model && suggestion.connectionId), true)
  await field('task-goal-suggestion').waitFor()
  await check('suggestion requires explicit adoption', await draft(), original)
  await check('SQL before adoption goal', (await checkpoint('before-adoption')).goal, original.goal)
  await screenshot('suggestion-390.png')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await screenshot('suggestion-1440.png')
  await field('task-goal-adopt').click()
  const adopted = { ...original, goal: suggestion.text }
  await check('adoption changes only goal', await draft(), adopted)
  await check('SQL after adoption remains original', (await checkpoint('after-adoption')).goal, original.goal)
  await check('adoption issued no update', updates.length, 0)
  const saveFields = async () => {
    const response = page.waitForResponse((response) => response.request().method() === 'POST' && response.url().endsWith(`/api/board/tasks/${host.task.id}`))
    await field('board-save-fields').click()
    return response
  }
  await check('explicit original update succeeds', (await saveFields()).status(), 200)
  await expect(field('board-save-fields')).toBeDisabled()
  const saved = await readTask()
  await check('original update uses seed revision', updates.at(-1).request.revision, host.task.revision)
  await check('save increments revision', saved.revision, host.task.revision + 1)
  await check('SQL after explicit save goal', (await checkpoint('after-save')).goal, suggestion.text)
  await close()
  await open()
  await check('close/reopen saved fields', await draft(), adopted)
  await page.reload()
  if (!await field('board-detail-dialog').count()) await open()
  await field('task-goal').waitFor()
  await check('refresh saved fields', await draft(), adopted)

  // External HTTP updates use the real revision contract; the UI must preserve every local field on 409.
  let current = saved
  for (const resolution of ['keep-draft', 'use-latest']) {
    const local = { goal: `${suggestion.text}\n本地${resolution}`, acceptanceCriteria: `本地标准\n${resolution}`,
      notes: `本地备注\n${resolution}`, priority: 'p0' }
    await field('task-goal').fill(local.goal)
    await field('task-criteria').fill(local.acceptanceCriteria)
    await field('task-notes').fill(local.notes)
    await field('task-priority').selectOption(local.priority)
    const external = { projectId: host.project, revision: current.revision, goal: `外部目标\n${resolution}`,
      acceptanceCriteria: `外部标准\n${resolution}`, notes: `外部备注\n${resolution}`, priority: 'p2' }
    const response = await page.request.post(taskUrl(), { data: external })
    const latest = await response.json()
    await save(`external-${resolution}.json`, { request: external, status: response.status(), response: latest })
    await check(`external ${resolution} committed`, response.status(), 200)
    await check(`${resolution} real stale save`, (await saveFields()).status(), 409)
    await field('board-conflict').waitFor()
    await check(`${resolution} all local draft retained`, await draft(), local)
    for (const value of [latest.goal, latest.acceptanceCriteria, latest.notes, 'P2']) {
      await check(`${resolution} latest value visible: ${value}`, (await field('board-conflict').innerText()).includes(value), true)
    }
    await check(`${resolution} blocks unreviewed save`, await field('board-save-fields').isDisabled(), true)
    await screenshot(`conflict-${resolution}.png`)
    if (resolution === 'keep-draft') {
      await field('board-keep-draft').click()
      await check('keepDraft preserves all local fields', await draft(), local)
    } else {
      await field('board-use-latest').click()
      const latestDraft = { goal: latest.goal, acceptanceCriteria: latest.acceptanceCriteria, notes: latest.notes, priority: latest.priority }
      await check('useLatest explicitly replaces all fields', await draft(), latestDraft)
      await check('useLatest clean save disabled', await field('board-save-fields').isDisabled(), true)
      await field('task-notes').fill(latest.notes + '\n核对后补充')
    }
    const expected = await draft()
    await check(`${resolution} reviewed save`, (await saveFields()).status(), 200)
    await expect(field('board-save-fields')).toBeDisabled()
    await check(`${resolution} uses reviewed revision`, updates.at(-1).request.revision, latest.revision)
    current = await readTask()
    await check(`${resolution} committed fields`, { goal: current.goal, acceptanceCriteria: current.acceptanceCriteria, notes: current.notes, priority: current.priority }, expected)
  }
  await save('editing.json', current)
  await close()
  await open()
  await check('final reopen', await draft(), { goal: current.goal, acceptanceCriteria: current.acceptanceCriteria, notes: current.notes, priority: current.priority })
  await page.setViewportSize({ width: 390, height: 844 })

  // Each gate registers before UI cancellation, and releases only after same-UUID real DELETE 204.
  for (const phase of ['explicit-cancel', 'draft-drift', 'close', 'switch-task']) {
    optimizationMode = phase
    if (!await field('board-detail-dialog').count()) await open()
    const before = await draft()
    const seen = page.waitForRequest((request) => request.method() === 'POST' && request.url().includes('/ai/task-description/optimizations/'))
    await field('task-goal-optimize').click()
    const request = await seen, id = request.url().split('/').at(-1)
    await expect.poll(() => pendingMock?.id).toBe(id)
    const gate = pendingMock
    const deleted = page.waitForResponse((response) => response.request().method() === 'DELETE' && response.url() === request.url())
    let expected = before
    if (phase === 'explicit-cancel') await field('task-goal-cancel').click()
    if (phase === 'draft-drift') {
      expected = { ...before, goal: before.goal + '\n用户正在编辑的新草稿' }
      await field('task-goal').fill(expected.goal)
    }
    if (phase === 'close' || phase === 'switch-task') {
      await field('board-close-detail').click()
      const confirm = page.locator('.eap-confirm')
      if (await confirm.count()) await confirm.locator('button:not([data-confirm-cancel])').click()
      await field('board-detail-dialog').waitFor({ state: 'hidden' })
    }
    await check(`${phase} same UUID DELETE`, (await deleted).status(), 204)
    if (phase === 'switch-task') await open(host.other)
    gate.release()
    await gate.completed
    // A browser task turn ensures the released response has had an opportunity to update Vue.
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    if (phase === 'close') {
      await check('late result keeps dialog closed', await field('board-detail-dialog').count(), 0)
      await open()
      expected = { goal: current.goal, acceptanceCriteria: current.acceptanceCriteria, notes: current.notes, priority: current.priority }
    }
    if (phase === 'switch-task') expected = { goal: host.other.goal, acceptanceCriteria: host.other.acceptanceCriteria, notes: host.other.notes, priority: host.other.priority }
    await check(`${phase} late response leaves draft intact`, await draft(), expected)
    await check(`${phase} no suggestion remains`, await field('task-goal-suggestion').count(), 0)
    await screenshot(`fault-${phase}.png`)
  }
  await check('one real provider call total', realOptimizationCalls, 1)
  await check('no uncaught page errors', pageErrors, [])
  await check('two real conflicts', updates.filter((item) => item.status === 409).length, 2)
  await check('only three explicit successful UI saves', updates.filter((item) => item.status === 200).length, 3)
  await check('no run/execution HTTP writes', http.filter((item) => item.method !== 'GET' && /\/(runs|executions)(\/|\?|$)/.test(item.url)).length, 0)
  await save('validation.json', { passed: true, productionApp: true, route: '#board', widths: [1440, 390], realOptimizationCalls,
    sqlCheckpoints: ['before-adoption', 'after-adoption', 'after-save'], realConflicts: 2,
    resolutions: ['keepDraft', 'useLatest'], mockFaultPhases: ['explicit-cancel', 'draft-drift', 'close', 'switch-task'],
    cancellationDelete204BeforeRelease: true, pageErrors, checks })
} catch (error) {
  await save('validation.json', { passed: false, message: String(error), checks, realOptimizationCalls })
  await save('failure.json', { message: String(error), stack: error.stack, realOptimizationCalls, faults, pageErrors, http, updates })
  if (page && !page.isClosed()) {
    await page.screenshot({ path: resolve(output, 'failure.png'), fullPage: true }).catch(() => {})
    await writeFile(resolve(output, 'failure.txt'), await page.locator('body').innerText()).catch(() => {})
  }
  throw error
} finally {
  if (pendingMock && page && !page.isClosed()) {
    const deleted = await page.request.delete(`${host.backend}/api/ai/task-description/optimizations/${pendingMock.id}`).catch(() => null)
    if (deleted?.status() === 204) { const gate = pendingMock; gate.release(); await gate.completed }
  }
  await save('http.json', http)
  await browser?.close()
  await new Promise((done, reject) => server.httpServer.close((error) => error ? reject(error) : done()))
}
