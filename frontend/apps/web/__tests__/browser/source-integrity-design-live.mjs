import { exerciseDetailEdit } from './task-detail-edit-live.mjs'
import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const save = (out, name, value) => writeFile(resolve(out, name), JSON.stringify(value, null, 2))
async function run(manifest) {
  const { backend } = JSON.parse(await readFile(manifest, 'utf8')), out = dirname(manifest)
  const require = createRequire(resolve('package.json'))
  const { createServer } = await import(pathToFileURL(resolve(dirname(require.resolve('vite-plus/package.json')), 'dist/index.js')).href)
  const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href)
  const { default: tailwind } = await import(pathToFileURL(require.resolve('@tailwindcss/vite')).href)
  const server = await createServer({ configFile: false, root: resolve('apps/web'), cacheDir: resolve(out, 'vite-cache'), plugins: [vue(), tailwind()], define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api'), 'import.meta.env.VITE_API_SCOPE': JSON.stringify(backend + '/api') }, server: { host: '127.0.0.1', port: 5206, strictPort: true, proxy: { '/api': { target: backend, changeOrigin: true } } } })
  let browser, page; const errors = []
  try {
    await server.listen(); const { chromium } = loadPlaywright(); browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message))
    await page.goto(server.resolvedUrls.local[0] + '#builder-alpha')
    const ready = () => page.waitForFunction(() => document.querySelector('[data-testid=grapes-canvas]')?.getAttribute('data-mode') === 'ready')
    const scaffold = page.getByTestId('grapes-scaffold'); await ready(); await scaffold.getByTestId('grapes-new').click()
    await scaffold.getByTestId('grapes-title').fill('可筛选任务列表与只读详情'); await scaffold.getByTestId('grapes-add-task-list').click()
    const items = JSON.parse(await scaffold.getByTestId('grapes-field-items').inputValue())
    await scaffold.getByTestId('grapes-task-editable').check(); await scaffold.getByTestId('grapes-save').click(); await page.reload(); await ready()
    const published = page.waitForResponse(response => new URL(response.url()).pathname === '/api/prototype-versions' && response.request().method() === 'POST')
    await scaffold.getByTestId('grapes-publish').click(); const response = await published; assert.equal(response.status(), 200)
    const version = await response.json(), body = JSON.parse(version.body), nodes = []
    const walk = node => { if (node.kind === 'task-list') nodes.push(node); node.children.forEach(walk) }; walk(body.schema.root)
    assert.equal(nodes.length, 1); assert.equal(nodes[0].props.editable, true); assert.deepEqual(nodes[0].props.items, items)
    assert.deepEqual(body, JSON.parse(response.request().postDataJSON().body)); assert(Object.keys(body.schema.grapesProject).length > 0)
    await save(out, 'published-version.json', version); await save(out, 'expected-publication.json', body)
    const checks = await exerciseDetailEdit(page, page.getByTestId('version-preview'), items, out, { realAI: false })
    await page.getByTestId('prototype-create-task').click()
    const taskDialog = page.getByRole('dialog', { name: '从此版本创建任务', exact: true })
    await taskDialog.getByTestId('prototype-task-title').fill('实现双字段可编辑任务详情')
    const taskResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/board/tasks/from-prototype' && response.request().method() === 'POST')
    await taskDialog.getByTestId('prototype-task-save').click(); const created = await taskResponse; assert.equal(created.status(), 200)
    const task = await created.json(); assert.equal(task.prototypeVersionId, version.id); assert.equal(task.column, 'planned')
    await page.reload(); await ready(); await scaffold.getByTestId('grapes-preview').click()
    await scaffold.getByTestId('semantic-preview').getByRole('button', { name: '查看详情：' + items[0].name, exact: true }).click(); await page.getByTestId('task-edit-open').click()
    assert.equal(await page.getByTestId('task-edit-goal').inputValue(), items[0].goal); await page.getByTestId('task-edit-cancel').click()
    await page.getByRole('dialog', { name: '任务详情', exact: true }).getByRole('button', { name: '关闭详情', exact: true }).last().click()
    const readback = await page.request.get(backend + '/api/prototype-versions/' + version.id); assert.equal((await readback.json()).body, version.body)
    await save(out, 'readback.json', await readback.json())
    assert.deepEqual(errors, [])
    await save(out, 'validation.json', { passed: true, realOptimizationCalls: 0, versionId: version.id, taskId: task.id, checks, errors })
  } catch (error) { await save(out, 'validation.json', { passed: false, error: String(error), stack: error.stack, errors }); await page?.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {}); throw error }
  finally { await browser?.close(); await server.close() }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) await run(resolve(process.argv[2]))
