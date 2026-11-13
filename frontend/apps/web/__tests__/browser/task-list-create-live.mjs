import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const save = (out, name, value) => writeFile(resolve(out, name), JSON.stringify(value, null, 2))

export async function exerciseTaskCreate(page, scope, items, out, { realAI = true, faults = true, primitives = true } = {}) {
  const { expect } = loadPlaywright(), writes = [], faultLog = [], checks = []
  const field = id => page.getByTestId(id), dialog = () => field('task-edit-dialog')
  const keys = ['name', 'goal', 'acceptanceCriteria'], input = key => field('task-edit-' + key)
  const read = async () => Object.fromEntries(await Promise.all(keys.map(async key => [key, await input(key).inputValue()])))
  const rows = () => scope.locator('li[data-task-id]'), open = async () => { await field('task-create-open').click(); await dialog().waitFor() }
  const fill = async (name = '本地新增任务') => { await input('name').fill(name); await input('goal').fill('新增任务的目标'); await input('acceptanceCriteria').fill('新增任务的验收标准') }
  const confirm = () => page.locator('.eap-confirm')
  const discard = async () => { await confirm().getByRole('button', { name: '放弃更改', exact: true }).click(); await dialog().waitFor({ state: 'hidden' }) }
  const closeDetail = async () => { await page.getByRole('dialog', { name: '任务详情', exact: true }).getByRole('button', { name: '关闭详情', exact: true }).last().click() }
  let mode = 'real', gate, realCalls = 0
  const pattern = '**/api/ai/task-detail/optimizations/*'
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
    faultLog.push({ mode, id, boundary: 'EXPLICIT MOCK held POST response; DELETE reaches real backend; no provider call' })
    await wait
    try { await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ goal: 'MOCK LATE GOAL', acceptanceCriteria: 'MOCK LATE CRITERIA', connectionId: 'MOCK', model: 'MOCK' }) }) }
    catch (error) { faultLog.push({ mode, abortedTransport: String(error) }) }
    faultLog.push({ mode, id, released: true }); done()
  })
  try {
    let initialCount = items.length
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 })
      await open(); await expect(input('name')).toBeFocused(); assert.deepEqual(await read(), { name: '', goal: '', acceptanceCriteria: '' })
      await expect(field('task-ai-optimize')).toBeDisabled()
      await field('task-edit-save').click(); await expect(input('name')).toHaveAttribute('aria-invalid', 'true'); await expect(input('name')).toBeFocused()
      await fill()
      for (const key of keys) {
        const original = await input(key).inputValue(), limit = key === 'name' ? 120 : 2000
        for (const invalid of [' ', '字'.repeat(limit + 1)]) {
          await input(key).fill(invalid); assert.equal((await input(key).inputValue()).length, invalid.length)
          if (key !== 'name') await expect(field('task-ai-optimize')).toBeDisabled()
          await field('task-edit-save').click()
          await expect(input(key)).toHaveAttribute('aria-invalid', 'true'); await expect(input(key)).toBeFocused()
          assert.equal(await rows().count(), initialCount)
        }
        await input(key).fill('字'.repeat(limit)); await expect(field('task-ai-optimize')).toBeEnabled(); await input(key).fill(original)
      }
      for (const action of ['cancel','close','Escape']) {
        if (action === 'Escape') await page.keyboard.press('Escape')
        else if (action === 'close') await dialog().getByRole('button', { name: '关闭编辑', exact: true }).last().click()
        else await field('task-edit-cancel').click()
        await confirm().waitFor(); await confirm().locator('[data-confirm-cancel]').click(); assert.equal((await read()).name, '本地新增任务')
        await field('task-edit-cancel').click(); await discard(); await expect(field('task-create-open')).toBeFocused(); assert.equal(await rows().count(), initialCount)
        await open(); await fill()
      }
      for (const key of keys) await input(key).fill('')
      await field('task-edit-cancel').click(); await dialog().waitFor({ state: 'hidden' }); await expect(confirm()).toBeHidden()
      await open(); await fill()
      const ai = field('task-ai-optimize'), cancel = field('task-edit-cancel'), submit = field('task-edit-save')
      if (primitives) { await expect(ai).toHaveClass(/eap-button--ai/); await expect(submit).toHaveClass(/eap-button--success/) }
      assert(await ai.locator('[aria-hidden=true]').count() > 0, 'Decorative AI sparkle is hidden from assistive technology')
      for (const height of width === 390 ? [844, 600] : [1000]) {
        await page.setViewportSize({ width, height })
        const geometry = await dialog().evaluate(node => ({ width: node.clientWidth, scrollWidth: node.scrollWidth, scrollers: [node, ...node.querySelectorAll('*')].filter(child => child.scrollHeight > child.clientHeight + 1 && ['auto','scroll'].includes(getComputedStyle(child).overflowY)).map(child => { child.scrollTop = child.scrollHeight; return { end: child.scrollTop, maximum: child.scrollHeight - child.clientHeight } }) }))
        assert(geometry.scrollWidth <= geometry.width + 1)
        if (primitives && width === 390 && height === 600) assert(geometry.scrollers.length > 0)
        assert(geometry.scrollers.every(scroll => scroll.end > 0 && Math.abs(scroll.end - scroll.maximum) <= 1))
        for (const control of [...keys.map(input), ai, cancel, submit]) {
          await control.scrollIntoViewIfNeeded(); await expect(control).toBeVisible()
          assert(await control.evaluate(node => { const r = node.getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth + 1 && r.y >= 0 && r.bottom <= innerHeight + 1 }))
        }
        const buttons = await Promise.all([ai, cancel, submit].map(button => button.evaluate(node => ({ text: node.textContent, background: getComputedStyle(node).backgroundColor, border: getComputedStyle(node).borderColor, box: node.getBoundingClientRect().toJSON() }))))
        assert(buttons.every(button => Math.abs(button.box.y - buttons[0].box.y) <= 2)); assert.notEqual(buttons[2].background, buttons[1].background)
        assert(buttons[0].background !== buttons[1].background || buttons[0].border !== buttons[1].border)
        await submit.focus(); await page.keyboard.press('Tab'); assert(await dialog().evaluate(node => node.contains(document.activeElement)))
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        await save(out, `create-layout-${width}-${height}.json`, { geometry, buttons }); await page.screenshot({ path: resolve(out, `create-${width}-${height}.png`) })
      }
      await field('task-edit-cancel').click(); await discard()
      checks.push({ width, required: true, name120: true, goals2000: true, invalidDisabled: true, dirtyCancelCloseEscape: true, focus: true, boundedScroll: true })
    }
    // Persist the inclusive bounds once, after both viewport validation passes.
    await open(); await input('name').fill('名'.repeat(120)); await input('goal').fill('目'.repeat(2000)); await input('acceptanceCriteria').fill('验'.repeat(2000))
    await field('task-edit-save').click(); await dialog().waitFor({ state: 'hidden' }); initialCount++
    assert.equal(await rows().count(), initialCount)
    await rows().first().getByRole('button', { name: '查看详情：' + '名'.repeat(120), exact: true }).click()
    const boundaryDetail = page.getByRole('dialog', { name: '任务详情', exact: true })
    await boundaryDetail.getByText('目'.repeat(2000), { exact: true }).waitFor(); await boundaryDetail.getByText('验'.repeat(2000), { exact: true }).waitFor(); await closeDetail()
    await open(); await fill('AI建议保留名称')
    if (realAI) {
      const before = await read(), pending = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/api/ai/task-detail/optimizations/'), { timeout: 90000 })
      await field('task-ai-optimize').click(); const response = await pending, suggestion = await response.json()
      await save(out, 'real-optimization.json', { boundary: 'REAL configured provider; no mocked response', status: response.status(), request: response.request().postDataJSON(), response: suggestion })
      assert.equal(response.status(), 200); assert.deepEqual(response.request().postDataJSON(), { goal: before.goal, acceptanceCriteria: before.acceptanceCriteria })
      for (const key of ['goal','acceptanceCriteria','connectionId','model']) assert(suggestion[key]?.trim(), key)
      await field('task-ai-adopt').waitFor(); assert.deepEqual(await read(), before); assert.equal(await rows().count(), initialCount)
      await field('task-ai-adopt').click(); assert.deepEqual(await read(), { name: before.name, goal: suggestion.goal, acceptanceCriteria: suggestion.acceptanceCriteria })
      await field('task-edit-save').dblclick(); await dialog().waitFor({ state: 'hidden' }); assert.equal(await rows().count(), initialCount + 1)
      await rows().first().getByRole('button', { name: '查看详情：' + before.name, exact: true }).click()
      const detail = page.getByRole('dialog', { name: '任务详情', exact: true })
      await detail.getByText(suggestion.goal, { exact: true }).waitFor(); await detail.getByText(suggestion.acceptanceCriteria, { exact: true }).waitFor(); await closeDetail()
      await open(); await fill('故障注入草稿')
    }
    if (faults) for (const phase of ['cancel','ABA','nameABA','close']) {
      mode = phase
      const before = await read(), seen = page.waitForRequest(request => request.method() === 'POST' && request.url().includes('/api/ai/task-detail/optimizations/'))
      await field('task-ai-optimize').click(); const request = await seen, id = request.url().split('/').at(-1)
      await expect.poll(() => gate?.id).toBe(id); const held = gate
      const deleted = page.waitForResponse(response => response.request().method() === 'DELETE' && response.url() === request.url())
      if (phase === 'cancel') await field('task-ai-cancel').click()
      if (phase === 'ABA') { await input('goal').fill(before.goal + ' B'); await input('goal').fill(before.goal) }
      if (phase === 'nameABA') { await input('name').fill(before.name + ' B'); await input('name').fill(before.name) }
      if (phase === 'close') await dialog().getByRole('button', { name: '关闭编辑', exact: true }).last().click()
      assert.equal((await deleted).status(), 204); held.release(); await held.completed; gate = undefined
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      if (phase === 'close') { await confirm().waitFor(); await confirm().locator('[data-confirm-cancel]').click() }
      assert.deepEqual(await read(), before); assert.equal(await field('task-ai-adopt').count(), 0)
    }
    await field('task-edit-cancel').click(); await discard()
    const query = scope.getByLabel('任务名称', { exact: true }).and(scope.locator(':visible')), status = scope.getByLabel('任务状态', { exact: true }).and(scope.locator(':visible'))
    await query.fill('没有匹配的新增入口'); await status.selectOption('done'); assert.equal(await rows().count(), 0)
    await field('task-create-empty').click(); await dialog().waitFor(); await fill('筛选清空后新增'); await field('task-edit-save').click(); await dialog().waitFor({ state: 'hidden' })
    assert.equal(await query.inputValue(), ''); assert.equal(await status.inputValue(), 'all')
    const first = rows().first(), firstId = await first.getAttribute('data-task-id')
    assert(firstId && /^[A-Za-z][A-Za-z0-9_-]{0,79}$/.test(firstId)); await first.getByRole('button', { name: '查看详情：筛选清空后新增', exact: true }).click()
    const detail = page.getByRole('dialog', { name: '任务详情', exact: true }); await detail.getByText(/^(规划中|计划中)$/).waitFor()
    assert.match(await detail.innerText(), /\bnone\b/i)
    assert.equal(await detail.getByText(/^(摘要|简介)$/).locator('xpath=following-sibling::*[1]').innerText(), '')
    await field('task-edit-open').click(); assert.equal(await field('task-edit-goal').inputValue(), '新增任务的目标')
    await field('task-edit-goal').fill('本地新增后的编辑目标'); await field('task-edit-save').click(); await closeDetail()
    await first.getByRole('button', { name: '查看详情：筛选清空后新增', exact: true }).click(); await field('task-edit-open').click(); assert.equal(await field('task-edit-goal').inputValue(), '本地新增后的编辑目标'); await field('task-edit-cancel').click(); await closeDetail()
    for (let count = await rows().count(); count < 30; count++) { await open(); await fill('本地容量任务 ' + count); await field('task-edit-save').click(); await dialog().waitFor({ state: 'hidden' }) }
    assert.equal(await rows().count(), 30); const ids = await rows().evaluateAll(nodes => nodes.map(node => node.getAttribute('data-task-id'))); assert.equal(new Set(ids).size, 30)
    await expect(field('task-create-open')).toBeDisabled()
    assert.equal(realCalls, realAI ? 1 : 0)
    assert(writes.every(write => /^\/api\/ai\/task-detail\/optimizations\/[a-f0-9-]{36}$/.test(write.path)), JSON.stringify(writes))
    await save(out, 'created-records.json', { count: 30, ids, firstId })
    return checks
  } finally {
    if (gate) { const response = await page.request.delete(gate.url).catch(() => null); if (response?.status() === 204) { gate.release(); await gate.completed } }
    await save(out, 'create-faults.json', faultLog); await save(out, 'create-preview-writes.json', writes)
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
    await scaffold.getByTestId('grapes-task-editable').check(); await scaffold.getByTestId('grapes-task-creatable').check(); await scaffold.getByTestId('grapes-save').click(); await page.reload(); await ready()
    const published = page.waitForResponse(response => new URL(response.url()).pathname === '/api/prototype-versions' && response.request().method() === 'POST')
    await scaffold.getByTestId('grapes-publish').click(); const response = await published; assert.equal(response.status(), 200)
    const version = await response.json(), body = JSON.parse(version.body), nodes = []
    const walk = node => { if (node.kind === 'task-list') nodes.push(node); node.children.forEach(walk) }; walk(body.schema.root)
    assert.equal(nodes.length, 1); assert.equal(nodes[0].props.editable, true); assert.equal(nodes[0].props.creatable, true); assert.deepEqual(nodes[0].props.items, items)
    assert.deepEqual(body, JSON.parse(response.request().postDataJSON().body)); assert(Object.keys(body.schema.grapesProject).length > 0)
    await save(out, 'published-version.json', version); await save(out, 'expected-publication.json', body)
    const checks = await exerciseTaskCreate(page, page.getByTestId('version-preview'), items, out)
    await page.getByTestId('prototype-create-task').click()
    const taskDialog = page.getByRole('dialog', { name: '从此版本创建任务', exact: true })
    await taskDialog.getByTestId('prototype-task-title').fill('实现任务列表本地新增')
    const taskResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/api/board/tasks/from-prototype' && response.request().method() === 'POST')
    await taskDialog.getByTestId('prototype-task-save').click(); const created = await taskResponse; assert.equal(created.status(), 200)
    const task = await created.json(); assert.equal(task.prototypeVersionId, version.id); assert.equal(task.column, 'planned')
    await page.reload(); await ready(); await scaffold.getByTestId('grapes-preview').click()
    const preview = scaffold.getByTestId('semantic-preview'); assert.equal(await preview.locator('li[data-task-id]').count(), items.length)
    for (const item of items) await preview.getByRole('button', { name: '查看详情：' + item.name, exact: true }).waitFor()
    const readback = await page.request.get(backend + '/api/prototype-versions/' + version.id); assert.equal((await readback.json()).body, version.body)
    assert.deepEqual(errors, []); await save(out, 'validation.json', { passed: true, realOptimizationCalls: 1, versionId: version.id, taskId: task.id, checks, errors })
  } catch (error) { await save(out, 'validation.json', { passed: false, error: String(error), stack: error.stack, errors }); await page?.screenshot({ path: resolve(out, 'failure.png') }).catch(() => {}); throw error }
  finally { await browser?.close(); await server.close() }
}
if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) await run(resolve(process.argv[2]))
