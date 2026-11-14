import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadPlaywright } from './playwright-runtime.mjs'

// Real Vue pages with explicitly simulated HTTP rule fixtures; no business writes reach Mock.
const { chromium } = loadPlaywright()
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
const report = []
const manifest = (id) => ({
  apiVersion: 'eap/v1',
  kind: 'RulePack',
  id,
  name: `Browser ${id}`,
  requires: { capabilities: [] },
  rules: [{ id: 'browser.check', title: 'Original title', severity: 'low' }],
})
const deferred = () => {
  let resolve
  const promise = new Promise((yes) => {
    resolve = yes
  })
  return { promise, resolve }
}
try {
  for (const [phase, port] of [
    ['before', 5187],
    ['after', 5186],
  ]) {
    const out = new URL(
      `../../../../../docs/evidence/frontend-batch/rules/${phase}/`,
      import.meta.url,
    )
    mkdirSync(out, { recursive: true })
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: 'light' })
      const errors = [],
        unexpectedWrites = [],
        writes = []
      page.on('pageerror', (error) => errors.push(error.message))
      let stored = { one: manifest('one'), two: manifest('two') }
      let holdDetail = null,
        holdSave = null
      await page.route('**/api/**', async (route) => {
        const request = route.request(),
          url = new URL(request.url()),
          method = request.method()
        const path = url.pathname.replace(/^.*\/api/, '')
        const json = (body) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(body),
          })
        if (method === 'GET' && path === '/rule-packs')
          return json({
            items: ['one', 'two'].map((id) => ({
              id,
              name: `Browser ${id}`,
              enabled: false,
              shipped: false,
              editable: true,
              revision: 1,
              ruleCount: 1,
            })),
          })
        if (method === 'GET' && path === '/rule-packs/vocabulary')
          return json({ facts: [], operators: [] })
        if (method === 'GET' && /^\/rule-packs\/(one|two)$/.test(path)) {
          const id = path.split('/').at(-1)
          if (holdDetail?.id === id) {
            const held = holdDetail
            holdDetail = null
            held.started.resolve()
            await held.release.promise
          }
          return json({ manifest: JSON.stringify(stored[id]), shipped: false, editable: true })
        }
        if (method === 'PUT' && path === '/rule-packs/one' && holdSave) {
          const held = holdSave
          holdSave = null
          const payload = request.postDataJSON()
          writes.push(payload)
          held.started.resolve()
          await held.release.promise
          stored.one = JSON.parse(payload.manifest)
          return json({ id: 'one', revision: 2 })
        }
        if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
          unexpectedWrites.push({ method, path })
          return route.abort('blockedbyclient')
        }
        return route.continue()
      })
      const row = { phase, width, simulatedHttp: true }
      const go = async () => {
        await page.goto('about:blank')
        await page.goto(`http://127.0.0.1:${port}#rules`)
        await page.locator('.list button').filter({ hasText: 'Browser one' }).waitFor()
      }
      const openOne = async () => {
        await page.locator('.list button').filter({ hasText: 'Browser one' }).click()
        await page.getByTestId('rule-open-0').waitFor()
      }
      const shot = async (name) =>
        page.screenshot({ path: new URL(`${name}-${width}.png`, out).pathname, fullPage: true })
      await go()
      await openOne()
      await page.getByRole('button', { name: '编辑 JSON 草稿', exact: true }).click()
      const raw = '{ "name": "Unapplied browser JSON"'
      await page.getByRole('textbox', { name: '规则包 JSON 草稿', exact: true }).fill(raw)
      row.rawDirty = (await page.getByText('有未保存的修改', { exact: true }).count()) > 0
      await shot('json-edited')
      await page.getByRole('button', { name: '收起 JSON 草稿', exact: true }).click()
      await page.getByRole('button', { name: '编辑 JSON 草稿', exact: true }).click()
      row.rawRetained =
        (await page
          .getByRole('textbox', { name: '规则包 JSON 草稿', exact: true })
          .inputValue()) === raw
      await shot('json-reopened')
      await page.getByTestId('rule-back').click()
      row.closePrompt = (await page.getByRole('dialog').count()) > 0
      await shot('json-return')
      assert.equal(row.rawDirty, phase === 'after')
      assert.equal(row.rawRetained, phase === 'after')
      assert.equal(row.closePrompt, phase === 'after')
      if (phase === 'after') {
        await page.getByRole('dialog').getByRole('button', { name: '取消', exact: true }).click()
        assert.equal(
          await page.getByRole('textbox', { name: '规则包 JSON 草稿', exact: true }).inputValue(),
          raw,
        )
      }

      await go()
      const held = { id: 'one', started: deferred(), release: deferred() }
      holdDetail = held
      await page.locator('.list button').filter({ hasText: 'Browser one' }).click()
      await held.started.promise
      await page.locator('.list button').filter({ hasText: 'Browser two' }).click()
      await page.getByRole('heading', { name: 'Browser two', exact: true }).waitFor()
      held.release.resolve()
      await page.waitForTimeout(250)
      row.latestSelectionRetained =
        (await page.getByRole('heading', { name: 'Browser two', exact: true }).count()) > 0
      assert.equal(row.latestSelectionRetained, phase === 'after')
      await shot('selection-race')

      await go()
      await openOne()
      await page.getByTestId('rule-open-0').click()
      await page
        .getByRole('dialog')
        .getByRole('textbox', { name: '标题', exact: true })
        .fill('Submitted browser title')
      await page.keyboard.press('Escape')
      const save = { started: deferred(), release: deferred() }
      holdSave = save
      await page.getByRole('button', { name: '保存草稿', exact: true }).click()
      await save.started.promise
      await page.getByTestId('rule-open-0').click()
      await page
        .getByRole('dialog')
        .getByRole('textbox', { name: '标题', exact: true })
        .fill('Later browser edit')
      save.release.resolve()
      await page.getByRole('button', { name: '保存草稿', exact: true }).waitFor()
      await page.waitForTimeout(350)
      row.submittedSnapshot = JSON.parse(writes.at(-1).manifest).rules[0].title
      row.laterEditRetained = await page
        .getByTestId('rule-open-0')
        .innerText()
        .then((text) => text.includes('Later browser edit'))
      row.laterEditDirty = (await page.getByText('有未保存的修改', { exact: true }).count()) > 0
      assert.equal(row.submittedSnapshot, 'Submitted browser title')
      assert.equal(row.laterEditRetained, phase === 'after')
      assert.equal(row.laterEditDirty, phase === 'after')
      await shot('save-race')
      row.overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
      row.pageErrors = errors
      row.unexpectedWrites = unexpectedWrites
      assert.deepEqual(errors, [])
      assert.deepEqual(unexpectedWrites, [])
      assert.equal(row.overflow, false)
      report.push(row)
      writeFileSync(
        new URL('results.json', out),
        JSON.stringify(
          report.filter((entry) => entry.phase === phase),
          null,
          2,
        ) + '\n',
      )
      await page.close()
    }
  }
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
} finally {
  await browser.close()
}
