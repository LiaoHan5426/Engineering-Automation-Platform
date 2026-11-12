import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

// Run from frontend/. Uses an installed Playwright and a real Chromium executable.
const require = createRequire(resolve('package.json'))
const { createServer } = await import(
  pathToFileURL(resolve(dirname(require.resolve('vite-plus/package.json')), 'dist/index.js')).href
)
const { default: vue } = await import(pathToFileURL(require.resolve('@vitejs/plugin-vue')).href)
const { default: tailwindcss } = await import(
  pathToFileURL(require.resolve('@tailwindcss/vite')).href
)
const { chromium } = loadPlaywright()
const backend = process.env.EAP_LIVE_API || 'http://127.0.0.1:52025'
const mock = process.env.EAP_MOCK_API || 'http://127.0.0.1:53200'
const out = resolve('apps/web/__tests__/browser/artifacts/product-workspaces')
await mkdir(out, { recursive: true })
const routes = [
  'chat',
  'scenes',
  'expert-catalog',
  'experts',
  'model-settings',
  'appearance',
  'skills',
  'plugins',
  'rules',
  'knowledge',
  'databases',
  'capabilities',
  'board',
  'sql',
  'builder-alpha',
  'builder-beta',
]
const evidence = {
  backend,
  mock,
  engine: 'real Chromium',
  pages: [],
  checks: [],
  errors: [],
  warnings: [],
  writes: [],
}
const tag = 'qa-product-' + Date.now()
const cleanup = []
const servers = []
let browser, page
async function api(path, method = 'GET', data) {
  const response = await fetch(backend + '/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
  })
  assert(response.ok, method + ' ' + path + ': ' + response.status)
  return response.status === 204 ? null : response.json().catch(() => null)
}
async function settle() {
  if (!new URL(page.url()).hash.startsWith('#builder-')) await page.waitForLoadState('networkidle')
  await page.evaluate(async () => {
    await Promise.allSettled(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    )
  })
}
async function shot(name) {
  await settle()
  await page.screenshot({ path: resolve(out, name + '.png') })
}
async function go(origin, route) {
  await page.goto(origin + '#' + route)
  await page.locator('main').waitFor()
  await settle()
}
const dialog = () => page.locator('.eap-dialog[role=dialog]').last()
async function closeDialog() {
  await dialog().getByRole('button', { name: '关闭', exact: true }).click()
  await settle()
}
async function confirm() {
  await page.locator('.eap-confirm__actions button').first().click()
  await settle()
}
async function check(name, work) {
  const only = process.argv.find((argument) => argument.startsWith('--only='))?.slice(7)
  if (only && !name.includes(only)) return
  await work()
  evidence.checks.push({ name, passed: true })
  process.stdout.write(name + ': passed\n')
}
async function confirmDelete(path) {
  const [deleted] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api' + path &&
        response.request().method() === 'DELETE',
    ),
    confirm(),
  ])
  assert(deleted.ok())
  await settle()
}

try {
  for (const [port, target] of [
    [5174, backend],
    [5175, mock],
  ]) {
    const server = await createServer({
      configFile: false,
      root: resolve('apps/web'),
      cacheDir: resolve('../backend/target/frontend-product-consolidation/vite-cache-' + port),
      plugins: [vue(), tailwindcss()],
      define: {
        'import.meta.env.VITE_API_URL': JSON.stringify('/api'),
        'import.meta.env.VITE_API_SCOPE': JSON.stringify(target + '/api'),
      },
      server: {
        host: '127.0.0.1',
        port,
        strictPort: true,
        proxy: { '/api': { target, changeOrigin: true } },
      },
    })
    await server.listen()
    servers.push(server)
  }
  const origin = servers[0].resolvedUrls.local[0]
  browser = await chromium.launch({
    executablePath:
      process.env.EAP_CHROMIUM ||
      'C:/Users/LH/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe',
    headless: true,
  })
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  page.setDefaultTimeout(15000)
  page.on('pageerror', (error) => evidence.errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('intlify'))
      evidence.warnings.push(message.text())
  })
  for (const width of process.argv.includes('--interactions') ? [] : [1440, 390]) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
    for (const route of routes) {
      await go(origin, route)
      if (route.startsWith('builder')) {
        await page.locator('.gjs-editor').first().waitFor({ state: 'attached', timeout: 30000 })
        await page.waitForFunction(() =>
          [...document.querySelectorAll('[data-testid=grapes-status]')].some(
            (node) => node.checkVisibility() && node.textContent.includes('已挂载'),
          ),
        )
      }
      await shot(route + '-' + width)
      const metrics = await page.evaluate(() => ({
        width: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        dialogs: document.querySelectorAll('[role=dialog]').length,
        forms: [...document.querySelectorAll('main form')].filter((node) => node.checkVisibility())
          .length,
      }))
      assert(metrics.scrollWidth <= width + 1, route + ' has document overflow at ' + width)
      evidence.pages.push({ route, ...metrics, screenshot: route + '-' + width + '.png' })
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  await check('real-rule-list-detail-trial-copy-dirty-save-delete', async () => {
    await go(origin, 'rules')
    assert.equal(await page.locator('.rule-summary').count(), 0)
    await page.getByRole('button', { name: /^SQL 结构反模式规则包/ }).click()
    await settle()
    assert.equal(await page.locator('.rule-summary').count(), 22)
    await page.getByTestId('rule-open-0').click()
    assert(await dialog().isVisible())
    await shot('rule-detail')
    await closeDialog()
    await page.getByRole('tab', { name: 'SQL 试算', exact: true }).click()
    await page.locator('#dry-sql').fill('SELECT * FROM users')
    await page.getByRole('button', { name: '试算', exact: true }).click()
    await page.locator('.dry-result').waitFor()
    await shot('rule-trial')
    await page.getByRole('tab', { name: '事实词表', exact: true }).click()
    await page.locator('.fact-group').first().waitFor()
    await page.getByRole('button', { name: '复制为自定义', exact: true }).click()
    await page.getByLabel('新规则包标识').fill(tag)
    const created = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/rule-packs') && response.request().method() === 'POST',
    )
    await dialog().getByRole('button', { name: '创建', exact: true }).click()
    assert((await created).ok())
    cleanup.push(['/rule-packs/' + tag])
    evidence.writes.push({ type: 'rule-pack', id: tag })
    await page.getByTestId('rule-open-0').waitFor()
    await page.getByTestId('rule-open-0').click()
    const title = dialog().getByLabel('标题', { exact: true })
    const original = await title.inputValue()
    await title.fill(tag + ' draft')
    await closeDialog()
    await page.getByTestId('rule-back').click()
    await page.locator('[data-confirm-cancel]').click()
    assert(await page.getByTestId('rule-back').isVisible())
    await page.getByRole('button', { name: '放弃修改', exact: true }).click()
    await page.getByTestId('rule-open-0').click()
    assert.equal(await dialog().getByLabel('标题', { exact: true }).inputValue(), original)
    await dialog()
      .getByLabel('标题', { exact: true })
      .fill(tag + ' saved')
    await closeDialog()
    await page.getByRole('button', { name: '保存草稿', exact: true }).click()
    await settle()
    const saved = await api('/rule-packs/' + tag)
    assert.equal(JSON.parse(saved.manifest).rules[0].title, tag + ' saved')
    await page.getByRole('button', { name: '删除', exact: true }).click()
    await confirmDelete('/rule-packs/' + tag)
    assert(!(await api('/rule-packs')).items.some((item) => item.id === tag))
    cleanup.pop()
  })
  await check('real-database-modal-tabs-save-discard-readback-delete', async () => {
    await go(origin, 'databases')
    await page.getByRole('button', { name: '＋ 新建资料', exact: true }).click()
    await dialog().getByLabel('资料名称', { exact: true }).fill(tag)
    await dialog().getByRole('tab', { name: '表结构', exact: true }).click()
    await dialog().getByRole('button', { name: '＋ 添加表', exact: true }).click()
    await dialog().getByLabel('表名', { exact: true }).fill('qa_table')
    await dialog().getByRole('button', { name: '＋ 添加字段', exact: true }).click()
    await dialog().getByLabel('字段名称', { exact: true }).fill('id')
    await dialog().getByRole('button', { name: '保存资料', exact: true }).click()
    await settle()
    const saved = (await api('/databases')).items.find((item) => item.label === tag)
    assert(saved)
    cleanup.push(['/databases/' + saved.id])
    evidence.writes.push({ type: 'database-profile', id: saved.id })
    await dialog().getByRole('tab', { name: '基本信息', exact: true }).click()
    await dialog()
      .getByLabel('资料名称', { exact: true })
      .fill(tag + ' unsaved')
    await dialog().getByRole('button', { name: '放弃修改', exact: true }).click()
    assert.equal(await dialog().getByLabel('资料名称', { exact: true }).inputValue(), tag)
    await dialog()
      .getByLabel('资料名称', { exact: true })
      .fill(tag + ' second draft')
    await closeDialog()
    await page.locator('[data-confirm-cancel]').click()
    assert.equal(
      await dialog().getByLabel('资料名称', { exact: true }).inputValue(),
      tag + ' second draft',
    )
    await dialog().getByRole('button', { name: '放弃修改', exact: true }).click()
    await shot('database-editor')
    await dialog().getByRole('button', { name: '删除资料', exact: true }).click()
    await confirmDelete('/databases/' + saved.id)
    assert(!(await api('/databases')).items.some((item) => item.id === saved.id))
    cleanup.pop()
  })
  await check('real-knowledge-create-document-read-draft-cancel-delete', async () => {
    await go(origin, 'knowledge')
    await page.locator('main').getByRole('button', { name: '＋ 新建', exact: true }).click()
    await dialog().getByLabel('名称', { exact: true }).fill(tag)
    await dialog().getByRole('button', { name: '创建', exact: true }).click()
    await settle()
    const saved = (await api('/knowledge')).items.find((item) => item.name === tag)
    assert(saved)
    cleanup.push(['/knowledge/' + saved.id])
    evidence.writes.push({ type: 'knowledge-base', id: saved.id })
    await page.getByRole('button', { name: '＋ 录入文档', exact: true }).click()
    await dialog().getByLabel('标题', { exact: true }).fill(tag)
    await dialog().getByLabel('正文', { exact: true }).fill('Product workspace verification text.')
    await dialog().getByRole('button', { name: '保存文档', exact: true }).click()
    await settle()
    await page.locator('.document-list').getByRole('button').first().click()
    await shot('knowledge-document')
    await closeDialog()
    await page.getByRole('button', { name: '＋ 录入文档', exact: true }).click()
    await dialog().getByLabel('标题', { exact: true }).fill('unsaved draft')
    await closeDialog()
    await page.locator('[data-confirm-cancel]').click()
    assert.equal(await dialog().getByLabel('标题', { exact: true }).inputValue(), 'unsaved draft')
    await closeDialog()
    await confirm()
    await page.getByRole('button', { name: '删除知识库', exact: true }).click()
    await confirmDelete('/knowledge/' + saved.id)
    assert(!(await api('/knowledge')).items.some((item) => item.id === saved.id))
    cleanup.pop()
  })
  await check('real-capability-diagnostics-cli-mcp-forms', async () => {
    await go(origin, 'capabilities')
    assert.equal(await page.getByTestId('data-layout-panel').count(), 0)
    await page.getByTestId('open-capability-diagnostics').click()
    await shot('capability-diagnostics')
    await dialog().getByRole('tab', { name: '可信工具', exact: true }).click()
    await page.getByTestId('trusted-tools-panel').waitFor()
    await closeDialog()
    await page.getByTestId('open-git-checks').click()
    await page.getByTestId('git-checks-workspace').waitFor()
    await shot('git-checks')
    await page.getByRole('tab', { name: /^本地 CLI/ }).click()
    await page.getByRole('button', { name: '＋ 登记程序', exact: true }).click()
    assert(await dialog().isVisible())
    await closeDialog()
    await page.getByRole('tab', { name: 'MCP 工具', exact: true }).click()
    await page
      .getByRole('button', { name: /登记.*服务器/ })
      .first()
      .click()
    assert(await dialog().isVisible())
    await closeDialog()
  })
  await check('real-plugin-detail-explicit-check-and-ui-disable-restore', async () => {
    await go(origin, 'plugins')
    assert.equal(await page.getByTestId('plugin-check-project').count(), 0)
    await page.getByTestId('plugin-details-board').click()
    await page.getByTestId('plugin-check-project').fill(tag)
    await page.getByTestId('plugin-check-dependencies').click()
    await settle()
    await shot('plugin-runtime')
    assert((await dialog().innerText()).includes('Task/Run 状态可读取'))
    await closeDialog()
    await page.getByTestId('plugin-toggle-board').click()
    await confirm()
    assert((await page.getByTestId('plugin-runtime-board').innerText()).includes('停用'))
    await page.getByTestId('plugin-toggle-board').click()
  })
  await check('real-model-and-expert-editor-navigation', async () => {
    await go(origin, 'model-settings')
    await page.getByRole('button', { name: '新增连接', exact: true }).click()
    assert(await dialog().isVisible())
    await shot('model-connection')
    await closeDialog()
    await go(origin, 'experts')
    await page.getByTestId('expert-card-sql-expert').click()
    await page.getByTestId('expert-edit').click()
    await shot('expert-editor')
  })
  await check('isolated-mock-skill-file-preview-confirm-save-read-activate', async () => {
    await go(servers[1].resolvedUrls.local[0], 'skills')
    await page.getByTestId('skill-import').click()
    await page
      .getByTestId('skill-file')
      .locator('input')
      .setInputFiles({
        name: 'SKILL.md',
        mimeType: 'text/markdown',
        buffer: Buffer.from(
          '---\nname: mock-review\ndescription: Safe mock review fixture\n---\nReview changes and verify tests. This is simulated guidance.\n',
        ),
      })
    await page.getByTestId('skill-source').fill('Browser verification (simulated)')
    await page.getByTestId('skill-preview').click()
    await page.getByTestId('skill-preview-result').waitFor()
    assert(await page.getByTestId('skill-save').isDisabled())
    await page.getByTestId('skill-confirm').check()
    await shot('mock-skill-confirm')
    await page.getByTestId('skill-save').click()
    await settle()
    await page.getByTestId('skill-detail-mock-review-1.0.0').click()
    await page.getByTestId('skill-detail-result').waitFor()
    await closeDialog()
    await page.getByTestId('skill-activate-mock-review-1.0.0').click()
    await settle()
    await page.getByTestId('skill-activate-mock-review-1.0.0').filter({ hasText: '停用' }).waitFor()
  })
  await check('narrow-dialog-keyboard-focus-and-unsaved-draft', async () => {
    await page.setViewportSize({ width: 390, height: 844 })
    await go(origin, 'rules')
    await page.getByRole('button', { name: /^SQL 结构反模式规则包/ }).click()
    await page.getByTestId('rule-open-0').click()
    const box = await dialog().boundingBox()
    assert(box && box.x >= 0 && box.x + box.width <= 391)
    for (let index = 0; index < 8; index++) {
      await page.keyboard.press('Tab')
      assert(await dialog().evaluate((node) => node.contains(document.activeElement)))
    }
    await shot('rule-dialog-390')
    await page.keyboard.press('Escape')
    await dialog().waitFor({ state: 'hidden' })
    await go(origin, 'databases')
    await page.getByRole('button', { name: '＋ 新建资料', exact: true }).click()
    await dialog().getByLabel('资料名称', { exact: true }).fill('unsaved narrow draft')
    await page.keyboard.press('Escape')
    await page.locator('.eap-confirm').waitFor()
    await shot('database-unsaved-390')
    await page.locator('[data-confirm-cancel]').click()
    assert.equal(
      await dialog().getByLabel('资料名称', { exact: true }).inputValue(),
      'unsaved narrow draft',
    )
    await page.keyboard.press('Escape')
    await confirm()
    await dialog().waitFor({ state: 'hidden' })
    await go(origin, 'skills')
    await page.getByTestId('skill-import').click()
    await page.getByTestId('skill-raw').fill('Retained local draft')
    await shot('skill-import-390')
    await page.keyboard.press('Escape')
    await page.getByTestId('skill-import').click()
    assert.equal(await page.getByTestId('skill-raw').inputValue(), 'Retained local draft')
    await closeDialog()
  })
  assert.deepEqual(evidence.errors, [])
  assert.deepEqual(evidence.warnings, [])
  evidence.passed = true
} catch (error) {
  evidence.passed = false
  evidence.failure = String(error.stack || error)
  if (page) await page.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {})
  process.exitCode = 1
  process.stderr.write(String(error.stack || error) + '\n')
} finally {
  evidence.cleanup = []
  for (const [path] of cleanup.reverse()) {
    try {
      await api(path, 'DELETE')
      evidence.cleanup.push({ path, deleted: true })
    } catch (error) {
      evidence.cleanup.push({ path, deleted: false, error: String(error) })
    }
  }
  await browser?.close()
  for (const server of servers.reverse()) await server.close()
  const partial = process.argv.includes('--interactions')
  const suffix =
    process.argv.find((argument) => argument.startsWith('--only='))?.slice(7) || 'interactions'
  await writeFile(
    resolve(out, partial ? 'result-partial-' + suffix + '.json' : 'result.json'),
    JSON.stringify(evidence, null, 2),
  )
}
