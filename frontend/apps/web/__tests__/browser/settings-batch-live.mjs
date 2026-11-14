import { loadPlaywright } from './playwright-runtime.mjs'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const { chromium } = loadPlaywright()
const out = resolve('../docs/evidence/frontend-batch/settings')
const results = {
  mode: 'Actual App in Chromium; deterministic intercepted HTTP fixtures, no backend writes',
  checks: [],
  requests: [],
}
const connection = {
  id: 'catalog-fixture',
  name: 'Catalog fixture',
  kind: 'openai-compatible',
  wireApi: 'responses',
  enabled: true,
  baseUrl: 'https://example.test',
  secretPresent: true,
  defaultSelected: true,
  revision: 1,
  configurationRevision: '1',
  discoveredAt: '',
  discoveryError: '',
  models: [{ id: 'model-a', reasoningEfforts: [] }],
  allowedModels: ['model-a'],
  defaultModel: 'model-a',
}
const kinds = ['cli', 'mcp'].map((id) => ({
  id,
  label: id.toUpperCase(),
  scope: 'platform',
  scopeLabel: '平台',
  expertScoped: id === 'mcp',
  description: '',
  count: 0,
  visible: true,
  availability: {},
}))
const catalog = {
  kinds,
  items: [],
  mcpServers: [],
  mcpProductionMatrix: [],
  settings: {},
  unregistered: [],
  undeclared: [],
}
const programs = ['git', 'rg'].map((id) => ({
  id,
  name: id,
  builtin: false,
  binary: id,
  channel: { binary: id, source: 'shipped', resolvedPath: '/bin/' + id },
  operations: [],
}))
const browser = await chromium.launch({
  headless: true,
  ...(process.env.EAP_CHROMIUM ? { executablePath: process.env.EAP_CHROMIUM } : {}),
})
try {
  for (const [phase, origin] of [
    ['before', 'http://127.0.0.1:5187'],
    ['after', 'http://127.0.0.1:5186'],
  ]) {
    await mkdir(resolve(out, phase), { recursive: true })
    for (const width of [1440, 390]) {
      const context = await browser.newContext({
        viewport: { width, height: 1000 },
        colorScheme: 'light',
      })
      let pendingResolve
      let writes = 0
      let failConnectionList = false
      await context.route('**/api/**', async (route) => {
        const req = route.request(),
          path = new URL(req.url()).pathname.replace(/^\/api/, '')
        const json = (value) =>
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(value),
          })
        if (req.method() === 'GET') {
          if (path === '/ai/connections' && failConnectionList)
            return route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: JSON.stringify({
                code: 'FIXTURE_OVERVIEW_UNAVAILABLE',
                message: 'Simulated list unavailable',
              }),
            })
          if (path === '/ai/connections')
            return json({ items: [connection], effectiveDefaultId: connection.id })
          if (path === '/capabilities') return json(catalog)
          if (path === '/cli-programs') return json({ items: programs })
          return route.continue()
        }
        if (path === '/ai/connections' && req.method() === 'POST') {
          await new Promise((resolve) => {
            pendingResolve = resolve
          })
          failConnectionList = true
          results.requests.push({
            phase,
            width,
            method: 'POST',
            path,
            simulation: 'accepted fixture only; following overview read fails; no backend write',
          })
          return json({
            ...connection,
            id: 'accepted-fixture',
            name: 'Accepted connection',
            enabled: false,
          })
        }
        if (
          (path === '/mcp-servers' || /^\/cli-programs\/git\/operations\//.test(path)) &&
          req.method() === 'POST'
        ) {
          writes++
          results.requests.push({
            phase,
            width,
            method: req.method(),
            path,
            simulation: 'delayed rejection; no backend write',
          })
          await new Promise((resolve) => {
            pendingResolve = resolve
          })
          return route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              code: 'FIXTURE_WRITE_UNAVAILABLE',
              message: 'Simulated write unavailable',
            }),
          })
        }
        results.requests.push({ phase, width, method: req.method(), path, blocked: true })
        return route.abort('blockedbyclient')
      })
      const page = await context.newPage()
      const shot = (name) =>
        page.screenshot({
          animations: 'disabled',
          path: resolve(out, phase, `${name}-${width}.png`),
        })
      const go = async (view) => {
        await page.goto(origin + '?settingsBatch=' + Date.now() + '#' + view)
        await page.locator('main').waitFor()
        if (view === 'model-settings') await page.locator('.connection-cards li').first().waitFor()
        if (view === 'capabilities')
          await page.getByRole('tab', { name: 'MCP', exact: true }).waitFor()
      }
      const dialog = () => page.locator('.eap-dialog[role="dialog"]').last()
      await go('model-settings')
      await page
        .locator('.connection-cards')
        .getByRole('button', { name: /管理模型/ })
        .click()
      await page.locator('.catalog-model > label input').uncheck()
      await page
        .locator('.model-catalog .catalog-actions')
        .last()
        .getByRole('button', { name: '关闭', exact: true })
        .click()
      await page.waitForTimeout(100)
      assert.equal(await page.locator('.eap-confirm').count(), phase === 'after' ? 1 : 0)
      await shot('catalog-close')
      if (phase === 'after') {
        await page.locator('[data-confirm-cancel]').click()
        assert.equal(await page.locator('.catalog-model > label input').isChecked(), false)
        await page.evaluate(() => {
          location.hash = 'appearance'
        })
        await page.locator('.eap-confirm').waitFor()
        await shot('catalog-navigation')
        await page.locator('.eap-confirm__actions button').first().click()
        await page.locator('[data-testid="appearance-settings"]').waitFor()
        assert.equal(new URL(page.url()).hash, '#appearance')
      }
      results.checks.push({
        phase,
        width,
        scenario: 'catalog dirty close + after navigation discard callback',
        passed: true,
      })
      await go('capabilities')
      await page.getByRole('tab', { name: 'MCP', exact: true }).click()
      await page.getByRole('button', { name: '＋ 登记服务器', exact: true }).click()
      await dialog().locator('input').nth(0).fill('fixture-mcp')
      await dialog().locator('input').nth(1).fill('Fixture MCP')
      await dialog().getByRole('button', { name: '取消', exact: true }).click()
      await page.waitForTimeout(100)
      assert.equal(await page.locator('.eap-confirm').count(), phase === 'after' ? 1 : 0)
      await shot('mcp-close')
      if (phase === 'after') await page.locator('[data-confirm-cancel]').click()
      else {
        await page.getByRole('button', { name: '＋ 登记服务器', exact: true }).click()
        await dialog().locator('input').nth(0).fill('fixture-mcp')
      }
      await dialog().getByRole('button', { name: '登记服务器', exact: true }).click()
      await page.waitForTimeout(100)
      assert.equal(
        await dialog().getByRole('button', { name: '取消', exact: true }).isDisabled(),
        phase === 'after',
      )
      assert.equal(
        await dialog().getByRole('button', { name: '登记服务器', exact: true }).isDisabled(),
        phase === 'after',
      )
      await shot('mcp-pending')
      pendingResolve()
      pendingResolve = undefined
      await page.waitForTimeout(200)
      if (phase === 'after') {
        await dialog().locator('.eap-feedback--error').waitFor()
        assert.equal(await dialog().locator('input').first().inputValue(), 'fixture-mcp')
        await shot('mcp-failure')
      }
      assert.equal(writes, 1)
      results.checks.push({
        phase,
        width,
        scenario: 'MCP close guard, pending lock, after inline failure retention',
        passed: true,
      })
      // Fresh navigation closes current dialog without any application mutation.
      await go('capabilities')
      await page.getByRole('tab', { name: 'CLI', exact: true }).click()
      const binary = page.getByRole('textbox', { name: 'git 二进制位置', exact: true })
      await binary.fill('/custom/git')
      await page.getByRole('tab', { name: 'MCP', exact: true }).click()
      assert.equal(await page.locator('.eap-dialog').count(), 0)
      await page.getByRole('tab', { name: 'CLI', exact: true }).click()
      assert.equal(await binary.inputValue(), phase === 'after' ? '/custom/git' : '')
      const cliCard = page.locator('article').filter({ has: binary }).first()
      await cliCard.scrollIntoViewIfNeeded()
      if (phase === 'after' && width === 390) {
        const sizes = await cliCard
          .locator('header')
          .first()
          .locator('button')
          .evaluateAll((nodes) =>
            nodes.map((node) => ({
              width: node.getBoundingClientRect().width,
              height: node.getBoundingClientRect().height,
            })),
          )
        assert(
          sizes.every((size) => size.width >= 60 && size.height <= 48),
          'CLI actions remain readable without vertical character wrapping',
        )
      }
      await shot('cli-retained-path')
      await page.getByRole('button', { name: '＋ 增加操作', exact: true }).first().click()
      await dialog().getByRole('textbox', { name: '能力标识', exact: true }).fill('git-fixture')
      await dialog()
        .getByRole('textbox', { name: '操作名称', exact: true })
        .fill('Fixture operation')
      await dialog().getByRole('button', { name: '保存操作', exact: true }).click()
      await page.waitForTimeout(100)
      assert.equal(
        await dialog().getByRole('button', { name: '取消', exact: true }).isDisabled(),
        phase === 'after',
      )
      await shot('cli-pending')
      pendingResolve()
      pendingResolve = undefined
      await dialog().locator('.eap-feedback--error').waitFor()
      if (phase === 'after') {
        await dialog().getByRole('button', { name: '取消', exact: true }).click()
        await page.getByRole('button', { name: '＋ 增加操作', exact: true }).first().click()
        await dialog()
          .getByRole('textbox', { name: '能力标识', exact: true })
          .fill('retained-operation')
        // Switch using hash-independent tabs: teleported forms must hide while draft remains.
        await page.evaluate(() =>
          [...document.querySelectorAll('[role="tab"]')]
            .find((node) => node.textContent.trim() === 'MCP')
            .click(),
        )
        assert.equal(await page.locator('.eap-dialog').count(), 0)
        await page.getByRole('tab', { name: 'CLI', exact: true }).click()
        await dialog().waitFor()
        assert.equal(
          await dialog().getByRole('textbox', { name: '能力标识', exact: true }).inputValue(),
          'retained-operation',
        )
        await page.evaluate(() => {
          location.hash = 'appearance'
        })
        await page.locator('[data-testid="appearance-settings"]').waitFor()
        await page.waitForTimeout(100)
        assert.equal(await page.locator('.eap-dialog:visible').count(), 0)
        await shot('cli-navigation-no-ghost')
        await page.evaluate(() => {
          location.hash = 'capabilities'
        })
        await dialog().waitFor()
        assert.equal(
          await dialog().getByRole('textbox', { name: '能力标识', exact: true }).inputValue(),
          'retained-operation',
        )
      }
      results.checks.push({
        phase,
        width,
        scenario: 'CLI tab preserves binary draft; pending operation locks close; failure retained',
        passed: true,
      })
      await go('model-settings')
      await page.locator('.connection-list-heading button').click()
      await page.locator('.connection-form input').first().fill('Accepted connection')
      await page.locator('.connection-form input[type="password"]').fill('temporary-fixture-secret')
      await page.locator('.connection-form button[type="submit"]').click()
      await page.waitForTimeout(100)
      const connectionFieldsLocked = await page
        .locator('.connection-form input, .connection-form select')
        .evaluateAll((fields) => fields.length === 7 && fields.every((field) => field.disabled))
      assert.equal(connectionFieldsLocked, phase === 'after')
      await shot('connection-pending')
      pendingResolve()
      pendingResolve = undefined
      await page.locator('.model-catalog').waitFor()
      await page.waitForTimeout(100)
      assert.equal(await page.locator('.connection-form').count(), phase === 'after' ? 0 : 1)
      if (phase === 'after') {
        await page.getByText(/无需再次创建/).waitFor()
        assert.equal(await page.locator('.connection-cards li').count(), 2)
      }
      await shot('connection-accepted-read-failure')
      results.checks.push({
        phase,
        width,
        scenario:
          'accepted connection save then overview failure settles editor and retains accepted identity after fix',
        passed: true,
      })
      await context.close()
    }
  }
  assert.equal(
    results.requests.some((r) => r.blocked),
    false,
  )
} finally {
  await browser.close()
  await writeFile(resolve(out, 'results.json'), JSON.stringify(results, null, 2))
}
process.stdout.write(JSON.stringify(results, null, 2) + '\n')
