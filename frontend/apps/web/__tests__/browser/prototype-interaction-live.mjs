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
    'import.meta.env.VITE_API_SCOPE': JSON.stringify(backend + '/api'),
  },
  server: {
    host: '127.0.0.1',
    port: 5194,
    strictPort: true,
    proxy: { '/api': { target: backend, changeOrigin: true } },
  },
})
let browser, page
const evidence = { checks: [], errors: [], publications: 0 }
try {
  await server.listen()
  browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(15000)
  page.on('pageerror', (error) => evidence.errors.push(error.message))
  page.on('request', (request) => {
    if (
      request.method() === 'POST' &&
      new URL(request.url()).pathname === '/api/prototype-versions'
    )
      evidence.publications++
  })
  await page.goto(server.resolvedUrls.local[0] + '#builder-alpha')
  const scaffold = page.getByTestId('grapes-scaffold')
  await scaffold.getByTestId('grapes-new').waitFor()
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid=grapes-canvas]')?.getAttribute('data-mode') === 'ready',
  )
  await scaffold.getByTestId('grapes-new').click()
  await scaffold.getByTestId('grapes-title').fill('交互表单与说明弹窗')
  await scaffold.getByTestId('grapes-add-form').click()
  await scaffold.getByTestId('grapes-field-label').fill('开发任务')
  await scaffold.getByTestId('grapes-add-dialog').click()
  await scaffold.getByTestId('grapes-preview').click()
  const preview = scaffold.getByTestId('semantic-preview')
  await preview.getByRole('button', { name: '提交', exact: true }).waitFor()
  await preview.getByRole('button', { name: '提交', exact: true }).click()
  assert.equal(await preview.locator('[aria-invalid=true]').count(), 3)
  await preview.getByLabel('任务名称', { exact: true }).fill('完成初版')
  await preview.getByLabel('任务类别', { exact: true }).selectOption('功能开发')
  await preview.getByRole('checkbox', { name: '我已核对内容' }).check()
  await preview.getByRole('button', { name: '提交', exact: true }).click()
  await preview.getByText('预览提交完成，未发送数据。').waitFor()
  assert.equal(evidence.publications, 0)
  await preview.getByRole('button', { name: '重置', exact: true }).click()
  assert.equal(await preview.getByLabel('任务名称', { exact: true }).inputValue(), '')
  assert.equal(await preview.getByRole('checkbox').isChecked(), false)
  await preview.getByRole('button', { name: '查看说明', exact: true }).click()
  await page.getByRole('dialog', { name: '任务说明', exact: true }).waitFor()
  await page.getByRole('button', { name: '关闭说明', exact: true }).click()
  assert.equal(await page.getByRole('dialog', { name: '任务说明', exact: true }).count(), 0)
  evidence.checks.push(
    'actual Grapes editor adds and labels form/dialog; required validation, local submission, reset and dialog actions work without HTTP publication',
  )
  await scaffold.getByTestId('grapes-save').click()
  await page.reload()
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid=grapes-canvas]')?.getAttribute('data-mode') === 'ready',
  )
  await scaffold.getByTestId('grapes-preview').click()
  await preview.getByRole('button', { name: '提交', exact: true }).waitFor()
  assert.equal(await preview.getByLabel('任务名称', { exact: true }).inputValue(), '')
  await page.setViewportSize({ width: 390, height: 844 })
  await preview.getByRole('button', { name: '查看说明', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '任务说明', exact: true })
  await dialog.waitFor()
  assert.equal(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), true)
  await page.screenshot({ path: resolve(output, 'interactive-dialog-mobile.png') })
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  await page.setViewportSize({ width: 1440, height: 1000 })
  const posted = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/prototype-versions' &&
      response.request().method() === 'POST',
  )
  await scaffold.getByTestId('grapes-publish').click()
  const response = await posted
  assert.equal(response.status(), 200, await response.text())
  const version = await response.json()
  evidence.versionId = version.id
  evidence.hash = version.contentHash
  assert.equal(evidence.publications, 1)
  const opened = page.getByTestId('version-preview')
  await opened.waitFor()
  const saved = JSON.parse(version.body)
  const kinds = []
  const walk = (node) => {
    kinds.push(node.kind)
    node.children.forEach(walk)
  }
  walk(saved.schema.root)
  for (const kind of ['form', 'select', 'checkbox', 'dialog']) assert(kinds.includes(kind))
  await opened.getByRole('button', { name: '提交', exact: true }).click()
  assert.equal(await opened.locator('[aria-invalid=true]').count(), 3)
  await page.screenshot({ path: resolve(output, 'published-interactive-design.png') })
  const reloaded = await page.request.get(
    new URL('/api/prototype-versions/' + version.id, server.resolvedUrls.local[0]).href,
  )
  assert.equal((await reloaded.json()).body, version.body)
  await page.getByTestId('prototype-create-task').click()
  const taskDialog = page.getByRole('dialog', { name: '从此版本创建任务', exact: true })
  await taskDialog.getByTestId('prototype-task-title').fill('交互原型实现任务')
  let dropped = false
  let committedTask
  await page.route('**/api/board/tasks/from-prototype', async (intercept) => {
    if (dropped) return intercept.continue()
    dropped = true
    const committed = await intercept.fetch()
    assert.equal(committed.status(), 200, await committed.text())
    committedTask = await committed.json()
    await intercept.abort('connectionreset')
  })
  await taskDialog.getByTestId('prototype-task-save').click()
  await taskDialog
    .getByText('请求内容已固定。结果未确认时保留原请求；可明确核对，不另建任务。')
    .waitFor()
  await page
    .getByRole('button', { name: '核对原创建请求', exact: true })
    .waitFor({ state: 'visible' })
  await page.waitForFunction(
    () => !document.querySelector('[data-testid=prototype-task-save]')?.disabled,
  )
  assert.equal(await taskDialog.getByTestId('prototype-task-title').isDisabled(), true)
  const taskResponse = page.waitForResponse(
    (item) =>
      new URL(item.url()).pathname === '/api/board/tasks/from-prototype' &&
      item.request().method() === 'POST',
  )
  await taskDialog.getByTestId('prototype-task-save').click()
  const created = await taskResponse
  assert.equal(created.status(), 200, await created.text())
  const task = await created.json()
  assert.equal(task.id, committedTask.id)
  assert.equal(task.prototypeVersionId, version.id)
  assert.equal(task.column, 'planned')
  const originalRequest = created.request().postDataJSON()
  const replay = await page.request.post(
    new URL('/api/board/tasks/from-prototype', server.resolvedUrls.local[0]).href,
    { data: originalRequest },
  )
  assert.equal(replay.status(), 200)
  assert.equal((await replay.json()).id, task.id)
  const conflict = await page.request.post(
    new URL('/api/board/tasks/from-prototype', server.resolvedUrls.local[0]).href,
    { data: { ...originalRequest, title: 'different task' } },
  )
  assert.equal(conflict.status(), 409)
  await taskDialog.getByTestId('prototype-task-created').waitFor()
  await taskDialog.getByTestId('prototype-task-board').click()
  await page.getByRole('button').filter({ hasText: '交互原型实现任务' }).first().click()
  await page.getByTestId('board-tab-prototype').click()
  await page
    .getByTestId('board-prototype-current')
    .getByText(version.id, { exact: false })
    .waitFor()
  const ready = await page.request.post(
    new URL('/api/board/tasks/' + task.id, server.resolvedUrls.local[0]).href,
    { data: { projectId: task.projectId, revision: task.revision, column: 'ready' } },
  )
  assert.equal(ready.status(), 200)
  await page.reload()
  await page.getByRole('button').filter({ hasText: '交互原型实现任务' }).first().click()
  await page.getByTestId('board-prepare-code').click()
  const preparation = page.getByRole('dialog', { name: '准备实现', exact: true })
  await preparation.getByTestId('prepare-target').fill('frontend/Form.vue')
  await preparation.getByTestId('prepare-companions').fill('frontend/form.css\nfrontend/copy.json')
  await preparation.getByTestId('prepare-check').click()
  await preparation.getByTestId('prepare-result').waitFor()
  assert.equal(await preparation.getByTestId('prepare-result').locator('li').count(), 3)
  await preparation.getByText('新文件', { exact: true }).waitFor()
  await preparation.getByTestId('prepare-target').fill('frontend/Form.vue ')
  assert.equal(await preparation.getByTestId('prepare-adopt').isDisabled(), true)
  await preparation.getByTestId('prepare-target').fill('frontend/Form.vue')
  await preparation.getByTestId('prepare-check').click()
  await preparation.getByTestId('prepare-result').waitFor()
  await preparation.getByTestId('prepare-adopt').click()
  await page.getByTestId('adopt-board-draft').click()
  await page
    .getByRole('dialog', { name: '采用任务草稿并新建对话', exact: true })
    .getByRole('button', { name: '采用任务草稿并新建对话', exact: true })
    .click()
  await page.getByTestId('composer-task-binding').waitFor()
  assert.equal(await page.getByTestId('generation-target').inputValue(), 'frontend/Form.vue')
  assert.equal(
    await page.getByTestId('generation-component-paths').inputValue(),
    'frontend/form.css\nfrontend/copy.json',
  )
  await page.screenshot({ path: resolve(output, 'prepared-implementation.png') })
  evidence.checks.push(
    'Ready task checks exact existing/new source selection, invalidates stale preparation and explicitly adopts task/prototype/files together in Chat without generation',
  )
  evidence.taskId = task.id
  evidence.checks.push(
    'version creates an atomic planned Task with exact prototype reference; request replay returns same Task, changed payload conflicts, actual Board reopens linked version',
  )
  assert.equal(evidence.publications, 1)
  evidence.checks.push(
    'saved draft restores actual Grapes project; narrow dialog closes with Escape; server validates and persists one immutable interactive design, version preview state never changes stored content',
  )
  assert.deepEqual(evidence.errors, [])
  await writeFile(resolve(output, 'validation.json'), JSON.stringify(evidence, null, 2))
} catch (error) {
  await page?.screenshot({ path: resolve(output, 'failure.png') }).catch(() => {})
  await writeFile(resolve(output, 'failure.txt'), String(error))
  throw error
} finally {
  try {
    await browser?.close()
  } finally {
    await server.close()
  }
}
