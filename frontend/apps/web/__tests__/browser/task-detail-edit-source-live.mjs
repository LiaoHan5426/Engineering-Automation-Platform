import { exerciseDetailEdit } from './task-detail-edit-live.mjs'
import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdir, readFile, realpath, symlink, writeFile, lstat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const [mode, input] = process.argv.slice(2)
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2))
const digest = value => createHash('sha256').update(value).digest('hex')
const paths = ['frontend/src/TaskList.vue', 'frontend/src/task-list.css']
const title = '可筛选任务列表与只读详情'
async function api(backend, path, body) {
  const response = await fetch(backend + '/api' + path, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(30000),
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await response.json()
  assert.equal(response.status, 200, path + ': ' + JSON.stringify(data).slice(0, 2500))
  return data
}
async function prepare(workspace) {
  const project = resolve(workspace, 'frontend'), src = resolve(project, 'src')
  await mkdir(src, { recursive: true })
  const require = createRequire(resolve('package.json'))
  const dependencies = { vue: require('vue/package.json').version }
  const devDependencies = Object.fromEntries(['@vitejs/plugin-vue', 'vite-plus', 'vue-tsc', 'typescript'].map(name => [name, require(name + '/package.json').version]))
  devDependencies.vite = 'npm:@voidzero-dev/vite-plus-core@' + require('vite/package.json').version
  await save(resolve(project, 'package.json'), { name: 'task-list-source-fixture', private: true, type: 'module', dependencies, devDependencies,
    scripts: { typecheck: 'vue-tsc --noEmit', test: 'vp test run', build: 'vp build' } })
  await save(resolve(project, 'tsconfig.json'), { compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true,
    allowImportingTsExtensions: true, skipLibCheck: true, types: ['vite/client'] }, include: ['src/**/*.ts', 'src/**/*.vue'] })
  await writeFile(resolve(project, 'vite.config.ts'), "import { defineConfig } from 'vite-plus'\nimport vue from '@vitejs/plugin-vue'\nexport default defineConfig({ plugins: [vue()] })\n")
  await writeFile(resolve(project, 'index.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>任务列表</title><div id="app"></div><script type="module" src="/src/main.ts"></script></html>')
  await writeFile(resolve(src, 'main.ts'), "import { createApp } from 'vue'\nimport TaskList from './TaskList.vue'\ncreateApp(TaskList).mount('#app')\n")
  await writeFile(resolve(src, 'TaskList.vue'), '<script setup lang="ts">\nimport "./task-list.css"\n</script>\n<template><main><h1>任务列表待交付</h1></main></template>\n')
  await writeFile(resolve(src, 'task-list.css'), 'body { margin: 0; }\n')
  await mkdir(resolve(project, '__tests__'), { recursive: true })
  await writeFile(resolve(project, '__tests__/host.test.ts'), `import { expect, it } from 'vite-plus/test'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import TaskList from '../src/TaskList.vue'
it('renders the delivered task list and accessible filter controls without a server', async () => {
  const html = await renderToString(createSSRApp(TaskList))
  expect(html).toContain('可筛选任务列表与只读详情')
  expect(html).toContain('task-list-preview')
  expect(html).toContain('清空筛选')
  expect(html).toContain('查看详情：')
  expect(html).toContain('<select')
})
`)
  await writeFile(resolve(workspace, '.gitignore'), 'node_modules/\ndist/\n*.tsbuildinfo\n')
  const modules = resolve(project, 'node_modules')
  await mkdir(modules, { recursive: true })
  for (const name of [...Object.keys(dependencies), ...Object.keys(devDependencies)]) {
    await mkdir(dirname(resolve(modules, name)), { recursive: true })
    await symlink(await realpath(dirname(require.resolve(name + '/package.json'))), resolve(modules, name), process.platform === 'win32' ? 'junction' : 'dir')
  }
  await symlink(await realpath(resolve('node_modules/.bin')), resolve(modules, '.bin'), process.platform === 'win32' ? 'junction' : 'dir')
  assert.equal((await lstat(modules)).isSymbolicLink(), false)
  // This disposable fixture alone needs a Git baseline for production source verification.
  const git = args => execFileSync('git', args, { cwd: workspace, stdio: 'inherit', timeout: 30000 })
  git(['init', '-q']); git(['add', '.'])
  git(['-c', 'user.name=EAP Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '-qm', 'Isolated task-list baseline'])
  await save(resolve(dirname(workspace), 'prepare.json'), { workspace, paths, physicalNodeModules: true, installedPackages: false })
}
async function deliver(manifest) {
  const { backend, workspace, task, proposal, provider, design, taskTitle } = await json(manifest), out = dirname(manifest)
  const require = createRequire(resolve('package.json'))
  const { createServer, preview } = await import(pathToFileURL(resolve(dirname(require.resolve('vite-plus/package.json')), 'dist/index.js')).href)
  const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href)
  const { default: tailwind } = await import(pathToFileURL(require.resolve('@tailwindcss/vite')).href)
  const server = await createServer({ configFile: false, root: resolve('apps/web'), cacheDir: resolve(out, 'vite-cache'), plugins: [vue(), tailwind()],
    define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api'), 'import.meta.env.VITE_API_SCOPE': JSON.stringify(backend + '/api') },
    server: { host: '127.0.0.1', port: 5208, strictPort: true, proxy: { '/api': { target: backend, changeOrigin: true } } } })
  let browser, built, page, result
  const errors = []
  await save(resolve(out, 'validation.json'), { status: 'RUNNING', provider, proposalId: proposal.id })
  try {
    await server.listen()
    const { chromium } = loadPlaywright()
    browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(15000)
    page.on('pageerror', error => errors.push(error.message))
    const projectId = task.projectId, path = '/board/tasks/' + task.taskId, scope = '?projectId=' + encodeURIComponent(projectId)
    const candidate = path + '/code-proposals/' + proposal.id
    const get = route => api(backend, route + scope), post = (route, body) => api(backend, route, { projectId, ...body })
    await page.addInitScript(projectId => {
      localStorage.setItem('eap.local-projects.v1', JSON.stringify([{ id: projectId, label: '任务列表源码交付', intendedPath: '' }]))
      localStorage.setItem('eap.selected-project.v1', projectId)
    }, projectId)
    await page.goto(server.resolvedUrls.local[0] + '#board')
    const openTask = () => page.getByRole('button').filter({ hasText: taskTitle }).first().click()
    await openTask(); await page.getByTestId('board-tab-code').click(); await page.getByTestId('board-code-refresh').click(); await page.getByTestId('board-code-open').click()
    await page.getByTestId('evidence-panel').waitFor(); assert.equal(await page.getByTestId('evidence-file').count(), 2)
    await page.screenshot({ path: resolve(out, 'candidate-review.png') })
    const apply = page.getByTestId('proposal-apply'); assert.equal(await apply.isDisabled(), true)
    await page.getByTestId('proposal-application').getByRole('checkbox').check()
    const applied = page.waitForResponse(response => response.url().endsWith(candidate + '/apply'))
    await apply.click(); assert.equal((await applied).status(), 200)
    const state = await get(candidate); assert.equal(state.status, 'APPLIED'); assert.deepEqual(state.result.written, paths)
    for (const file of proposal.files) assert.equal(await readFile(resolve(workspace, file.path), 'utf8'), file.content)
    const runs = path + '/runs', started = await post(runs, { revision: task.revision, requestId: randomUUID(), workspacePath: workspace }), runId = started.execution.id
    const waitFor = async (load, pending) => {
      for (let index = 0; index < 100; index++) { const value = await load(); if (!pending(value)) return value; await new Promise(done => setTimeout(done, 500)) }
      assert.fail('Timed out waiting for durable operation')
    }
    const run = await waitFor(async () => (await get(runs)).items.find(row => row.execution.id === runId), row => !row || ['QUEUED', 'RUNNING'].includes(row.execution.status))
    assert.equal(run.execution.status, 'SUCCEEDED', JSON.stringify(run).slice(-3000))
    const runPath = runs + '/' + runId, plan = await post(runPath + '/verification/plan', { workspacePath: workspace })
    await post(runPath + '/verification', { workspacePath: workspace, planHash: plan.planHash })
    const { record: verification } = await waitFor(() => get(runPath + '/verification'), ({ record }) => !record || ['QUEUED', 'RUNNING'].includes(record.status))
    await save(resolve(out, 'verification.json'), verification)
    assert.equal(verification.status, 'PASSED', JSON.stringify(verification).slice(-6000))
    assert.deepEqual(verification.checks.map(check => [check.id, check.status, check.processTreeCleanup]), [['typecheck', 'PASSED', true], ['test', 'PASSED', true], ['build', 'PASSED', true]])
    assert.deepEqual(verification.plan.source, verification.sourceAfter)
    for (const file of proposal.files) assert.equal(verification.sourceAfter.files.find(entry => entry.path === file.path).contentHash, digest(file.content))
    built = await preview({ configFile: false, root: resolve(workspace, 'frontend'), preview: { host: '127.0.0.1', port: 5209, strictPort: true, proxy: { '/api': { target: backend, changeOrigin: true } } } })
    result = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); result.setDefaultTimeout(15000)
    result.on('pageerror', error => errors.push(error.message))
    // Attach the network guard before navigation, including startup requests.
    const apiRequests = []
    result.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiRequests.push(request.url()) })
    await result.goto(built.resolvedUrls.local[0])
    const lists = [], walk = node => { if (node.kind === 'task-list') lists.push(node); node.children.forEach(walk) }
    walk(JSON.parse(design.body).schema.root); assert.equal(lists.length, 1)
    const interactions = await exerciseDetailEdit(result, result.getByTestId('task-list-preview'), lists[0].props.items, out, { faults: false, primitives: false })
    await result.reload(); await result.getByRole('button', { name: '查看详情：' + lists[0].props.items[0].name, exact: true }).click(); await result.getByTestId('task-edit-open').click(); assert.equal(await result.getByTestId('task-edit-goal').inputValue(), lists[0].props.items[0].goal); await result.getByTestId('task-edit-cancel').click()
    assert(apiRequests.every(url => /\/api\/ai\/task-detail\/optimizations\//.test(url)), JSON.stringify(apiRequests))
    await page.reload(); await openTask(); await page.getByTestId('board-tab-runs').click(); await page.getByTestId('board-run-verification').click(); await page.getByTestId('verification-delivery').click()
    await page.getByTestId('delivery-load-candidates').click(); await page.getByTestId('delivery-select-candidate').click()
    assert.equal(await page.getByTestId('delivery-paths').inputValue(), paths.join('\n'))
    await page.getByTestId('delivery-note-input').fill('真实模型双字段编辑交付；保存取消、必填边界与真实AI、窄屏已独立验证。')
    const submitted = page.waitForResponse(response => response.url().endsWith(runPath + '/delivery') && response.request().method() === 'POST')
    await page.getByTestId('delivery-submit').click()
    await page.getByRole('dialog', { name: '确认采集外部 / 人工源码修改', exact: true }).getByRole('button', { name: '提交源码证据', exact: true }).click()
    assert.equal((await submitted).status(), 200)
    const { record: delivery } = await get(runPath + '/delivery')
    assert.equal(delivery.source, 'CHAT_APPLIED_PREBOUND'); assert.equal(delivery.decision, null)
    assert.deepEqual(delivery.files.map(file => [file.path, file.afterHash]), proposal.files.map(file => [file.path, digest(file.content)]))
    await page.getByTestId('delivery-preview-url').fill(built.resolvedUrls.local[0]); await page.getByTestId('delivery-compare-prototype').click()
    const viewer = page.getByTestId('prototype-version-viewer')
    const savedList = viewer.getByTestId('task-list-preview')
    await savedList.getByRole('heading', { name: lists[0].props.label || '任务列表', level: 1, exact: true }).waitFor()
    assert.equal(await savedList.locator('li[data-task-id]').count(), lists[0].props.items.length)
    for (const item of lists[0].props.items) await savedList.getByRole('button', { name: '查看详情：' + item.name, exact: true }).waitFor()
    await page.screenshot({ path: resolve(out, 'source-prototype-comparison.png') })
    await viewer.locator('[data-eap-dialog-close]').click()
    await page.getByTestId('delivery-criteria').check(); await page.getByTestId('delivery-preview-url').fill(built.resolvedUrls.local[0])
    const popup = page.waitForEvent('popup'); await page.getByTestId('delivery-open-preview').click()
    const previewTab = await popup; await previewTab.getByRole('heading', { name: title, level: 1, exact: true }).waitFor(); await previewTab.close()
    await page.getByTestId('delivery-preview').check(); await page.getByTestId('delivery-comment').fill('Technical decision by isolated Chromium fixture; no human user acceptance.')
    const decided = page.waitForResponse(response => response.url().endsWith(runPath + '/delivery/decision'))
    await page.getByTestId('delivery-accept').click()
    await page.getByRole('dialog', { name: '确认人工接受此交付', exact: true }).getByRole('button', { name: '接受交付', exact: true }).click()
    assert.equal((await decided).status(), 200); assert.equal((await get(runPath + '/delivery')).record.decision.decision, 'ACCEPT')
    await page.reload(); await openTask(); await page.getByTestId('board-tab-runs').click(); await page.getByTestId('board-run-delivery').click()
    assert.equal(await page.getByTestId('delivery-recorded-preview').getAttribute('href'), built.resolvedUrls.local[0]); assert.equal(await page.getByTestId('delivery-accept').count(), 0)
    assert.deepEqual(errors, [])
    assert.equal((await api(backend, '/prototype-versions/' + design.id)).body, design.body)
    await save(resolve(out, 'delivery.json'), (await get(runPath + '/delivery')).record)
    await save(resolve(out, 'validation.json'), { status: 'PASSED', provider, proposalId: proposal.id, prototypeVersionId: design.id, runId, interactions, checks: verification.checks, decision: 'technical ACCEPT; no user acceptance', errors })
  } catch (error) {
    await save(resolve(out, 'validation.json'), { status: 'FAILED', provider, proposalId: proposal.id, error: String(error), stack: error.stack, errors })
    for (const [name, tab] of [['source', result], ['delivery', page]]) if (tab && !tab.isClosed()) {
      await tab.screenshot({ path: resolve(out, name + '-failure.png'), fullPage: true }).catch(() => {})
      await writeFile(resolve(out, name + '-failure.txt'), await tab.locator('body').innerText()).catch(() => {})
    }
    throw error
  } finally {
    try { await browser?.close() } finally {
      try { if (built) await new Promise((done, reject) => built.httpServer.close(error => error ? reject(error) : done())) }
      finally { await server.close() }
    }
  }
}
if (mode === 'prepare') await prepare(input)
else if (mode === 'deliver') await deliver(input)
else throw new Error('Unknown task-list source delivery phase: ' + mode)
