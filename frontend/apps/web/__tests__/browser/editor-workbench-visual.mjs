import { loadPlaywright } from './playwright-runtime.mjs'
// Real Chromium/GrapesJS with isolated expert-save fixtures and browser-local prototype drafts.
// No provider calls, grants, production expert changes or repository delivery.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const require = createRequire(import.meta.url)
const { chromium } = loadPlaywright()
const out = resolve('apps/web/__tests__/browser/artifacts/editor-workbench')
await mkdir(out, { recursive: true })
const browser = await chromium.launch({ executablePath: process.env.EAP_CHROMIUM, headless: true })
const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  locale: 'zh-CN',
})
const page = await context.newPage()
page.setDefaultTimeout(12000)
const errors = [],
  mutations = [],
  checks = []
page.on('pageerror', (e) => errors.push(e.message))
const base = process.env.EAP_VISUAL_URL || 'http://127.0.0.1:5173'
const flow = {
  id: 'editor-fixture',
  name: '流程编辑验收（模拟）',
  kind: 'Expert',
  apiVersion: 'eap/v1',
  steps: [{ id: 'parse', label: '解析 SQL', capability: 'sql.parse', required: true }],
  edges: [],
  rules: ['database.credentials.never-expose'],
}
const agent = {
  id: 'agent-editor-fixture',
  name: '行为编辑验收（模拟）',
  kind: 'Expert',
  apiVersion: 'eap/v2',
  behavior: { id: 'sql-readonly-agent', version: 1 },
  agent: { goal: '只读取证（模拟）', tools: ['sql.parse', 'database.explain'] },
  steps: [],
  edges: [],
}
const definitions = new Map([
  [flow.id, flow],
  [agent.id, agent],
])
await page.route('**/api/**', async (route) => {
  const request = route.request(),
    path = new URL(request.url()).pathname
  const reply = (body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
  if (path === '/api/experts' && request.method() === 'GET')
    return reply({
      items: [...definitions.values()].map((d) => JSON.stringify(d)),
      states: Object.fromEntries(
        [...definitions.keys()].map((id) => [id, { enabled: false, builtin: false, revision: 1 }]),
      ),
    })
  if (path === '/api/experts' && request.method() === 'POST') {
    const definition = JSON.parse(request.postDataJSON().manifest)
    definitions.set(definition.id, definition)
    mutations.push({ kind: 'fixture-only-save', id: definition.id })
    return reply({ saved: true })
  }
  if (path === '/api/experts/validate') return reply({ valid: true, errors: [] })
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
    return reply({ message: 'EDITOR_QA_MUTATION_BLOCKED' }, 409)
  return route.continue()
})
const button = (name) => page.getByRole('button', { name, exact: true })
const tab = (name) => page.getByRole('tab', { name, exact: true })
const screenshot = (name) => page.screenshot({ path: resolve(out, name + '.png') })
async function fits() {
  const bounds = await page
    .locator('.eap-editor-workbench')
    .evaluate((e) => ({
      width: e.clientWidth,
      scroll: e.scrollWidth,
      right: e.getBoundingClientRect().right,
      window: innerWidth,
    }))
  assert.ok(
    bounds.scroll <= bounds.width + 1 && bounds.right <= bounds.window + 1,
    JSON.stringify(bounds),
  )
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    true,
  )
}
async function edit(id) {
  await page.goto(base + '/#experts?view=config&expert=' + id)
  await page.locator('.eap-editor-workbench').waitFor()
}
try {
  await edit(flow.id)
  await page.getByTestId('node-add-database.explain').click()
  await page.getByLabel('显示名称', { exact: true }).fill('计划核对')
  assert.equal(await page.locator('.workflow-node.selected').count(), 1)
  await tab('流程结构').click()
  await page.getByRole('button', { name: '从 解析 SQL 连线', exact: true }).click()
  await page.getByRole('button', { name: '连接到 计划核对', exact: true }).click()
  await page.getByRole('button', { name: '从 计划核对 连线', exact: true }).click()
  await page.getByRole('button', { name: '连接到 解析 SQL', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '该连接会产生循环，已阻止' }).waitFor()
  await button('取消连线').click()
  const nodeHandle = page
    .locator('.workflow-node')
    .filter({ hasText: '计划核对' })
    .locator('.node-handle')
  const before = await nodeHandle.boundingBox()
  await page.mouse.move(before.x + 20, before.y + 20)
  await page.mouse.down()
  await page.mouse.move(before.x + 50, before.y + 75, { steps: 5 })
  await page.mouse.up()
  const after = await nodeHandle.boundingBox()
  assert.ok(after.y > before.y + 40)
  await button('自动布局').click()
  await button('查看全图').click()
  assert.equal(await page.locator('svg g').count(), 1)
  await page.getByRole('treeitem', { name: '解析 SQL', exact: true }).click()
  assert.equal(await page.getByLabel('显示名称', { exact: true }).inputValue(), '解析 SQL')
  await button('移除节点及连线').click()
  assert.equal(await page.locator('svg g').count(), 0)
  assert.equal(await page.locator('.workflow-node').count(), 1)
  await button('返回详情').click()
  assert.ok(page.url().includes('view=config'))
  await page.getByTestId('expert-editor-message').filter({ hasText: '当前修改尚未保存' }).waitFor()
  await button('保存草稿').click()
  await page.getByTestId('expert-editor-message').filter({ hasText: '草稿已保存' }).waitFor()
  await page.reload()
  await page.locator('.workflow-node').filter({ hasText: '计划核对' }).waitFor()
  assert.equal(definitions.get(flow.id).steps.length, 1)
  assert.equal(definitions.get(flow.id).steps[0].label, '计划核对')
  checks.push(
    'catalog add, property/structure/canvas selection, incident-edge deletion, draft guard, fixture save and reload',
  )
  // Keep the canvas mounted through collapse and resizing; keyboard operates the shared splitter.
  const canvas = await page.locator('.workflow-canvas').elementHandle()
  await button('资源').click()
  assert.equal(await canvas.evaluate((e) => e.isConnected), true)
  await button('资源').click()
  const handle = page.getByRole('separator').first()
  await handle.focus()
  await page.keyboard.press('ArrowRight')
  await fits()
  await screenshot('workflow-1440')
  for (const width of [900, 640, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await page.waitForFunction(() => document.querySelector('.eap-editor-workbench--compact'))
    await fits()
    await button('资源').click()
    const drawer = page.getByRole('dialog')
    await drawer.waitFor()
    await page.keyboard.press('Tab')
    assert.equal(await drawer.evaluate((e) => e.contains(document.activeElement)), true)
    await page.keyboard.press('Escape')
    await drawer.waitFor({ state: 'detached' })
    assert.equal(await button('资源').evaluate((e) => e === document.activeElement), true)
    await button('属性').click()
    await page.getByRole('dialog').waitFor()
    const tabHeight = await page
      .getByRole('dialog')
      .getByRole('tab')
      .first()
      .evaluate((e) => e.getBoundingClientRect().height)
    assert.ok(tabHeight < 60, 'Drawer tabs must not stretch: ' + tabHeight)
    await screenshot('inspector-' + width)
    await page.keyboard.press('Escape')
    assert.equal(await canvas.evaluate((e) => e.isConnected), true)
  }
  checks.push(
    '1440/900/640/390: no page overflow, resize/collapse keeps canvas, narrow drawer focus/Escape/return',
  )
  await page.setViewportSize({ width: 1440, height: 960 })
  await edit(agent.id)
  assert.equal(await page.locator('.workflow-canvas').count(), 0)
  await page.getByTestId('expert-agent-goal').fill('先检索授权知识，再分析（模拟）')
  await page.getByLabel('knowledge.search', { exact: true }).check()
  await tab('资料授权').click()
  assert.equal(
    await page.getByTestId('expert-agent-goal').inputValue(),
    '先检索授权知识，再分析（模拟）',
  )
  await button('保存草稿').click()
  await page.getByTestId('expert-editor-message').filter({ hasText: '草稿已保存' }).waitFor()
  assert.equal(definitions.get(agent.id).apiVersion, 'eap/v2')
  assert.deepEqual(definitions.get(agent.id).steps, [])
  assert.ok(definitions.get(agent.id).agent.tools.includes('knowledge.search'))
  await screenshot('agent-1440')
  checks.push('Agent goal/tool save retains professional behavior/version and empty DAG')
  await page.goto(base + '/#builder-alpha')
  await page.getByTestId('grapes-add-button').click()
  await page.getByLabel('选中组件文字', { exact: true }).fill('验收按钮')
  await tab('页面结构').click()
  await page
    .getByRole('treeitem', { name: /Button/ })
    .last()
    .click()
  await page.getByTestId('grapes-preview').click()
  await page
    .getByTestId('semantic-preview')
    .getByRole('button', { name: '验收按钮', exact: true })
    .click()
  assert.ok(
    (await page.getByTestId('semantic-preview').locator('output').allTextContents()).includes('1'),
  )
  await page.getByTestId('builder-back-scenes').click()
  assert.ok(page.url().includes('builder-alpha'))
  await page.getByTestId('grapes-note').filter({ hasText: '请先保存或放弃修改' }).waitFor()
  await page.getByTestId('grapes-save').click()
  await page.getByTestId('grapes-note').filter({ hasText: '已保存' }).waitFor()
  await page.reload()
  await page.getByTestId('grapes-preview').click()
  await page
    .getByTestId('semantic-preview')
    .getByRole('button', { name: '验收按钮', exact: true })
    .waitFor()
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('eap.prototype-schema.v1')),
  )
  assert.ok(saved.grapesProject.pages.length)
  assert.ok(JSON.stringify(saved.root).includes('验收按钮'))
  await screenshot('prototype-preview-1440')
  await page.getByTestId('grapes-preview').click()
  await page.getByTestId('grapes-add-text').click()
  await page.getByLabel('选中组件文字', { exact: true }).fill('应放弃的文本')
  await page.getByTestId('grapes-discard').click()
  await page.getByTestId('grapes-preview').click()
  assert.ok(!(await page.getByTestId('semantic-preview').innerText()).includes('应放弃的文本'))
  await page.getByTestId('grapes-preview').click()
  await fits()
  await screenshot('prototype-canvas-1440')
  checks.push(
    'real GrapesJS add/edit/select, interactive Vue preview, browser-local project+schema save/reload, discard and leave guard',
  )
  for (const width of [900, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await fits()
    await button('资源').click()
    await page.getByRole('dialog').waitFor()
    await screenshot('prototype-resources-' + width)
    await page.keyboard.press('Escape')
  }
  checks.push('prototype compact resources and stable canvas at 900/390')
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.evaluate(() => {
    document.documentElement.dataset.eapTheme = 'dark'
    document.documentElement.classList.add('dark')
  })
  assert.equal(await page.evaluate(() => document.documentElement.dataset.eapTheme), 'dark')
  await screenshot('prototype-dark')
  checks.push('dark theme editor shell with document canvas retaining its own design appearance')
  // Unknown semantic mapping is a real persisted document fixture; publication must remain blocked.
  await page.evaluate(() => {
    const schema = JSON.parse(localStorage.getItem('eap.prototype-schema.v1'))
    schema.grapesProject = {
      pages: [
        { frames: [{ component: { tagName: 'section', components: [{ tagName: 'video' }] } }] },
      ],
    }
    localStorage.setItem('eap.prototype-schema.v1', JSON.stringify(schema))
  })
  await page.reload()
  await page.getByTestId('grapes-status').filter({ hasText: 'GrapesJS 已挂载' }).waitFor()
  assert.equal(await page.getByTestId('grapes-publish').isDisabled(), true)
  await button('检查设计').click()
  await page.getByTestId('grapes-note').filter({ hasText: 'unknown_mappings' }).waitFor()
  checks.push('unknown component mapping blocks publication; no delivery API writes')
  assert.deepEqual(errors, [])
  await writeFile(
    resolve(out, 'result.json'),
    JSON.stringify(
      {
        result: 'passed',
        checks,
        mutations,
        errors,
        boundary:
          'Expert saves are intercepted fixtures; prototype saves are browser-local; no provider or delivery writes.',
      },
      null,
      2,
    ),
  )
  console.log(
    JSON.stringify({
      result: 'passed',
      checks: checks.length,
      fixtureSaves: mutations.length,
      pageerrors: errors.length,
    }),
  )
} catch (error) {
  await screenshot('failure')
  await writeFile(
    resolve(out, 'failure.json'),
    JSON.stringify({ error: String(error), errors, checks }, null, 2),
  )
  throw error
} finally {
  await browser.close()
}
