import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const manifest = process.argv[2]
const { backend } = JSON.parse(await readFile(manifest, 'utf8'))
const output = dirname(manifest)
const require = createRequire(resolve('package.json'))
const { createServer } = await import(pathToFileURL(resolve(dirname(require.resolve('vite-plus/package.json')), 'dist/index.js')).href)
const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href)
const { default: tailwind } = await import(pathToFileURL(require.resolve('@tailwindcss/vite')).href)
const { chromium } = loadPlaywright()
const server = await createServer({
  configFile: false, root: resolve('apps/web'), cacheDir: resolve(output, 'vite-cache'),
  plugins: [vue(), tailwind()],
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api'), 'import.meta.env.VITE_API_SCOPE': JSON.stringify(backend + '/api') },
  server: { host: '127.0.0.1', port: 5206, strictPort: true, proxy: { '/api': { target: backend, changeOrigin: true } } },
})
const evidence = { samplePreview: false, realPublication: true, checks: [], errors: [], mutations: [] }
let browser, page
try {
  await server.listen()
  const base = server.resolvedUrls.local[0]
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(15000)
  page.on('pageerror', error => evidence.errors.push(error.message))
  page.on('request', request => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) evidence.mutations.push({ method: request.method(), path: new URL(request.url()).pathname })
  })
  const ready = () => page.waitForFunction(() => document.querySelector('[data-testid=grapes-canvas]')?.getAttribute('data-mode') === 'ready')
  const scaffold = page.getByTestId('grapes-scaffold')
  await page.goto(base + '#builder-alpha')
  await ready()
  await scaffold.getByTestId('grapes-new').click()
  await scaffold.getByTestId('grapes-title').fill('可筛选任务列表与只读详情')
  await scaffold.getByTestId('grapes-add-task-list').click()
  const itemsField = scaffold.getByTestId('grapes-field-items')
  await itemsField.waitFor()
  const items = JSON.parse(await itemsField.inputValue())
  assert.equal(items.length, 6)
  items[0].goal += '\n浏览器编辑并保存的目标说明。'
  await itemsField.fill(JSON.stringify(items, null, 2))
  await scaffold.getByTestId('grapes-save').click()
  await page.reload()
  await ready()
  await scaffold.getByTestId('grapes-preview').click()
  let preview = scaffold.getByTestId('semantic-preview')
  const checkList = async (scope, width) => {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    const list = scope.getByTestId('task-list-preview')
    const keyword = list.getByLabel('任务名称', { exact: true })
    const status = list.getByLabel('任务状态', { exact: true })
    const count = list.getByTestId('task-list-count')
    await list.waitFor()
    await list.getByRole('button', { name: '清空筛选', exact: true }).click()
    await count.getByText(/6/).waitFor()
    await keyword.fill(' api ')
    await status.selectOption('running')
    await count.getByText(/1/).waitFor()
    const row = items.find(item => item.name.toLowerCase().includes('api') && item.status === 'running')
    assert(row)
    const opener = list.getByRole('button', { name: '查看详情：' + row.name, exact: true })
    await opener.click()
    const dialog = page.getByRole('dialog', { name: '任务详情', exact: true })
    await dialog.waitFor()
    await dialog.getByText(row.goal, { exact: true }).waitFor()
    await dialog.getByText(row.acceptanceCriteria, { exact: true }).waitFor()
    assert.equal(await dialog.locator('input,textarea,select').count(), 0)
    assert(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1))
    await page.screenshot({ path: resolve(output, `task-list-detail-${width}.png`) })
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert(await opener.evaluate(node => node === document.activeElement))
    assert.equal(await keyword.inputValue(), ' api ')
    assert.equal(await status.inputValue(), 'running')
    await keyword.fill('没有对应任务的名称')
    await list.getByText('没有匹配的任务', { exact: true }).waitFor()
    await list.getByRole('button', { name: '重置筛选', exact: true }).click()
    assert.equal(await keyword.inputValue(), '')
    assert.equal(await status.inputValue(), 'all')
    assert(await list.evaluate(node => node.scrollWidth <= node.clientWidth + 1))
    const last = list.getByRole('button', { name: '查看详情：' + items.at(-1).name, exact: true })
    await last.scrollIntoViewIfNeeded()
    await last.click()
    await dialog.getByText(items.at(-1).goal, { exact: true }).waitFor()
    await dialog.getByRole('button', { name: '关闭详情', exact: true }).last().click()
    await dialog.waitFor({ state: 'hidden' })
    assert(await last.evaluate(node => node === document.activeElement))
    await keyword.scrollIntoViewIfNeeded()
    await page.screenshot({ path: resolve(output, `task-list-preview-${width}.png`) })
    evidence.checks.push(`${width}: name/status intersection, count, empty/reset, correct readonly details, Escape/close/focus, retained filters, reachable final row and no overflow`)
  }
  await checkList(preview, 1440)
  await checkList(preview, 390)
  assert.deepEqual(evidence.mutations, [])
  evidence.checks.push('actual editor records saved and reopened; all preview interactions make no HTTP writes')
  await page.setViewportSize({ width: 1440, height: 1000 })
  const published = page.waitForResponse(response => new URL(response.url()).pathname === '/api/prototype-versions' && response.request().method() === 'POST')
  await scaffold.getByTestId('grapes-publish').click()
  const response = await published
  assert.equal(response.status(), 200, await response.text())
  const version = await response.json()
  const body = JSON.parse(version.body)
  const requestedBody = JSON.parse(response.request().postDataJSON().body)
  assert.deepEqual(body, requestedBody)
  await writeFile(resolve(output, 'expected-publication.json'), JSON.stringify(requestedBody, null, 2))
  const nodes = []
  const walk = node => { if (node.kind === 'task-list') nodes.push(node); node.children.forEach(walk) }
  walk(body.schema.root)
  assert.equal(nodes.length, 1)
  assert.deepEqual(nodes[0].props.items, items)
  assert(Object.keys(body.schema.grapesProject).length > 0)
  await writeFile(resolve(output, 'published-version.json'), JSON.stringify(version, null, 2))
  const opened = page.getByTestId('version-preview')
  await opened.waitFor()
  await checkList(opened, 390)
  const reloaded = await page.request.get(new URL('/api/prototype-versions/' + version.id, base).href)
  assert.equal(reloaded.status(), 200)
  assert.equal((await reloaded.json()).body, version.body)
  await page.getByTestId('prototype-create-task').click()
  const taskDialog = page.getByRole('dialog', { name: '从此版本创建任务', exact: true })
  await taskDialog.getByTestId('prototype-task-title').fill('实现可筛选任务列表与详情')
  const taskResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/board/tasks/from-prototype' && response.request().method() === 'POST')
  await taskDialog.getByTestId('prototype-task-save').click()
  const created = await taskResponse
  assert.equal(created.status(), 200, await created.text())
  const task = await created.json()
  assert.equal(task.prototypeVersionId, version.id)
  assert.equal(task.column, 'planned')
  evidence.versionId = version.id
  evidence.taskId = task.id
  evidence.checks.push('one immutable published semantic/Grapes version retains exact edited records; version preview never mutates stored body; explicitly linked planned task only')
  assert.deepEqual(evidence.errors, [])
  evidence.passed = true
} catch (error) {
  evidence.passed = false
  evidence.failure = String(error)
  await page?.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {})
  throw error
} finally {
  await writeFile(resolve(output, 'validation.json'), JSON.stringify(evidence, null, 2))
  try { await browser?.close() } finally { await server.close() }
}
