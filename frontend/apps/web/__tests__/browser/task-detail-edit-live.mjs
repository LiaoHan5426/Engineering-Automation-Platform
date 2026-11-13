import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const save = (out, name, value) => writeFile(resolve(out, name), JSON.stringify(value, null, 2))
// Shared behavioral contract for real semantic preview and independently generated/built code.
export async function exerciseDetailEdit(page, scope, items, out, { realAI = true, faults = true, primitives = true } = {}) {
  const { expect } = loadPlaywright(), checks = [], writes = [], faultLog = []
  let mode = 'real', gate, realCalls = 0
  const pattern = '**/api/ai/task-detail/optimizations/*'
  const field = id => page.getByTestId(id)
  const edit = () => field('task-edit-dialog')
  const read = async () => ({ goal: await field('task-edit-goal').inputValue(), acceptanceCriteria: await field('task-edit-acceptanceCriteria').inputValue() })
  const original = item => ({ goal: item.goal, acceptanceCriteria: item.acceptanceCriteria })
  let opener
  const open = async item => {
    opener = scope.getByRole('button', { name: '查看详情：' + item.name, exact: true })
    await opener.click()
    await field('task-edit-open').click(); await edit().waitFor()
  }
  const detail = () => page.getByRole('dialog', { name: '任务详情', exact: true })
  const closeDetail = async () => { await detail().getByRole('button', { name: '关闭详情', exact: true }).last().click(); await detail().waitFor({ state: 'hidden' }); await expect(opener).toBeFocused() }
  const confirm = () => page.locator('.eap-confirm')
  const discard = async () => { await confirm().getByRole('button', { name: '放弃更改', exact: true }).click(); await edit().waitFor({ state: 'hidden' }) }
  const continueEdit = async () => { await confirm().locator('[data-confirm-cancel]').click(); await edit().waitFor() }
  const onRequest = request => { if (!['GET','HEAD','OPTIONS'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) writes.push({ method: request.method(), path: new URL(request.url()).pathname }) }
  page.on('request', onRequest)
  await page.route(pattern, async route => {
    const request = route.request(), id = request.url().split('/').at(-1)
    if (request.method() === 'DELETE') { const response = await route.fetch(); faultLog.push({ mode, id, deleteStatus: response.status() }); return route.fulfill({ response }) }
    if (request.method() !== 'POST') return route.continue()
    if (mode === 'real') { realCalls++; return route.continue() }
    let release, done
    const wait = new Promise(resolve => { release = resolve }), completed = new Promise(resolve => { done = resolve })
    gate = { id, release, completed, url: request.url() }
    faultLog.push({ mode, id, boundary: 'EXPLICIT MOCK late-response injection; no provider call' })
    await wait
    try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ goal: 'MOCK LATE GOAL', acceptanceCriteria: 'MOCK LATE CRITERIA', connectionId: 'MOCK', model: 'MOCK' }) }) }
    catch (error) { faultLog.push({ mode, abortedTransport: String(error) }) }
    faultLog.push({ mode, id, released: true }); done()
  })
  try {
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      await open(items[0]); assert.deepEqual(await read(), original(items[0]))
      await expect(field('task-edit-goal')).toBeFocused()
      for (const key of ['goal', 'acceptanceCriteria']) {
        await field('task-edit-' + key).fill(' '); await expect(field('task-ai-optimize')).toBeDisabled(); await field('task-edit-save').click()
        await expect(field('task-edit-' + key)).toBeFocused(); await expect(field('task-edit-' + key)).toHaveAttribute('aria-invalid', 'true')
        await field('task-edit-' + key).fill('字'.repeat(2001)); assert.equal((await field('task-edit-' + key).inputValue()).length, 2001); await expect(field('task-ai-optimize')).toBeDisabled()
        await field('task-edit-save').click(); await expect(field('task-edit-' + key)).toHaveAttribute('aria-invalid', 'true')
        await field('task-edit-' + key).fill('字'.repeat(2000)); await field('task-edit-save').click(); await edit().waitFor({ state: 'hidden' })
        await detail().getByText('字'.repeat(2000), { exact: true }).waitFor()
        await field('task-edit-open').click(); await field('task-edit-' + key).fill(items[0][key]); await field('task-edit-save').click(); await field('task-edit-open').click()
      }
      for (const action of ['cancel', 'close', 'Escape']) {
        await field('task-edit-goal').fill(items[0].goal + ' 草稿')
        if (action === 'Escape') await page.keyboard.press('Escape')
        else if (action === 'close') await edit().locator('[data-eap-dialog-close]').click()
        else await field('task-edit-cancel').click()
        await confirm().waitFor(); await continueEdit(); assert.equal((await read()).goal, items[0].goal + ' 草稿')
        await field('task-edit-cancel').click(); await discard(); await field('task-edit-open').click()
        assert.deepEqual(await read(), original(items[0]))
      }
      await field('task-edit-goal').fill(items[0].goal + ' 同值还原'); await field('task-edit-goal').fill(items[0].goal)
      await field('task-edit-cancel').click(); await edit().waitFor({ state: 'hidden' }); assert.equal(await confirm().count(), 0)
      await field('task-edit-open').click()
      await field('task-edit-save').scrollIntoViewIfNeeded()
      const geometry = await edit().evaluate(node => ({ width: node.clientWidth, scrollWidth: node.scrollWidth, scrollers: [node, ...node.querySelectorAll('*')].filter(child => child.scrollHeight > child.clientHeight + 1 && ['auto','scroll'].includes(getComputedStyle(child).overflowY)).map(child => { child.scrollTop = 0; const start = child.scrollTop; child.scrollTop = child.scrollHeight; return { start, end: child.scrollTop, maximum: child.scrollHeight - child.clientHeight } }) }))
      assert(geometry.scrollWidth <= geometry.width + 1)
      for (const scroller of geometry.scrollers) assert(scroller.end > scroller.start && Math.abs(scroller.end - scroller.maximum) <= 1, 'Overflowing edit content must scroll to its end')
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      const ai = field('task-ai-optimize'), cancel = field('task-edit-cancel'), saveButton = field('task-edit-save')
      for (const control of [field('task-edit-goal'), field('task-edit-acceptanceCriteria'), ai, cancel, saveButton]) {
        await control.scrollIntoViewIfNeeded(); await expect(control).toBeVisible(); await expect(control).toBeEnabled()
        assert(await control.evaluate(node => { const box = node.getBoundingClientRect(); return box.x >= 0 && box.right <= innerWidth + 1 && box.y >= 0 && box.bottom <= innerHeight + 1 }), 'Every field and footer action must be reachable in viewport')
      }
      if (primitives) { await expect(ai).toHaveClass(/eap-button--ai/); await expect(saveButton).toHaveClass(/eap-button--success/) }
      const buttons = await Promise.all([ai,cancel,saveButton].map(button => button.evaluate(node => ({ text: node.textContent, background: getComputedStyle(node).backgroundColor, border: getComputedStyle(node).borderColor, box: node.getBoundingClientRect().toJSON() }))))
      assert(buttons.every(button => Math.abs(button.box.y - buttons[0].box.y) <= 2 && button.box.x >= 0 && button.box.x + button.box.width <= width + 1), 'Three footer actions remain in one row')
      assert(buttons[0].background !== buttons[1].background || buttons[0].border !== buttons[1].border, 'AI visual treatment must differ from Cancel')
      assert.notEqual(buttons[2].background, buttons[1].background, 'Save visual treatment must differ from Cancel')
      await saveButton.focus(); await page.keyboard.press('Tab'); assert(await edit().evaluate(node => node.contains(document.activeElement)))
      await save(out, 'layout-' + width + '.json', { geometry, buttons })
      await page.screenshot({ path: resolve(out, 'task-detail-edit-' + width + '.png') })
      if (width === 390) {
        await page.setViewportSize({ width: 390, height: 600 })
        const compact = await edit().evaluate(node => [node, ...node.querySelectorAll('*')].filter(child => child.scrollHeight > child.clientHeight + 1 && ['auto','scroll'].includes(getComputedStyle(child).overflowY)).map(child => { child.scrollTop = 0; const start = child.scrollTop; child.scrollTop = child.scrollHeight; return { start, end: child.scrollTop, maximum: child.scrollHeight - child.clientHeight } }))
        if (primitives) assert(compact.length > 0, 'Compact semantic preview exercises genuine overflow at 390x600')
        assert(compact.every(scroll => scroll.end > scroll.start && Math.abs(scroll.end - scroll.maximum) <= 1))
        for (const control of [field('task-edit-goal'), field('task-edit-acceptanceCriteria'), ai, cancel, saveButton]) {
          await control.scrollIntoViewIfNeeded(); assert(await control.evaluate(node => { const box = node.getBoundingClientRect(); return box.y >= 0 && box.bottom <= innerHeight + 1 }))
        }
        await save(out, 'layout-390-compact.json', compact); await page.screenshot({ path: resolve(out, 'task-detail-edit-390-compact.png') })
        await page.setViewportSize({ width: 390, height: 844 })
      }
      await field('task-edit-cancel').click(); await closeDetail()
      checks.push({ width, requiredBoth: true, limit2000And2001: true, cancelCloseEscapeContinueDiscard: true, revertClean: true, keyboard: true, noOverflow: true })
    }
    await open(items[0])
    if (realAI) {
      const pending = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/api/ai/task-detail/optimizations/'), { timeout: 90000 })
      await field('task-ai-optimize').click(); const response = await pending, suggestion = await response.json()
      await save(out, 'real-optimization.json', { boundary: 'REAL configured provider; no mocked response', status: response.status(), request: response.request().postDataJSON(), response: suggestion })
      assert.equal(response.status(), 200); assert.deepEqual(response.request().postDataJSON(), original(items[0]))
      for (const key of ['goal','acceptanceCriteria','connectionId','model']) assert(suggestion[key]?.trim(), key)
      await field('task-ai-adopt').waitFor(); assert.deepEqual(await read(), original(items[0]))
      assert.equal(await detail().count(), 0)
      await field('task-ai-adopt').click(); assert.deepEqual(await read(), { goal: suggestion.goal, acceptanceCriteria: suggestion.acceptanceCriteria })
      await field('task-edit-cancel').click(); await continueEdit()
      assert.deepEqual(await read(), { goal: suggestion.goal, acceptanceCriteria: suggestion.acceptanceCriteria })
      await field('task-edit-save').click()
      await detail().getByText(suggestion.goal, { exact: true }).waitFor(); await detail().getByText(suggestion.acceptanceCriteria, { exact: true }).waitFor()
      await closeDetail(); await open(items[0])
      assert.deepEqual(await read(), { goal: suggestion.goal, acceptanceCriteria: suggestion.acceptanceCriteria })
      await field('task-edit-goal').fill(items[0].goal); await field('task-edit-acceptanceCriteria').fill(items[0].acceptanceCriteria)
      await field('task-edit-save').click(); await field('task-edit-open').click()
    }
    if (faults) for (const phase of ['cancel', 'ABA', 'close']) {
      mode = phase
      const before = await read(), seen = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/api/ai/task-detail/optimizations/'))
      await field('task-ai-optimize').click(); const request = await seen, id = request.url().split('/').at(-1)
      await expect.poll(() => gate?.id).toBe(id); const held = gate
      const deleted = page.waitForResponse(response => response.request().method() === 'DELETE' && response.url() === request.url())
      if (phase === 'cancel') await field('task-ai-cancel').click()
      if (phase === 'ABA') { await field('task-edit-goal').fill(before.goal + ' B'); await field('task-edit-goal').fill(before.goal) }
      if (phase === 'close') await edit().locator('[data-eap-dialog-close]').click()
      assert.equal((await deleted).status(), 204); held.release(); await held.completed; gate = undefined
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      if (phase === 'close') { await edit().waitFor({ state: 'hidden' }); await field('task-edit-open').click() }
      assert.deepEqual(await read(), before); assert.equal(await field('task-ai-adopt').count(), 0)
    }
    await field('task-edit-goal').fill('本地内存目标'); await field('task-edit-acceptanceCriteria').fill('本地内存验收')
    await field('task-edit-save').click(); await detail().getByText('本地内存目标', { exact: true }).waitFor(); await closeDetail()
    await open(items[1]); assert.deepEqual(await read(), original(items[1])); await field('task-edit-cancel').click(); await closeDetail()
    const query = scope.getByLabel('任务名称', { exact: true })
    await query.fill('没有匹配的编辑记录'); await scope.getByRole('button', { name: '重置筛选', exact: true }).click()
    await open(items[0]); assert.deepEqual(await read(), { goal: '本地内存目标', acceptanceCriteria: '本地内存验收' }); await field('task-edit-cancel').click(); await closeDetail()
    assert.equal(realCalls, realAI ? 1 : 0)
    assert(writes.every(write => /^\/api\/ai\/task-detail\/optimizations\/[a-f0-9-]{36}$/.test(write.path)), JSON.stringify(writes))
    return checks
  } finally {
    if (gate) { const response = await page.request.delete(gate.url).catch(() => null); if (response?.status() === 204) { gate.release(); await gate.completed } }
    await save(out, 'faults.json', faultLog); await save(out, 'preview-writes.json', writes)
    page.off('request', onRequest); await page.unroute(pattern)
  }
}

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
    const checks = await exerciseDetailEdit(page, page.getByTestId('version-preview'), items, out)
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
    await save(out, 'validation.json', { passed: true, realOptimizationCalls: 1, versionId: version.id, taskId: task.id, checks, errors })
  } catch (error) { await save(out, 'validation.json', { passed: false, error: String(error), stack: error.stack, errors }); await page?.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {}); throw error }
  finally { await browser?.close(); await server.close() }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) await run(resolve(process.argv[2]))
